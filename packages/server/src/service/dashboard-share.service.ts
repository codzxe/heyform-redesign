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
import { AnalyticsQueryService } from './analytics-query.service'
import { FormService } from './form.service'
import { APP_HOMEPAGE_URL } from '@environments'
import { DashboardShareModel, FormAnalyticRangeEnum, FormModel } from '@model'
import { helper, nanoid, timestamp } from '@myform/utils'

export const DASHBOARD_SHARE_TOKEN_LENGTH = 36
export const MAX_DASHBOARD_SHARE_EXPIRATION_DAYS = 365
const SECONDS_PER_DAY = 24 * 60 * 60

// The window the public dashboard presents. Shares are meant for recent
// activity snapshots, not permanent full-data exports.
const PUBLIC_DASHBOARD_RANGE = FormAnalyticRangeEnum.MONTH

export function hashDashboardShareToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function dashboardShareUrl(token: string): string {
  return `${APP_HOMEPAGE_URL.replace(/\/+$/, '')}/analytics/share/${token}`
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

  // 'heatmap' group
  heatmap?: FormHeatmapItemType[]
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
 * Revocable, optionally expiring public shares of a form's analytics
 * dashboard. The share token is a random secret handed out once; only its
 * SHA-256 hash is stored, so a leaked database cannot leak working share URLs.
 */
@Injectable()
export class DashboardShareService {
  constructor(
    @InjectModel(DashboardShareModel.name)
    private readonly model: Model<DashboardShareModel>,
    private readonly formService: FormService,
    private readonly analyticsQueryService: AnalyticsQueryService
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
      data.heatmap = await this.analyticsQueryService.heatmapCached(form, PUBLIC_DASHBOARD_RANGE)
    }

    // The 'questions' group is reserved for question-level analytics and adds
    // nothing to the public payload today.

    return data
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
