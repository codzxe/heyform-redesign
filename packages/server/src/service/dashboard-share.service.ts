import {
  CHOICES_FIELD_KINDS,
  FieldKindEnum,
  FormField,
  QUESTION_FIELD_KINDS,
  RATING_FIELD_KINDS
} from '@myform/shared-types-enums'
import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { createHash } from 'crypto'
import { Model } from 'mongoose'

import {
  BreakdownItemType,
  DASHBOARD_SHARE_METRICS,
  DashboardShareType,
  FormHeatmapItemType,
  MediaCountsType,
  QuizAnalyticsType,
  TrendPointType
} from '../common/graphql/analytics.graphql'
import { AnalyticsQueryService, rangeStartAt } from './analytics-query.service'
import { FormService } from './form.service'
import { RedisService } from './redis.service'
import { APP_HOMEPAGE_URL } from '@environments'
import {
  DashboardShareModel,
  FormAnalyticRangeEnum,
  FormModel,
  SubmissionModel,
  formAnalyticCacheKey,
  getFormAnalyticCacheGeneration
} from '@model'
import { OTHER_CHOICE_LABEL, flattenFields, htmlUtils } from '@myform/answer-utils'
import { helper, nanoid, parseJson, timestamp } from '@myform/utils'

export const DASHBOARD_SHARE_TOKEN_LENGTH = 36
export const MAX_DASHBOARD_SHARE_EXPIRATION_DAYS = 365
const SECONDS_PER_DAY = 24 * 60 * 60

// The window the public dashboard presents. Shares are meant for recent
// activity snapshots, not permanent full-data exports.
const PUBLIC_DASHBOARD_RANGE = FormAnalyticRangeEnum.MONTH

// Same lifetime as the overview and heatmap caches
const QUESTIONS_CACHE_TTL = '10m'

export function hashDashboardShareToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function dashboardShareUrl(token: string): string {
  return `${APP_HOMEPAGE_URL.replace(/\/+$/, '')}/analytics/share/${token}`
}

/**
 * One question of the public 'questions' metric group: aggregate counts and
 * option distributions only — never answer text, never anything that could
 * identify a respondent.
 */
export interface PublicQuestionStatsType {
  // Plain-text question title, resolved from the form's fields
  title: string

  // Responses of the range that answered this question
  responses: number

  // Share of the range's completed responses that answered, 0-100
  completionRate?: number

  // Answer counts per option. Only questions with enumerable answers (choice,
  // yes/no, rating) carry a distribution; free-text questions do not.
  distribution?: Array<{ label: string; count: number }>
}

/**
 * A heatmap row of the public 'heatmap' group, enriched with the question's
 * title: the public page has no form at hand to map fieldId → title itself.
 */
export interface PublicHeatmapItemType extends FormHeatmapItemType {
  title: string
}

export interface PublicDashboardData {
  formName: string
  range: FormAnalyticRangeEnum
  // Which metric groups this share permits
  metrics: string[]

  // 'overview' group: aggregate totals, rates and breakdowns. Never any
  // respondent-identifying data.
  totalVisits?: number
  totalResponses?: number
  completionRate?: number
  abandonmentRate?: number
  avgCompletionTimeSeconds?: number
  deviceBreakdown?: BreakdownItemType[]
  browserBreakdown?: BreakdownItemType[]
  mediaCounts?: MediaCountsType
  quiz?: QuizAnalyticsType | null

  // 'trends' group
  responseTrend?: TrendPointType[]

  // 'questions' group
  questions?: PublicQuestionStatsType[]

  // 'heatmap' group
  heatmap?: PublicHeatmapItemType[]
}

// Raw rows of the question aggregation. Labels and titles are attached
// afterwards, from the live form, so cached counts never go stale on edits.
interface QuestionAnsweredRow {
  _id: string
  responses: number
}

interface QuestionOptionRow {
  _id: {
    fieldId: string
    optionId: string
  }
  count: number
}

interface QuestionScaleRow {
  _id: {
    fieldId: string
    value: number | string
  }
  count: number
}

interface QuestionOtherRow {
  _id: string
  count: number
}

interface QuestionFacet {
  answered: QuestionAnsweredRow[]
  single: QuestionOptionRow[]
  picked: QuestionOptionRow[]
  scales: QuestionScaleRow[]
  others: QuestionOtherRow[]
  responses: Array<{ responses: number }>
}

const EMPTY_QUESTION_FACET: QuestionFacet = {
  answered: [],
  single: [],
  picked: [],
  scales: [],
  others: [],
  responses: []
}

/** fieldId → count maps of the option and scale rows, keyed per question */
interface QuestionFacetCounts {
  answered: Map<string, number>
  single: Map<string, Map<string, number>>
  picked: Map<string, Map<string, number>>
  scales: Map<string, Array<{ value: number; count: number }>>
  others: Map<string, number>
  totalResponses: number
}

function toShareType(share: DashboardShareModel, token?: string): DashboardShareType {
  return {
    id: share.id,
    // Only a freshly created share knows its plaintext token; stored documents
    // keep just the hash, so listings return empty strings here.
    token: token ?? '',
    url: token ? dashboardShareUrl(token) : '',
    metrics: share.metrics ?? [],
    expiresAt: share.expiresAt,
    revokedAt: share.revokedAt,
    createdAt: (share as any).createdAt
      ? Math.floor(new Date((share as any).createdAt).getTime() / 1000)
      : timestamp()
  }
}

/**
 * Plain-text title of a field. Rich-text titles are serialized to text the
 * same way validation rules flatten them; untitled fields fall back to the
 * short label, then to the raw field id.
 */
function fieldTitle(field: FormField): string {
  if (helper.isValidArray(field.title)) {
    const plain = htmlUtils.serialize(field.title as unknown as any[], { plain: true })

    if (helper.isValid(plain)) {
      return plain
    }
  } else if (helper.isValid(field.title)) {
    return String(field.title)
  }

  if (helper.isValid(field.label)) {
    return String(field.label)
  }

  return field.id
}

/** fieldId → plain-text title of every field, group containers included. */
function fieldTitles(form: FormModel): Map<string, string> {
  const titles = new Map<string, string>()

  for (const field of flattenFields(form.fields, true)) {
    titles.set(field.id, fieldTitle(field))
  }

  return titles
}

/** The fields the public 'questions' group may report on. */
function isPublicQuestionField(field: FormField): boolean {
  return field.kind !== FieldKindEnum.GROUP && QUESTION_FIELD_KINDS.includes(field.kind)
}

function toOptionCounts(rows: QuestionOptionRow[]): Map<string, Map<string, number>> {
  const counts = new Map<string, Map<string, number>>()

  for (const row of rows) {
    const options = counts.get(row._id.fieldId) ?? new Map<string, number>()
    options.set(row._id.optionId, (options.get(row._id.optionId) ?? 0) + row.count)
    counts.set(row._id.fieldId, options)
  }

  return counts
}

function toScaleCounts(
  rows: QuestionScaleRow[]
): Map<string, Array<{ value: number; count: number }>> {
  const counts = new Map<string, Array<{ value: number; count: number }>>()

  for (const row of rows) {
    const value = Number(row._id.value)

    // Corrupt, non-numeric scale answers are not a distribution anyone can read
    if (!Number.isFinite(value)) {
      continue
    }

    const values = counts.get(row._id.fieldId) ?? []
    values.push({ value, count: row.count })
    counts.set(row._id.fieldId, values)
  }

  return counts
}

function toFacetCounts(facet: QuestionFacet): QuestionFacetCounts {
  return {
    answered: new Map(facet.answered.map(row => [row._id, row.responses])),
    single: toOptionCounts(facet.single),
    picked: toOptionCounts(facet.picked),
    scales: toScaleCounts(facet.scales),
    others: new Map(facet.others.map(row => [row._id, row.count])),
    totalResponses: facet.responses[0]?.responses ?? 0
  }
}

/**
 * Option distribution of a choice question, in the author's option order.
 * "Other" answers are counted, never quoted: only how many respondents used
 * the option is public, so the row is added when the question allows Other
 * (matching the authenticated report) or whenever it was actually used.
 */
function choiceDistribution(
  field: FormField,
  options: Map<string, number> | undefined,
  other?: { count: number; allowed: boolean }
): Array<{ label: string; count: number }> {
  const distribution = (field.properties?.choices ?? []).map(choice => ({
    label: choice.label,
    count: options?.get(choice.id) ?? 0
  }))

  if (other && (other.count > 0 || other.allowed)) {
    distribution.push({ label: OTHER_CHOICE_LABEL, count: other.count })
  }

  return distribution
}

/** Distribution of one question, empty when its answers are not enumerable. */
function questionDistribution(
  field: FormField,
  counts: QuestionFacetCounts
): Array<{ label: string; count: number }> {
  if (field.kind === FieldKindEnum.YES_NO) {
    return choiceDistribution(field, counts.single.get(field.id))
  }

  if (CHOICES_FIELD_KINDS.includes(field.kind)) {
    return choiceDistribution(field, counts.picked.get(field.id), {
      count: counts.others.get(field.id) ?? 0,
      allowed: field.properties?.allowOther === true
    })
  }

  if (RATING_FIELD_KINDS.includes(field.kind)) {
    return (counts.scales.get(field.id) ?? [])
      .slice()
      .sort((a, b) => a.value - b.value)
      .map(row => ({ label: String(row.value), count: row.count }))
  }

  return []
}

/**
 * Revocable, optionally expiring public shares of a form's analytics
 * dashboard. The share token is a random secret handed out once; only its
 * SHA-256 hash is stored, so a leaked database cannot leak working share URLs.
 */
@Injectable()
export class DashboardShareService {
  constructor(
    @InjectModel(DashboardShareModel.name)
    private readonly model: Model<DashboardShareModel>,
    @InjectModel(SubmissionModel.name)
    private readonly submissionModel: Model<SubmissionModel>,
    private readonly formService: FormService,
    private readonly analyticsQueryService: AnalyticsQueryService,
    private readonly redisService: RedisService
  ) {}

  async create(
    form: FormModel,
    metrics: string[],
    expiresInDays?: number,
    userId?: string
  ): Promise<DashboardShareType> {
    const validMetrics = this.validateMetrics(metrics)

    const expiresAt =
      Number.isSafeInteger(expiresInDays) && expiresInDays! > 0
        ? timestamp() +
          Math.min(expiresInDays!, MAX_DASHBOARD_SHARE_EXPIRATION_DAYS) * SECONDS_PER_DAY
        : undefined

    const token = nanoid(DASHBOARD_SHARE_TOKEN_LENGTH)

    const share = await this.model.create({
      teamId: form.teamId,
      formId: form.id,
      tokenHash: hashDashboardShareToken(token),
      metrics: validMetrics,
      expiresAt,
      createdBy: userId
    } as any)

    return toShareType(share, token)
  }

  async list(formId: string): Promise<DashboardShareType[]> {
    const shares = await this.model.find({ formId }).sort({ createdAt: -1 })
    return shares.map(share => toShareType(share))
  }

  /** The team that owns a share; used for permission checks on revoke. */
  async shareTeamId(shareId: string): Promise<string> {
    const share = await this.model.findById(shareId)

    if (!share) {
      throw new BadRequestException('The dashboard share does not exist')
    }

    return share.teamId
  }

  /**
   * Revokes a share. The share may only be revoked by the team that owns the
   * shared form; anything else throws instead of revealing whether the share
   * exists.
   */
  async revoke(shareId: string, teamId: string): Promise<boolean> {
    const share = await this.model.findById(shareId)

    if (!share) {
      throw new BadRequestException('The dashboard share does not exist')
    }

    const form = await this.formService.findById(share.formId)

    if (!form || form.teamId !== teamId || share.teamId !== teamId) {
      throw new BadRequestException("You don't have permission to access the workspace")
    }

    if (!share.revokedAt) {
      await this.model.updateOne({ _id: share.id }, { revokedAt: timestamp() })
    }

    return true
  }

  /**
   * Resolves a public share token to its share, or null when the token is
   * unknown, revoked or expired.
   */
  async resolvePublic(token: string): Promise<DashboardShareModel | null> {
    if (!helper.isValid(token)) {
      return null
    }

    const share = await this.model.findOne({ tokenHash: hashDashboardShareToken(token) })

    if (!share || share.revokedAt) {
      return null
    }

    if (helper.isValid(share.expiresAt) && share.expiresAt! <= timestamp()) {
      return null
    }

    return share
  }

  /**
   * The public dashboard payload for a resolved share: only the metric groups
   * the share permits, drawn from the same cached aggregations as the
   * authenticated dashboard, and never any respondent-identifying data.
   */
  async publicDashboardData(share: DashboardShareModel): Promise<PublicDashboardData | null> {
    const form = await this.formService.findById(share.formId)

    if (!form) {
      return null
    }

    const metrics = share.metrics ?? []
    const overview = await this.analyticsQueryService.overview(form, PUBLIC_DASHBOARD_RANGE)

    const data: PublicDashboardData = {
      formName: form.name,
      range: PUBLIC_DASHBOARD_RANGE,
      metrics
    }

    if (metrics.includes('overview')) {
      data.totalVisits = overview.totalVisits
      data.totalResponses = overview.totalResponses
      data.completionRate = overview.completionRate
      data.abandonmentRate = overview.abandonmentRate
      data.avgCompletionTimeSeconds = overview.avgCompletionTimeSeconds
      data.deviceBreakdown = overview.deviceBreakdown
      data.browserBreakdown = overview.browserBreakdown
      data.mediaCounts = overview.mediaCounts
      data.quiz = overview.quiz ?? null
    }

    if (metrics.includes('trends')) {
      data.responseTrend = overview.responseTrend
    }

    if (metrics.includes('heatmap')) {
      // The public page has no form at hand, so every row carries the
      // question's title; a field deleted since keeps its raw id.
      const titles = fieldTitles(form)
      data.heatmap = (
        await this.analyticsQueryService.heatmapCached(form, PUBLIC_DASHBOARD_RANGE)
      ).map(row => ({
        ...row,
        title: titles.get(row.fieldId) ?? row.fieldId
      }))
    }

    if (metrics.includes('questions')) {
      data.questions = await this.publicQuestions(form)
    }

    return data
  }

  /**
   * Per-question aggregates of the 'questions' metric group, over the same
   * response set the overview counts: how many of the range's completed
   * responses answered each question, and how the enumerable answers spread
   * over the options. Counts only — free-text answers are never distributed.
   */
  private async publicQuestions(form: FormModel): Promise<PublicQuestionStatsType[]> {
    const counts = toFacetCounts(await this.cachedQuestionFacet(form))
    const questions: PublicQuestionStatsType[] = []

    for (const field of flattenFields(form.fields)) {
      if (!isPublicQuestionField(field)) {
        continue
      }

      const responses = counts.answered.get(field.id) ?? 0

      // Questions nobody answered in the range carry no public signal
      if (responses < 1) {
        continue
      }

      const question: PublicQuestionStatsType = {
        title: fieldTitle(field),
        responses
      }

      if (counts.totalResponses > 0) {
        // A submission landing between the facet's own sub-pipelines could
        // edge a count past its denominator; the rate never reads above 100.
        question.completionRate = Math.min(
          100,
          Math.round((responses / counts.totalResponses) * 10000) / 100
        )
      }

      const distribution = questionDistribution(field, counts)

      if (distribution.length > 0) {
        question.distribution = distribution
      }

      questions.push(question)
    }

    return questions
  }

  /**
   * The question aggregation, cached exactly like the overview and heatmap:
   * under the form's analytics cache generation, so a new submission replaces
   * the generation and the next view recomputes. Only raw counts are cached —
   * titles, labels and the final shape are rebuilt per request from the live
   * form, so form edits are reflected immediately.
   */
  private async cachedQuestionFacet(form: FormModel): Promise<QuestionFacet> {
    const generation = await getFormAnalyticCacheGeneration(this.redisService, form.id)
    const key = `${formAnalyticCacheKey(form.id, PUBLIC_DASHBOARD_RANGE, generation)}:questions`
    const cache = await this.redisService.get(key)

    if (helper.isValid(cache)) {
      const parsed = parseJson<QuestionFacet>(cache)

      if (parsed) {
        return parsed
      }
    }

    const result = await this.questionFacet(form)

    await this.redisService.set({
      key,
      value: JSON.stringify(result),
      duration: QUESTIONS_CACHE_TTL
    })

    return result
  }

  /**
   * One MongoDB aggregation over the range's completed submissions, split by
   * $facet into the counters the public payload needs:
   *
   * - answered: per question, how many responses carry a real answer (answers
   *   stored empty — skipped optional questions — do not count; a blank
   *   "Other" does, mirroring the authenticated report)
   * - single: per option of yes/no questions
   * - picked: per option of multiple and picture choice questions
   * - scales: per value of rating and opinion scale questions
   * - others: per choice question, how many used the "Other" option
   * - responses: the completion rate's denominator
   */
  private async questionFacet(form: FormModel): Promise<QuestionFacet> {
    const since = Math.floor(rangeStartAt(PUBLIC_DASHBOARD_RANGE).getTime() / 1000)

    const rows = await this.submissionModel.aggregate<QuestionFacet>([
      {
        $match: {
          formId: form.id,
          endAt: { $gte: since }
        }
      },
      {
        $facet: {
          answered: [
            { $unwind: '$answers' },
            {
              $match: {
                $or: [
                  {
                    'answers.kind': { $in: CHOICES_FIELD_KINDS },
                    $or: [
                      { 'answers.value.value.0': { $exists: true } },
                      { 'answers.value.other': { $exists: true, $ne: null } }
                    ]
                  },
                  {
                    'answers.kind': { $nin: CHOICES_FIELD_KINDS },
                    'answers.value': { $exists: true, $nin: [null, ''] }
                  }
                ]
              }
            },
            { $group: { _id: '$answers.id', responses: { $sum: 1 } } }
          ],
          single: [
            { $unwind: '$answers' },
            {
              $match: {
                'answers.kind': FieldKindEnum.YES_NO,
                'answers.value': { $nin: [null, ''] }
              }
            },
            {
              $group: {
                _id: { fieldId: '$answers.id', optionId: '$answers.value' },
                count: { $sum: 1 }
              }
            }
          ],
          picked: [
            { $unwind: '$answers' },
            { $match: { 'answers.kind': { $in: CHOICES_FIELD_KINDS } } },
            { $unwind: '$answers.value.value' },
            {
              $group: {
                _id: { fieldId: '$answers.id', optionId: '$answers.value.value' },
                count: { $sum: 1 }
              }
            }
          ],
          scales: [
            { $unwind: '$answers' },
            {
              $match: {
                'answers.kind': { $in: RATING_FIELD_KINDS },
                'answers.value': { $nin: [null, ''] }
              }
            },
            {
              $group: {
                _id: { fieldId: '$answers.id', value: '$answers.value' },
                count: { $sum: 1 }
              }
            }
          ],
          others: [
            { $unwind: '$answers' },
            {
              $match: {
                'answers.kind': { $in: CHOICES_FIELD_KINDS },
                'answers.value.other': { $exists: true, $ne: null }
              }
            },
            { $group: { _id: '$answers.id', count: { $sum: 1 } } }
          ],
          responses: [{ $count: 'responses' }]
        }
      }
    ])

    return rows[0] ?? EMPTY_QUESTION_FACET
  }

  private validateMetrics(metrics: string[]): string[] {
    if (!helper.isValidArray(metrics)) {
      throw new BadRequestException('At least one dashboard metric is required')
    }

    const allowed: readonly string[] = DASHBOARD_SHARE_METRICS
    const valid: string[] = []

    for (const metric of metrics) {
      if (!allowed.includes(metric)) {
        throw new BadRequestException(`Unsupported dashboard metric: ${metric}`)
      }
      if (!valid.includes(metric)) {
        valid.push(metric)
      }
    }

    return valid
  }
}
