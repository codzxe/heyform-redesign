import { FormKindEnum } from '@myform/shared-types-enums'
import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'

import {
  BreakdownItemType,
  FormAnalyticsOverviewType,
  FormHeatmapItemType,
  QuizAnalyticsType,
  TrendPointType
} from '../common/graphql/analytics.graphql'
import { AnalyticsEventService } from './analytics-event.service'
import { MediaAssetService } from './media-asset.service'
import { RedisService } from './redis.service'
import {
  FormAnalyticModel,
  FormAnalyticRangeEnum,
  FormModel,
  SubmissionModel,
  formAnalyticCacheKey,
  getFormAnalyticCacheGeneration
} from '@model'
import { date, helper, parseJson } from '@myform/utils'

const CACHE_TTL = '10m'

interface CountRow {
  _id?: string | null
  count?: number
}

interface QuizAggregationRow {
  averageScore?: number
  averagePercentage?: number
  highestScore?: number
  passedCount?: number
  responseCount?: number
}

function round(value: number | undefined, precision: number): number {
  const factor = 10 ** precision
  return Math.round((value ?? 0) * factor) / factor
}

/**
 * The first day of a range, so that a range labelled "7d" covers the last
 * seven calendar days including today. Ranges always end at the end of today,
 * mirroring FormAnalyticResolver's windows.
 */
function rangeStartAt(range: FormAnalyticRangeEnum): Date {
  const today = date().startOf('day')

  switch (range) {
    case FormAnalyticRangeEnum.WEEK:
      return today.subtract(6, 'days').toDate()

    case FormAnalyticRangeEnum.MONTH:
      return today.subtract(1, 'month').toDate()

    case FormAnalyticRangeEnum.THREE_MONTH:
      return today.subtract(3, 'month').toDate()

    case FormAnalyticRangeEnum.SIX_MONTH:
      return today.subtract(6, 'month').toDate()

    case FormAnalyticRangeEnum.YEAR:
      return today.subtract(1, 'year').toDate()

    default:
      return today.subtract(6, 'days').toDate()
  }
}

/**
 * One trend point per calendar day of the whole range; days without a
 * submission in the aggregation result are filled with zero instead of being
 * skipped, so charts keep a continuous axis.
 */
function fillTrendDays(since: Date, rows: CountRow[]): TrendPointType[] {
  const counts = new Map<string, number>()

  for (const row of rows) {
    if (helper.isValid(row?._id)) {
      counts.set(row._id as string, row.count ?? 0)
    }
  }

  const points: TrendPointType[] = []
  let cursor = date(since).startOf('day')
  const lastDay = date().startOf('day')

  while (cursor.isBefore(lastDay) || cursor.isSame(lastDay, 'day')) {
    const day = cursor.format('YYYY-MM-DD')
    points.push({
      date: day,
      count: counts.get(day) ?? 0
    })
    cursor = cursor.add(1, 'day')
  }

  return points
}

function toBreakdown(rows: CountRow[]): BreakdownItemType[] {
  return rows
    .map(row => ({
      // Missing or unrecognized user agents (the parser's "other" marker)
      // collapse into a single Unknown bucket
      label: helper.isValid(row?._id) && row._id !== 'other' ? (row._id as string) : 'Unknown',
      count: row.count ?? 0
    }))
    .sort((a, b) => b.count - a.count)
}

/**
 * Aggregates the analytics dashboard v2 overview: visits, responses,
 * completion/abandonment, average completion time, the daily response trend,
 * device/browser breakdowns, media recording counts and quiz statistics.
 * Every number comes from a real MongoDB aggregation.
 *
 * Results are cached per range under the form's analytics cache generation,
 * exactly like FormAnalyticResolver caches formAnalytic: a visit, submission
 * or analytics event bumps the generation, so the next query recomputes and
 * the stale cache entry is never read again.
 */
@Injectable()
export class AnalyticsQueryService {
  constructor(
    @InjectModel(SubmissionModel.name)
    private readonly submissionModel: Model<SubmissionModel>,
    @InjectModel(FormAnalyticModel.name)
    private readonly formAnalyticModel: Model<FormAnalyticModel>,
    private readonly redisService: RedisService,
    private readonly mediaAssetService: MediaAssetService,
    private readonly analyticsEventService: AnalyticsEventService
  ) {}

  async overview(
    form: FormModel,
    range: FormAnalyticRangeEnum
  ): Promise<FormAnalyticsOverviewType> {
    const formId = form.id

    // Read the generation before computing: if a visit, submission or event
    // batch bumps it meanwhile, this result is cached under the old generation
    // and never served.
    const generation = await getFormAnalyticCacheGeneration(this.redisService, formId)
    const key = formAnalyticCacheKey(formId, range, generation)
    const cache = await this.redisService.get(key)

    if (helper.isValid(cache)) {
      return parseJson(cache) as FormAnalyticsOverviewType
    }

    const result = await this.computeOverview(form, range)

    await this.redisService.set({
      key,
      value: JSON.stringify(result),
      duration: CACHE_TTL
    })

    return result
  }

  async heatmapCached(
    form: FormModel,
    range: FormAnalyticRangeEnum
  ): Promise<FormHeatmapItemType[]> {
    const formId = form.id
    const generation = await getFormAnalyticCacheGeneration(this.redisService, formId)
    const key = `${formAnalyticCacheKey(formId, range, generation)}:heatmap`
    const cache = await this.redisService.get(key)

    if (helper.isValid(cache)) {
      return (parseJson(cache) as FormHeatmapItemType[]) ?? []
    }

    const since = Math.floor(rangeStartAt(range).getTime() / 1000)
    const result = await this.analyticsEventService.heatmap(formId, since)

    await this.redisService.set({
      key,
      value: JSON.stringify(result),
      duration: CACHE_TTL
    })

    return result
  }

  private async computeOverview(
    form: FormModel,
    range: FormAnalyticRangeEnum
  ): Promise<FormAnalyticsOverviewType> {
    const formId = form.id
    const startAt = rangeStartAt(range)
    const since = Math.floor(startAt.getTime() / 1000)
    const endAt = date().endOf('day').toDate()

    const [
      visitRows,
      totalResponses,
      startedInRange,
      completedInRange,
      avgTimeRows,
      trendRows,
      deviceRows,
      browserRows,
      mediaCounts,
      quiz
    ] = await Promise.all([
      // Daily visit rows recorded by FormAnalyticService, summed over the range
      this.formAnalyticModel.aggregate<{ _id: null; totalVisits: number }>([
        {
          $match: {
            formId,
            createdAt: {
              $gte: startAt,
              $lte: endAt
            }
          }
        },
        {
          $group: {
            _id: null,
            totalVisits: { $sum: '$totalVisits' }
          }
        }
      ]),
      // Responses completed in the range
      this.submissionModel.countDocuments({
        formId,
        endAt: { $gte: since }
      }),
      // Respondents that started in the range
      this.submissionModel.countDocuments({
        formId,
        startAt: { $gte: since }
      }),
      // ...and how many of them actually finished
      this.submissionModel.countDocuments({
        formId,
        startAt: { $gte: since },
        endAt: { $gt: 0 }
      }),
      this.submissionModel.aggregate<{ _id: null; avgSeconds?: number }>([
        {
          $match: {
            formId,
            endAt: { $gte: since }
          }
        },
        {
          $group: {
            _id: null,
            // startAt and endAt are epoch seconds, so their difference already is
            avgSeconds: { $avg: { $subtract: ['$endAt', '$startAt'] } }
          }
        }
      ]),
      this.submissionModel.aggregate<CountRow>([
        {
          $match: {
            formId,
            endAt: { $gte: since }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: { $toDate: { $multiply: ['$endAt', 1000] } },
                // Bucket by the server's local days, matching rangeStartAt
                timezone: date().format('Z')
              }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      this.submissionModel.aggregate<CountRow>([
        {
          $match: {
            formId,
            endAt: { $gte: since }
          }
        },
        {
          $group: {
            _id: '$userAgent.platform.type',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } }
      ]),
      this.submissionModel.aggregate<CountRow>([
        {
          $match: {
            formId,
            endAt: { $gte: since }
          }
        },
        {
          $group: {
            _id: '$userAgent.browser.name',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } }
      ]),
      this.mediaAssetService.countByKind(formId, since),
      this.quizAnalytics(formId, since, form.kind)
    ])

    const completionRate =
      startedInRange > 0 ? round((completedInRange / startedInRange) * 100, 2) : 0

    return {
      totalVisits: visitRows[0]?.totalVisits ?? 0,
      totalResponses,
      completionRate,
      abandonmentRate: round(100 - completionRate, 2),
      avgCompletionTimeSeconds: round(avgTimeRows[0]?.avgSeconds, 1),
      responseTrend: fillTrendDays(startAt, trendRows),
      deviceBreakdown: toBreakdown(deviceRows),
      browserBreakdown: toBreakdown(browserRows),
      mediaCounts: {
        voice: mediaCounts?.voice ?? 0,
        video: mediaCounts?.video ?? 0,
        screen: mediaCounts?.screen ?? 0
      },
      quiz
    }
  }

  /**
   * Quiz statistics over the scored submissions of the range. Only quiz forms
   * have scores; every other form kind gets null.
   */
  private async quizAnalytics(
    formId: string,
    since: number,
    kind: FormKindEnum
  ): Promise<QuizAnalyticsType | null> {
    if (kind !== FormKindEnum.QUIZ) {
      return null
    }

    const rows = await this.submissionModel.aggregate<{ _id: null } & QuizAggregationRow>([
      {
        $match: {
          formId,
          endAt: { $gte: since },
          score: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: null,
          averageScore: { $avg: '$score' },
          averagePercentage: { $avg: '$scorePercentage' },
          highestScore: { $max: '$score' },
          passedCount: { $sum: { $cond: [{ $eq: ['$passed', true] }, 1, 0] } },
          responseCount: { $sum: 1 }
        }
      }
    ])

    const row = rows[0]

    if (!row) {
      return {
        averageScore: 0,
        averagePercentage: 0,
        highestScore: 0,
        passingRate: 0,
        responseCount: 0
      }
    }

    const responseCount = row.responseCount ?? 0

    return {
      averageScore: round(row.averageScore, 2),
      averagePercentage: round(row.averagePercentage, 2),
      highestScore: round(row.highestScore, 2),
      passingRate: responseCount > 0 ? round(((row.passedCount ?? 0) / responseCount) * 100, 2) : 0,
      responseCount
    }
  }
}
