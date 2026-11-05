import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export enum AnalyticsEventKindEnum {
  FORM_OPEN = 'form_open',
  FIELD_ENTER = 'field_enter',
  FIELD_EXIT = 'field_exit',
  ANSWER_CHANGE = 'answer_change',
  VALIDATION_ERROR = 'validation_error',
  PAGE_NEXT = 'page_next',
  PAGE_PREV = 'page_prev',
  SESSION_RESUMED = 'session_resumed',
  COMPLETED = 'completed',
  ABANDONED = 'abandoned'
}

/**
 * A single respondent interaction event on a public form. Events are batched
 * client-side and flushed to the analytics endpoint, then aggregated by
 * workers/queries into dashboards and the hesitation heatmap.
 */
@Schema({
  timestamps: true
})
export class AnalyticsEventModel extends Document {
  @Prop({ required: true, index: true })
  formId: string

  // Anonymous per-respondent identifier (not a user account)
  @Prop({ required: true })
  anonymousId: string

  @Prop()
  fieldId?: string

  @Prop({ required: true, enum: Object.values(AnalyticsEventKindEnum) })
  kind: AnalyticsEventKindEnum

  // Duration of a field visit, when the event ends one
  @Prop()
  durationMs?: number

  // Extra context (e.g. validation error message key, page number)
  @Prop({ type: Object })
  meta?: Record<string, any>

  @Prop()
  clientTs?: number

  @Prop()
  ts: number
}

export const AnalyticsEventSchema = SchemaFactory.createForClass(AnalyticsEventModel)

AnalyticsEventSchema.index({ formId: 1, ts: -1 })
AnalyticsEventSchema.index({ formId: 1, fieldId: 1, kind: 1 })
AnalyticsEventSchema.index({ formId: 1, anonymousId: 1, ts: -1 })
