import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'

import { AuditService } from './audit.service'
import { ErasureCounts, emptyErasureCounts, purgeMediaAssets } from './deletion-request.service'
import { FormModel, TeamModel } from '@model'
import {
  AnalyticsEventModel,
  AuditActorTypeEnum,
  ConsentRecordModel,
  MediaAssetModel,
  ResponseSessionModel,
  SubmissionModel
} from '@model'
import { helper, timestamp } from '@myform/utils'

const SECONDS_PER_DAY = 24 * 60 * 60

// Deletion batches are bounded so a form with millions of responses never
// loads more than one batch of ids into memory.
const RETENTION_BATCH_SIZE = 500

export interface RetentionSummary extends ErasureCounts {
  formsScanned: number
  formsPurged: number
}

function readRetentionDays(value: any): number | undefined {
  if (!helper.isNumber(value) || !Number.isSafeInteger(value) || value < 1) {
    return undefined
  }

  return value
}

/**
 * GDPR data retention. Every form may carry settings.retentionDays; responses
 * older than that many days are purged — submissions, their media objects,
 * consent records, expired saved sessions and analytics events. The form
 * itself is never deleted here: whole-form retention (FormModel.retentionAt,
 * the trash flow) is owned by the DeleteFormInTrashSchedule.
 */
@Injectable()
export class RetentionService {
  constructor(
    @InjectModel(FormModel.name)
    private readonly formModel: Model<FormModel>,
    @InjectModel(TeamModel.name)
    private readonly teamModel: Model<TeamModel>,
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
    private readonly auditService: AuditService
  ) {}

  /**
   * Applies retention to every form. Returns the purge summary for the daily
   * schedule to log. A form is only audited when the purge actually removed
   * something.
   */
  async applyRetention(): Promise<RetentionSummary> {
    const summary: RetentionSummary = {
      formsScanned: 0,
      formsPurged: 0,
      ...emptyErasureCounts()
    }

    const forms = (await this.formModel
      .find({})
      .select({
        teamId: 1,
        'settings.retentionDays': 1
      })
      .lean()) as any[]

    summary.formsScanned = forms.length

    if (forms.length < 1) {
      return summary
    }

    const teamRetentionDays = await this.loadTeamRetentionDays()

    for (const form of forms) {
      const formId = String(form._id)
      const teamId = helper.isString(form.teamId) ? form.teamId : undefined

      // A form's own setting always wins; otherwise the workspace default
      // applies (TeamModel does not define a settings field today, so the
      // fallback only kicks in once teams grow one).
      const days =
        readRetentionDays(form.settings?.retentionDays) ??
        (teamId ? teamRetentionDays.get(teamId) : undefined)

      if (days === undefined) {
        continue
      }

      const cutoff = timestamp() - days * SECONDS_PER_DAY

      if (cutoff <= 0) {
        continue
      }

      const counts = await this.purgeFormResponses(formId, cutoff)

      const purged =
        counts.submissions > 0 ||
        counts.mediaAssets > 0 ||
        counts.consentRecords > 0 ||
        counts.responseSessions > 0 ||
        counts.analyticsEvents > 0

      if (!purged) {
        continue
      }

      summary.formsPurged += 1
      summary.submissions += counts.submissions
      summary.mediaAssets += counts.mediaAssets
      summary.consentRecords += counts.consentRecords
      summary.responseSessions += counts.responseSessions
      summary.analyticsEvents += counts.analyticsEvents

      await this.auditService.record({
        teamId,
        formId,
        actorType: AuditActorTypeEnum.SYSTEM,
        action: 'retention.purged',
        target: {
          formId
        },
        meta: {
          retentionDays: days,
          cutoff,
          ...counts
        }
      })
    }

    return summary
  }

  private async loadTeamRetentionDays(): Promise<Map<string, number>> {
    const teams = (await this.teamModel.find({}).select({ settings: 1 }).lean()) as any[]
    const defaults = new Map<string, number>()

    for (const team of teams) {
      const days = readRetentionDays(team?.settings?.retentionDays)

      if (days !== undefined) {
        defaults.set(String(team._id), days)
      }
    }

    return defaults
  }

  /**
   * Deletes everything of the form that outlived the cutoff: submissions
   * completed (or created, when endAt is absent) before it, their media
   * objects and consent records, expired saved sessions and old analytics
   * events.
   */
  private async purgeFormResponses(formId: string, cutoff: number): Promise<ErasureCounts> {
    const counts = emptyErasureCounts()

    const submissionFilter = {
      formId,
      $or: [
        {
          endAt: {
            $lt: cutoff
          }
        },
        {
          endAt: {
            $exists: false
          },
          createdAt: {
            $lt: new Date(cutoff * 1000)
          }
        }
      ]
    }

    let lastId: any = null

    for (;;) {
      const batchFilter =
        lastId === null ? submissionFilter : { ...submissionFilter, _id: { $gt: lastId } }
      const batch = await this.submissionModel
        .find(batchFilter)
        .select({ _id: 1 })
        .sort({ _id: 1 })
        .limit(RETENTION_BATCH_SIZE)
        .lean()

      if (batch.length < 1) {
        break
      }

      const ids = batch.map(row => row._id)

      counts.mediaAssets += await purgeMediaAssets(this.mediaAssetModel, {
        formId,
        submissionId: {
          $in: ids
        }
      })

      const consentResult = await this.consentRecordModel.deleteMany({
        formId,
        submissionId: {
          $in: ids
        }
      })
      counts.consentRecords += consentResult.deletedCount ?? 0

      const submissionResult = await this.submissionModel.deleteMany({
        formId,
        _id: {
          $in: ids
        }
      })
      counts.submissions += submissionResult.deletedCount ?? 0

      lastId = ids[ids.length - 1]

      if (batch.length < RETENTION_BATCH_SIZE) {
        break
      }
    }

    const sessionResult = await this.responseSessionModel.deleteMany({
      formId,
      expiresAt: {
        $lt: cutoff
      }
    })
    counts.responseSessions = sessionResult.deletedCount ?? 0

    const eventResult = await this.analyticsEventModel.deleteMany({
      formId,
      ts: {
        $lt: cutoff
      }
    })
    counts.analyticsEvents = eventResult.deletedCount ?? 0

    return counts
  }
}
