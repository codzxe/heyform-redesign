import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export enum DeletionRequestTypeEnum {
  RESPONDENT_DATA = 'respondent_data',
  FORM_DATA = 'form_data',
  ACCOUNT = 'account'
}

export enum DeletionRequestStatusEnum {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  REJECTED = 'rejected'
}

/**
 * A GDPR/right-to-erasure request. Respondent requests can arrive publicly
 * (identified by email/anonymous id); account requests come from users. A
 * background worker executes approved requests and writes an audit event.
 */
@Schema({
  timestamps: true
})
export class DeletionRequestModel extends Document {
  @Prop({ required: true, index: true })
  teamId: string

  @Prop({ index: true })
  formId?: string

  @Prop({ type: String, required: true, enum: Object.values(DeletionRequestTypeEnum) })
  type: DeletionRequestTypeEnum

  @Prop({
    type: String,
    required: true,
    default: DeletionRequestStatusEnum.PENDING
  })
  status: DeletionRequestStatusEnum

  // What the requester wants removed, e.g. { email, anonymousId, submissionIds }
  @Prop({ type: Object, required: true })
  requestPayload: Record<string, any>

  @Prop()
  requestedBy?: string

  @Prop()
  processedBy?: string

  @Prop()
  processedAt?: number

  @Prop()
  resultNote?: string
}

export const DeletionRequestSchema = SchemaFactory.createForClass(DeletionRequestModel)

DeletionRequestSchema.index({ teamId: 1, status: 1, createdAt: -1 })
