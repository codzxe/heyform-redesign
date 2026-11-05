import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export enum ScheduledReportFrequencyEnum {
  WEEKLY = 'weekly',
  MONTHLY = 'monthly'
}

export enum ScheduledReportStatusEnum {
  OK = 'ok',
  FAILED = 'failed',
  DISABLED = 'disabled'
}

/**
 * A recurring email report over a form's real response data. A worker picks
 * up due reports, computes the metrics, renders the email and delivers it
 * through the mail queue.
 */
@Schema({
  timestamps: true
})
export class ScheduledReportModel extends Document {
  @Prop({ required: true, index: true })
  teamId: string

  @Prop({ required: true, index: true })
  formId: string

  @Prop({ type: String, required: true, enum: Object.values(ScheduledReportFrequencyEnum) })
  frequency: ScheduledReportFrequencyEnum

  // 0-6 (Sun-Sat) for weekly; 1-28 for monthly
  @Prop()
  dayOfWeek?: number

  @Prop()
  dayOfMonth?: number

  @Prop({ required: true, default: 'UTC' })
  timezone: string

  @Prop({ type: [String], required: true })
  recipients: string[]

  @Prop({ default: true })
  enabled: boolean

  @Prop({ required: true })
  nextRunAt: number

  @Prop()
  lastRunAt?: number

  @Prop({
    type: String,
    required: true,
    default: ScheduledReportStatusEnum.OK
  })
  status: ScheduledReportStatusEnum

  @Prop()
  lastError?: string

  @Prop()
  createdBy: string
}

export const ScheduledReportSchema = SchemaFactory.createForClass(ScheduledReportModel)

ScheduledReportSchema.index({ enabled: 1, nextRunAt: 1 })
ScheduledReportSchema.index({ teamId: 1, formId: 1 })
