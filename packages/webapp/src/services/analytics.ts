import { apollo } from '@/utils'

import {
  CREATE_DASHBOARD_SHARE_GQL,
  CREATE_SCHEDULED_REPORT_GQL,
  DASHBOARD_SHARES_GQL,
  DELETE_SCHEDULED_REPORT_GQL,
  FORM_ANALYTICS_OVERVIEW_GQL,
  FORM_HEATMAP_GQL,
  REVOKE_DASHBOARD_SHARE_GQL,
  SCHEDULED_REPORTS_GQL,
  UPDATE_SCHEDULED_REPORT_GQL
} from '@/consts'

// ---- Analytics v2 types (mirrors the server's analytics.graphql.ts) ----

export interface TrendPoint {
  date: string
  count: number
}

export interface BreakdownItem {
  label: string
  count: number
}

export interface MediaCounts {
  voice: number
  video: number
  screen: number
}

export interface QuizAnalytics {
  averageScore: number
  averagePercentage: number
  highestScore: number
  passingRate: number
  responseCount: number
}

export interface FormAnalyticsOverview {
  totalVisits: number
  totalResponses: number
  completionRate: number
  abandonmentRate: number
  avgCompletionTimeSeconds: number
  responseTrend: TrendPoint[]
  deviceBreakdown: BreakdownItem[]
  browserBreakdown: BreakdownItem[]
  mediaCounts: MediaCounts
  quiz?: QuizAnalytics | null
}

export interface FormHeatmapItem {
  fieldId: string
  visits: number
  avgTimeMs: number
  answerChanges: number
  validationErrors: number
  abandonments: number
}

export interface DashboardShare {
  id: string
  token: string
  url: string
  metrics: string[]
  expiresAt?: number | null
  revokedAt?: number | null
  createdAt: number
}

export interface ScheduledReport {
  id: string
  formId: string
  frequency: string
  dayOfWeek?: number | null
  dayOfMonth?: number | null
  timezone: string
  recipients: string[]
  enabled: boolean
  nextRunAt: number
  lastRunAt?: number | null
  status: string
  lastError?: string | null
  createdAt: number
}

export interface CreateDashboardShareParams {
  formId: string
  metrics: string[]
  expiresInDays?: number
}

export interface SaveScheduledReportParams {
  formId: string
  frequency: string
  dayOfWeek?: number
  dayOfMonth?: number
  timezone: string
  recipients: string[]
  enabled?: boolean
}

export interface UpdateScheduledReportParams extends SaveScheduledReportParams {
  id: string
}

// Allowed share metrics and report frequencies (server-validated, keep in sync
// with DASHBOARD_SHARE_METRICS / SCHEDULED_REPORT_FREQUENCIES).
export const DASHBOARD_SHARE_METRIC_OPTIONS = [
  'overview',
  'trends',
  'questions',
  'heatmap'
] as const
export const SCHEDULED_REPORT_FREQUENCY_OPTIONS = ['weekly', 'monthly'] as const

export class AnalyticsService {
  static overview(formId: string, range: string) {
    return apollo.query<{ formAnalyticsOverview: FormAnalyticsOverview }>({
      query: FORM_ANALYTICS_OVERVIEW_GQL,
      variables: {
        input: { formId, range }
      }
    })
  }

  static heatmap(formId: string, range: string) {
    return apollo.query<{ formHeatmap: FormHeatmapItem[] }>({
      query: FORM_HEATMAP_GQL,
      variables: {
        input: { formId, range }
      }
    })
  }

  static dashboardShares(formId: string) {
    return apollo.query<{ dashboardShares: DashboardShare[] }>({
      query: DASHBOARD_SHARES_GQL,
      variables: {
        input: { formId }
      }
    })
  }

  static createDashboardShare(params: CreateDashboardShareParams) {
    return apollo.mutate<{ createDashboardShare: DashboardShare }>({
      mutation: CREATE_DASHBOARD_SHARE_GQL,
      variables: {
        input: params
      }
    })
  }

  static revokeDashboardShare(shareId: string) {
    return apollo.mutate<{ revokeDashboardShare: boolean }>({
      mutation: REVOKE_DASHBOARD_SHARE_GQL,
      variables: {
        input: { shareId }
      }
    })
  }

  static scheduledReports(formId: string) {
    return apollo.query<{ scheduledReports: ScheduledReport[] }>({
      query: SCHEDULED_REPORTS_GQL,
      variables: {
        input: { formId }
      }
    })
  }

  static createScheduledReport(params: SaveScheduledReportParams) {
    return apollo.mutate<{ createScheduledReport: ScheduledReport }>({
      mutation: CREATE_SCHEDULED_REPORT_GQL,
      variables: {
        input: params
      }
    })
  }

  static updateScheduledReport(params: UpdateScheduledReportParams) {
    return apollo.mutate<{ updateScheduledReport: ScheduledReport }>({
      mutation: UPDATE_SCHEDULED_REPORT_GQL,
      variables: {
        input: params
      }
    })
  }

  static deleteScheduledReport(formId: string, id: string) {
    return apollo.mutate<{ deleteScheduledReport: boolean }>({
      mutation: DELETE_SCHEDULED_REPORT_GQL,
      variables: {
        input: { formId, id }
      }
    })
  }

  /**
   * Public shared dashboard. Served by the API at
   * GET /api/public/dashboard/:token — same origin as the webapp, so a
   * relative URL keeps the request deployment-independent.
   */
  static async publicDashboard(token: string): Promise<PublicDashboardData | null> {
    const response = await fetch(`/api/public/dashboard/${encodeURIComponent(token)}`, {
      headers: { Accept: 'application/json' }
    })

    if (response.status === 404) {
      return null
    }

    if (!response.ok) {
      throw new Error(`Failed to load shared dashboard (${response.status})`)
    }

    return response.json()
  }
}

// ---- Public (share) dashboard payload — mirrors PublicDashboardData ----

export interface PublicDashboardData {
  formName: string
  range: string
  metrics: string[]
  totalVisits?: number
  totalResponses?: number
  completionRate?: number
  abandonmentRate?: number
  avgCompletionTimeSeconds?: number
  deviceBreakdown?: BreakdownItem[]
  browserBreakdown?: BreakdownItem[]
  mediaCounts?: MediaCounts
  quiz?: QuizAnalytics | null
  responseTrend?: TrendPoint[]
  // 'questions' group (mirrors PublicQuestionStatsType on the server)
  questions?: Array<{
    title: string
    responses: number
    completionRate?: number
    distribution?: Array<{ label: string; count: number }>
  }>

  // 'heatmap' group — rows carry the question title resolved server-side
  heatmap?: Array<{
    fieldId: string
    title: string
    visits: number
    avgTimeMs: number
    answerChanges: number
    validationErrors: number
    abandonments: number
  }>
}
