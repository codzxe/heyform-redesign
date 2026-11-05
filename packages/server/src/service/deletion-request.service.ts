import { DeleteObjectCommand } from '@aws-sdk/client-s3'
import { FieldKindEnum } from '@myform/shared-types-enums'
import { InjectQueue } from '@nestjs/bull'
import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Queue } from 'bull'
import { promises as fs } from 'fs'
import { Model } from 'mongoose'
import { basename, resolve } from 'path'

import { AuditService } from './audit.service'
import { FormService } from './form.service'
import { RedisService } from './redis.service'
import { TeamService } from './team.service'
import { getS3Client, isS3Configured } from '@config'
import { APP_HOMEPAGE_URL, UPLOAD_DIR } from '@environments'
import {
  AnalyticsEventModel,
  AuditActorTypeEnum,
  ConsentRecordModel,
  DeletionRequestModel,
  DeletionRequestStatusEnum,
  DeletionRequestTypeEnum,
  MediaAssetModel,
  ResponseSessionModel,
  SubmissionModel,
  TeamRoleEnum,
  UserModel
} from '@model'
import { helper, timestamp } from '@myform/utils'
import { md5 } from '@utils'

// Public, unauthenticated endpoint: bound how often one requester IP may file
// requests, and how many requests a single form can accumulate per day.
const PUBLIC_REQUESTS_PER_IP_PER_DAY = 5
const PUBLIC_REQUESTS_PER_FORM_PER_DAY = 100

// Erasure walks collections in _id batches so memory stays bounded on forms
// with very large response sets.
const ERASURE_BATCH_SIZE = 500

// Objects uploaded by this deployment are served from this prefix (see the
// upload controller); anything behind it lives in UPLOAD_DIR on local disk.
const LOCAL_UPLOAD_URL_PREFIX = `${APP_HOMEPAGE_URL.replace(/\/+$/, '')}/static/upload/`

/** The minimum a media asset must expose to have its stored object erased. */
export interface ErasableMediaAsset {
  _id?: any
  id?: string
  bucket?: string
  key?: string
  url?: string
}

export interface ErasureCounts {
  submissions: number
  mediaAssets: number
  consentRecords: number
  responseSessions: number
  analyticsEvents: number
}

export function emptyErasureCounts(): ErasureCounts {
  return {
    submissions: 0,
    mediaAssets: 0,
    consentRecords: 0,
    responseSessions: 0,
    analyticsEvents: 0
  }
}

export interface CreateDeletionRequestOptions {
  formId: string
  type: string
  payload?: Record<string, any>
}

async function eraseMediaStorageObject(asset: ErasableMediaAsset): Promise<void> {
  if (helper.isValid(asset.bucket) && helper.isValid(asset.key) && isS3Configured()) {
    await getS3Client().send(
      new DeleteObjectCommand({
        Bucket: asset.bucket,
        Key: asset.key
      })
    )
    return
  }

  if (helper.isString(asset.url) && asset.url.startsWith(LOCAL_UPLOAD_URL_PREFIX)) {
    const filename = basename(decodeURIComponent(asset.url.slice(LOCAL_UPLOAD_URL_PREFIX.length)))

    if (helper.isEmpty(filename)) {
      return
    }

    try {
      await fs.unlink(resolve(UPLOAD_DIR, filename))
    } catch (error) {
      // A file that is already gone is a successful erasure; anything else
      // must fail the job so it can be retried.
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        throw error
      }
    }
  }
}

/**
 * Deletes the stored objects behind media assets (S3 object or local upload
 * file) and then the database records. Returns how many records were removed.
 * Shared by the deletion-request worker and the retention purge.
 */
export async function eraseMediaAssets(
  mediaAssetModel: Model<MediaAssetModel>,
  assets: ErasableMediaAsset[]
): Promise<number> {
  if (assets.length < 1) {
    return 0
  }

  for (const asset of assets) {
    await eraseMediaStorageObject(asset)
  }

  const result = await mediaAssetModel.deleteMany({
    _id: {
      $in: assets.map(asset => asset._id ?? asset.id)
    }
  })
  return result.deletedCount ?? 0
}

/** Erases every media asset matching the filter, in bounded _id batches. */
export async function purgeMediaAssets(
  mediaAssetModel: Model<MediaAssetModel>,
  filter: Record<string, any>
): Promise<number> {
  let deleted = 0
  let lastId: any = null

  for (;;) {
    const batch = await mediaAssetModel
      .find(lastId === null ? filter : { ...filter, _id: { $gt: lastId } })
      .select({ _id: 1, bucket: 1, key: 1, url: 1 })
      .sort({ _id: 1 })
      .limit(ERASURE_BATCH_SIZE)
      .lean()

    if (batch.length < 1) {
      break
    }

    deleted += await eraseMediaAssets(mediaAssetModel, batch as ErasableMediaAsset[])
    lastId = batch[batch.length - 1]._id

    if (batch.length < ERASURE_BATCH_SIZE) {
      break
    }
  }

  return deleted
}

/**
 * GDPR right-to-erasure requests. Respondents file requests through a public
 * endpoint (identified by an email, an anonymous id or submission ids); team
 * admins approve or reject them, and an approved request is executed by the
 * DeletionRequestQueue worker, which really deletes submissions, their media
 * objects, consent records and saved response sessions, and writes an audit
 * event with the counts.
 */
@Injectable()
export class DeletionRequestService {
  constructor(
    @InjectModel(DeletionRequestModel.name)
    private readonly deletionRequestModel: Model<DeletionRequestModel>,
    @InjectModel(SubmissionModel.name)
    private readonly submissionModel: Model<SubmissionModel>,
    @InjectModel(MediaAssetModel.name)
    private readonly mediaAssetModel: Model<MediaAssetModel>,
    @InjectModel(ConsentRecordModel.name)
    private readonly consentRecordModel: Model<ConsentRecordModel>,
    @InjectModel(ResponseSessionModel.name)
    private readonly responseSessionModel: Model<ResponseSessionModel>,
    @InjectModel(AnalyticsEventModel.name)
    private readonly analyticsEventModel: Model<AnalyticsEventModel>,
    private readonly formService: FormService,
    private readonly auditService: AuditService,
    private readonly redisService: RedisService,
    private readonly teamService: TeamService,
    @InjectQueue('DeletionRequestQueue')
    private readonly deletionRequestQueue: Queue
  ) {}

  /**
   * Public entry point. The form must exist and be accepting responses, the
   * requester is rate limited per IP and per form, and the result is always a
   * generic success: it never reveals whether the form holds matching data.
   */
  async createFromPublic(input: CreateDeletionRequestOptions, ip: string): Promise<boolean> {
    const form = await this.formService.findById(input.formId)

    if (!form || form.suspended || form.settings?.active !== true) {
      throw new BadRequestException('The form is not available')
    }

    // The md5 hash keeps raw addresses out of redis keys, exactly like the
    // upload controller's throttlers.
    await this.redisService.throttler(`delreq:${md5(ip)}`, PUBLIC_REQUESTS_PER_IP_PER_DAY, '24h')
    await this.redisService.throttler(
      `delreq:form:${form.id}`,
      PUBLIC_REQUESTS_PER_FORM_PER_DAY,
      '24h'
    )

    const type = input.type as DeletionRequestTypeEnum
    const requestPayload = this.normalizeRequestPayload(type, input.payload ?? {})

    const request = await this.deletionRequestModel.create({
      teamId: form.teamId,
      formId: form.id,
      type,
      status: DeletionRequestStatusEnum.PENDING,
      requestPayload
    })

    // The payload (and the email in it) stays on the request for the admin to
    // review; the audit entry only references the request.
    await this.auditService.record({
      teamId: form.teamId,
      formId: form.id,
      actorType: AuditActorTypeEnum.RESPONDENT,
      action: 'deletion.requested',
      target: {
        requestId: String(request.id),
        type
      },
      ip
    })

    return true
  }

  /** Every deletion request of the team, newest first. */
  async list(teamId: string): Promise<DeletionRequestModel[]> {
    return this.deletionRequestModel.find({ teamId }).sort({ createdAt: -1 })
  }

  async findById(id: string): Promise<DeletionRequestModel | null> {
    return this.deletionRequestModel.findById(id)
  }

  /**
   * Admin decision on a pending request. The acting user must be an owner or
   * admin of the workspace the request belongs to — the request's own teamId
   * is authoritative, never a client-supplied one. Approving enqueues the
   * erasure worker; rejecting closes the request with a note.
   */
  async process(
    id: string,
    approve: boolean,
    note: string | undefined,
    processedByUser: UserModel
  ): Promise<boolean> {
    const request = await this.deletionRequestModel.findById(id)

    if (!request) {
      throw new BadRequestException('The deletion request does not exist')
    }

    await this.assertTeamAdmin(request.teamId, processedByUser)

    if (request.status !== DeletionRequestStatusEnum.PENDING) {
      throw new BadRequestException('The deletion request has already been processed')
    }

    // The status condition makes the state transition race-safe when two
    // admins decide at the same moment.
    const updates: Record<string, any> = {
      status: approve ? DeletionRequestStatusEnum.PROCESSING : DeletionRequestStatusEnum.REJECTED,
      processedBy: processedByUser.id
    }

    if (!approve) {
      updates.processedAt = timestamp()
      updates.resultNote = helper.isValid(note) ? note : 'The deletion request was rejected'
    }

    const result = await this.deletionRequestModel.updateOne(
      {
        _id: id,
        status: DeletionRequestStatusEnum.PENDING
      },
      updates
    )

    if ((result.matchedCount ?? 0) < 1) {
      throw new BadRequestException('The deletion request has already been processed')
    }

    if (approve) {
      await this.deletionRequestQueue.add({
        requestId: String(request.id)
      })
    }

    await this.auditService.record({
      teamId: request.teamId,
      formId: request.formId,
      actorType: AuditActorTypeEnum.USER,
      actorId: processedByUser.id,
      action: approve ? 'deletion.approved' : 'deletion.rejected',
      target: {
        requestId: String(request.id),
        type: request.type
      },
      meta: helper.isValid(note) ? { note } : undefined
    })

    return true
  }

  /**
   * The erasure worker. Deletes the requested data for real — database
   * records and the storage objects behind media answers — then closes the
   * request and audits the counts. Idempotent: a completed request is never
   * executed again, and every delete is a no-op once the data is gone, so
   * queue retries are safe.
   */
  async execute(requestId: string): Promise<void> {
    const request = await this.deletionRequestModel.findById(requestId)

    if (!request) {
      throw new Error(`The deletion request ${requestId} does not exist`)
    }

    if (request.status === DeletionRequestStatusEnum.COMPLETED) {
      return
    }

    let counts: ErasureCounts

    if (request.type === DeletionRequestTypeEnum.RESPONDENT_DATA) {
      counts = await this.eraseRespondentData(request)
    } else if (request.type === DeletionRequestTypeEnum.FORM_DATA) {
      counts = await this.eraseFormData(request)
    } else {
      // Account erasure is owned by the authenticated account-deletion flow;
      // this worker never fakes a completion for it.
      throw new BadRequestException('This deletion request type is not executed by this worker')
    }

    const resultNote =
      `Deleted ${counts.submissions} submissions, ${counts.mediaAssets} media assets, ` +
      `${counts.consentRecords} consent records, ${counts.responseSessions} response sessions, ` +
      `${counts.analyticsEvents} analytics events`

    await this.deletionRequestModel.updateOne(
      {
        _id: requestId
      },
      {
        status: DeletionRequestStatusEnum.COMPLETED,
        processedAt: timestamp(),
        resultNote
      }
    )

    await this.auditService.record({
      teamId: request.teamId,
      formId: request.formId,
      actorType: AuditActorTypeEnum.SYSTEM,
      action: 'deletion.executed',
      target: {
        requestId: String(request.id),
        type: request.type
      },
      meta: counts
    })
  }

  /** Deletes the stored objects and records of the given media assets. */
  async deleteMediaObjects(assets: ErasableMediaAsset[]): Promise<number> {
    return eraseMediaAssets(this.mediaAssetModel, assets)
  }

  private async assertTeamAdmin(teamId: string, user: UserModel): Promise<void> {
    const team = await this.teamService.findById(teamId)

    if (!team) {
      throw new BadRequestException("You don't have permission to access the workspace")
    }

    const member = await this.teamService.findMemberById(teamId, user.id)
    const isAdmin =
      team.ownerId === user.id ||
      member?.role === TeamRoleEnum.OWNER ||
      member?.role === TeamRoleEnum.ADMIN

    if (!isAdmin) {
      throw new BadRequestException("You don't have permission to manage deletion requests")
    }
  }

  private normalizeRequestPayload(
    type: DeletionRequestTypeEnum,
    payload: Record<string, any>
  ): Record<string, any> {
    const normalized: Record<string, any> = {}

    const email = helper.isString(payload.email) ? payload.email.trim() : ''

    if (email.length > 0) {
      if (!helper.isEmail(email)) {
        throw new BadRequestException('The email address is not valid')
      }
      normalized.email = email.toLowerCase()
    }

    const anonymousId = helper.isString(payload.anonymousId) ? payload.anonymousId.trim() : ''

    if (anonymousId.length > 0) {
      normalized.anonymousId = anonymousId
    }

    if (helper.isArray(payload.submissionIds)) {
      const submissionIds = payload.submissionIds
        .filter(id => helper.isString(id) && id.trim().length > 0)
        .map(id => id.trim())

      if (submissionIds.length > 0) {
        normalized.submissionIds = submissionIds
      }
    }

    if (
      type === DeletionRequestTypeEnum.RESPONDENT_DATA &&
      helper.isEmpty(normalized.email) &&
      helper.isEmpty(normalized.anonymousId) &&
      helper.isEmpty(normalized.submissionIds)
    ) {
      throw new BadRequestException(
        'A respondent data deletion request must identify at least one response'
      )
    }

    return normalized
  }

  /**
   * Erases the responses of one respondent: every submission of the form whose
   * email answer matches the requested address and/or whose id was listed,
   * each submission's media objects and consent records, and the respondent's
   * saved sessions. Submissions are matched regardless of their status —
   * private and spam responses are personal data too.
   */
  private async eraseRespondentData(request: DeletionRequestModel): Promise<ErasureCounts> {
    const counts = emptyErasureCounts()
    const payload = request.requestPayload ?? {}

    const email = helper.isString(payload.email) ? payload.email.trim() : ''
    const anonymousId = helper.isString(payload.anonymousId) ? payload.anonymousId.trim() : ''
    const submissionIds = helper.isValidArray(payload.submissionIds)
      ? payload.submissionIds.filter(id => helper.isString(id))
      : []

    if (!request.formId) {
      return counts
    }

    const matchers: Record<string, any>[] = []

    if (email.length > 0) {
      // Email answers store the address as the answer value. Requests are
      // normalized to lowercase on creation; both spellings are matched so
      // requests created before that still erase everything.
      const candidates = Array.from(new Set([email, email.toLowerCase()]))
      matchers.push({
        formId: request.formId,
        answers: {
          $elemMatch: {
            kind: FieldKindEnum.EMAIL,
            value: {
              $in: candidates
            }
          }
        }
      })
    }

    if (submissionIds.length > 0) {
      matchers.push({
        formId: request.formId,
        _id: {
          $in: submissionIds
        }
      })
    }

    if (matchers.length > 0) {
      const filter = matchers.length === 1 ? matchers[0] : { $or: matchers }

      let lastId: any = null

      for (;;) {
        const batchFilter =
          lastId === null ? filter : { ...filter, _id: { ...(filter._id || {}), $gt: lastId } }
        const batch = await this.submissionModel
          .find(batchFilter)
          .select({ _id: 1 })
          .sort({ _id: 1 })
          .limit(ERASURE_BATCH_SIZE)
          .lean()

        if (batch.length < 1) {
          break
        }

        const ids = batch.map(row => row._id)

        counts.mediaAssets += await purgeMediaAssets(this.mediaAssetModel, {
          formId: request.formId,
          submissionId: {
            $in: ids
          }
        })

        const consentResult = await this.consentRecordModel.deleteMany({
          formId: request.formId,
          submissionId: {
            $in: ids
          }
        })
        counts.consentRecords += consentResult.deletedCount ?? 0

        const submissionResult = await this.submissionModel.deleteMany({
          formId: request.formId,
          _id: {
            $in: ids
          }
        })
        counts.submissions += submissionResult.deletedCount ?? 0

        lastId = ids[ids.length - 1]

        if (batch.length < ERASURE_BATCH_SIZE) {
          break
        }
      }
    }

    if (anonymousId.length > 0) {
      const sessionResult = await this.responseSessionModel.deleteMany({
        formId: request.formId,
        anonymousId
      })
      counts.responseSessions += sessionResult.deletedCount ?? 0
    }

    return counts
  }

  /**
   * Erases every response of the form — submissions, media objects, consent
   * records, saved sessions and analytics events — but never the form itself.
   */
  private async eraseFormData(request: DeletionRequestModel): Promise<ErasureCounts> {
    const counts = emptyErasureCounts()

    if (!request.formId) {
      return counts
    }

    counts.mediaAssets += await purgeMediaAssets(this.mediaAssetModel, {
      formId: request.formId
    })

    const consentResult = await this.consentRecordModel.deleteMany({
      formId: request.formId
    })
    counts.consentRecords = consentResult.deletedCount ?? 0

    const sessionResult = await this.responseSessionModel.deleteMany({
      formId: request.formId
    })
    counts.responseSessions = sessionResult.deletedCount ?? 0

    const eventResult = await this.analyticsEventModel.deleteMany({
      formId: request.formId
    })
    counts.analyticsEvents += eventResult.deletedCount ?? 0

    // Submissions go last: by then nothing references them anymore.
    const submissionResult = await this.submissionModel.deleteMany({
      formId: request.formId
    })
    counts.submissions = submissionResult.deletedCount ?? 0

    return counts
  }
}
