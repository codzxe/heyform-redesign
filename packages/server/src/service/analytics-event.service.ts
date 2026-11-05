import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'

import { FormHeatmapItemType } from '../common/graphql/analytics.graphql'
import { RedisService } from './redis.service'
import { AnalyticsEventKindEnum, AnalyticsEventModel, clearFormAnalyticCache } from '@model'
import { helper, timestamp } from '@myform/utils'

export interface AnalyticsEventInput {
  kind?: unknown
  fieldId?: unknown
  durationMs?: unknown
  meta?: unknown
  ts?: unknown
}

interface ValidatedAnalyticsEvent {
  kind: AnalyticsEventKindEnum
  fieldId?: string
  durationMs?: number
  meta?: Record<string, any>
  clientTs?: number
}

const MAX_FIELD_ID_LENGTH = 64
const MAX_DURATION_MS = 24 * 60 * 60 * 1000
const MAX_META_KEYS = 8
const MAX_META_VALUE_LENGTH = 200

const ANALYTIC_EVENT_KINDS: string[] = Object.values(AnalyticsEventKindEnum)

/**
 * Records respondent interaction events (field enter/exit, answer changes,
 * validation errors, abandons, ...) batched by the form renderer, and
 * aggregates them into the per-field hesitation heatmap.
 *
 * Events are best-effort telemetry: an invalid event is dropped individually
 * and never fails the rest of the batch, and no respondent IP address is ever
 * stored alongside an event.
 */
@Injectable()
export class AnalyticsEventService {
  constructor(
    @InjectModel(AnalyticsEventModel.name)
    private readonly analyticsEventModel: Model<AnalyticsEventModel>,
    private readonly redisService: RedisService
  ) {}

  /**
   * Validates and stores a batch of events in one bulk insert. Returns the
   * number of events actually stored; events that fail validation are dropped
   * individually so one malformed event cannot lose the whole batch.
   */
  async recordBatch(
    formId: string,
    anonymousId: string,
    events: AnalyticsEventInput[]
  ): Promise<number> {
    if (!helper.isValidArray(events)) {
      return 0
    }

    const now = timestamp()
    const docs: ValidatedAnalyticsEvent[] = []

    for (const event of events) {
      const validated = AnalyticsEventService.validateEvent(event)

      if (validated) {
        docs.push(validated)
      }
    }

    if (docs.length < 1) {
      return 0
    }

    // ts is the trusted server receive time (epoch seconds); clientTs keeps the
    // client's own clock for diagnosis only.
    await this.analyticsEventModel.create(
      docs.map(doc => ({
        formId,
        anonymousId,
        fieldId: doc.fieldId,
        kind: doc.kind,
        durationMs: doc.durationMs,
        meta: doc.meta,
        clientTs: doc.clientTs,
        ts: now
      }))
    )

    // New events change the heatmap, so the analytics cache generation moves on
    // and cached dashboards recompute on the next query.
    await clearFormAnalyticCache(this.redisService, formId)

    return docs.length
  }

  /**
   * Per-field heatmap counters since a timestamp, aggregated inside MongoDB:
   * visits (field enters), average time on field (from field-exit durations),
   * answer changes, validation errors and abandonments.
   */
  async heatmap(formId: string, since: number): Promise<FormHeatmapItemType[]> {
    const isFieldExit = { $eq: ['$kind', AnalyticsEventKindEnum.FIELD_EXIT] }
    const isTimedFieldExit = {
      $and: [isFieldExit, { $isNumber: '$durationMs' }]
    }

    const rows: Array<{
      _id: string
      visits?: number
      timedExits?: number
      totalTimeMs?: number
      answerChanges?: number
      validationErrors?: number
      abandonments?: number
    }> = await this.analyticsEventModel.aggregate([
      {
        $match: {
          formId,
          fieldId: { $exists: true, $ne: null },
          ts: { $gte: since }
        }
      },
      {
        $group: {
          _id: '$fieldId',
          visits: {
            $sum: { $cond: [{ $eq: ['$kind', AnalyticsEventKindEnum.FIELD_ENTER] }, 1, 0] }
          },
          timedExits: { $sum: { $cond: [isTimedFieldExit, 1, 0] } },
          totalTimeMs: { $sum: { $cond: [isTimedFieldExit, '$durationMs', 0] } },
          answerChanges: {
            $sum: { $cond: [{ $eq: ['$kind', AnalyticsEventKindEnum.ANSWER_CHANGE] }, 1, 0] }
          },
          validationErrors: {
            $sum: { $cond: [{ $eq: ['$kind', AnalyticsEventKindEnum.VALIDATION_ERROR] }, 1, 0] }
          },
          abandonments: {
            $sum: { $cond: [{ $eq: ['$kind', AnalyticsEventKindEnum.ABANDONED] }, 1, 0] }
          }
        }
      },
      { $sort: { visits: -1, _id: 1 } }
    ])

    return rows.map(row => ({
      fieldId: row._id,
      visits: row.visits ?? 0,
      avgTimeMs:
        row.timedExits && row.timedExits > 0
          ? Math.round(((row.totalTimeMs ?? 0) / row.timedExits) * 10) / 10
          : 0,
      answerChanges: row.answerChanges ?? 0,
      validationErrors: row.validationErrors ?? 0,
      abandonments: row.abandonments ?? 0
    }))
  }

  /**
   * Full validation of a single client event. Returns the fields to store, or
   * undefined when the event must be dropped. Deliberately defensive: events
   * arrive unauthenticated from public browsers and may be anything.
   */
  private static validateEvent(event: AnalyticsEventInput): ValidatedAnalyticsEvent | undefined {
    if (!helper.isObject(event) || Array.isArray(event)) {
      return undefined
    }

    if (typeof event.kind !== 'string' || !ANALYTIC_EVENT_KINDS.includes(event.kind)) {
      return undefined
    }

    let fieldId: string | undefined

    if (event.fieldId !== undefined && event.fieldId !== null) {
      if (typeof event.fieldId !== 'string' || event.fieldId.length > MAX_FIELD_ID_LENGTH) {
        return undefined
      }
      fieldId = event.fieldId
    }

    let durationMs: number | undefined

    if (event.durationMs !== undefined && event.durationMs !== null) {
      if (
        typeof event.durationMs !== 'number' ||
        !Number.isFinite(event.durationMs) ||
        event.durationMs < 0 ||
        event.durationMs > MAX_DURATION_MS
      ) {
        return undefined
      }
      durationMs = event.durationMs
    }

    let meta: Record<string, any> | undefined

    if (event.meta !== undefined && event.meta !== null) {
      const sanitized = AnalyticsEventService.validateMeta(event.meta)

      if (sanitized === undefined) {
        return undefined
      }
      meta = sanitized
    }

    let clientTs: number | undefined

    if (event.ts !== undefined && event.ts !== null) {
      if (typeof event.ts !== 'number' || !Number.isFinite(event.ts)) {
        return undefined
      }
      clientTs = event.ts
    }

    return {
      kind: event.kind as AnalyticsEventKindEnum,
      fieldId,
      durationMs,
      meta,
      clientTs
    }
  }

  /**
   * Accepts a plain object with at most 8 keys whose serialized values fit in
   * 200 characters. Non-primitive values are stringified before the size check,
   * so nothing large or nested is ever stored. Returns undefined when the meta
   * must cause the event to be dropped.
   */
  private static validateMeta(meta: unknown): Record<string, any> | undefined {
    if (!helper.isObject(meta) || Array.isArray(meta)) {
      return undefined
    }

    const entries = Object.entries(meta)

    if (entries.length > MAX_META_KEYS) {
      return undefined
    }

    const result: Record<string, any> = {}

    for (const [key, value] of entries) {
      let serialized: string

      if (typeof value === 'string') {
        serialized = value
      } else {
        try {
          serialized = JSON.stringify(value ?? null)
        } catch (err) {
          return undefined
        }
      }

      if (serialized.length > MAX_META_VALUE_LENGTH) {
        return undefined
      }

      result[key] = typeof value === 'string' ? value : serialized
    }

    return result
  }
}
