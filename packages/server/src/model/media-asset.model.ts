import { FieldKindEnum } from '@myform/shared-types-enums'
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export enum MediaAssetStatusEnum {
  UPLOADED = 'uploaded',
  PROCESSING = 'processing',
  READY = 'ready',
  FAILED = 'failed',
  DELETED = 'deleted'
}

export enum TranscriptStatusEnum {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped'
}

export interface TranscriptRecord {
  text?: string
  provider?: string
  language?: string
  status: TranscriptStatusEnum
  error?: string
  completedAt?: number
}

/**
 * A recording (voice answer, video answer or screen recording) uploaded by a
 * respondent, or a generated export file owned by a team. Audio assets can
 * carry a transcription produced by the configured provider.
 */
@Schema({
  timestamps: true
})
export class MediaAssetModel extends Document {
  @Prop({ required: true, index: true })
  teamId: string

  @Prop({ required: true, index: true })
  formId: string

  @Prop()
  submissionId?: string

  @Prop({ required: true })
  fieldId: string

  @Prop({ type: String, required: true, enum: Object.values(FieldKindEnum) })
  kind: FieldKindEnum

  @Prop({ required: true })
  filename: string

  @Prop({ required: true })
  url: string

  @Prop()
  key?: string

  @Prop()
  bucket?: string

  @Prop({ required: true })
  mimetype: string

  @Prop({ required: true })
  size: number

  @Prop()
  durationSeconds?: number

  @Prop({
    type: String,
    required: true,
    default: MediaAssetStatusEnum.UPLOADED
  })
  status: MediaAssetStatusEnum

  @Prop({ type: Object })
  transcript?: TranscriptRecord

  @Prop()
  deletedAt?: number
}

export const MediaAssetSchema = SchemaFactory.createForClass(MediaAssetModel)

MediaAssetSchema.index({ formId: 1, fieldId: 1 })
MediaAssetSchema.index({ submissionId: 1 })
MediaAssetSchema.index({ status: 1, 'transcript.status': 1 })
