import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export enum AuditActorTypeEnum {
  USER = 'user',
  SYSTEM = 'system',
  RESPONDENT = 'respondent'
}

/**
 * Persistent, append-only audit trail for security-relevant and
 * privacy-relevant events: consent, exports, deletion requests and execution,
 * administrative changes, authentication events.
 */
@Schema({
  timestamps: true
})
export class AuditLogModel extends Document {
  @Prop({ required: true, index: true })
  teamId: string

  @Prop({ index: true })
  formId?: string

  @Prop({ required: true, enum: Object.values(AuditActorTypeEnum) })
  actorType: AuditActorTypeEnum

  @Prop()
  actorId?: string

  // Machine-readable action key, e.g. "consent.recorded", "deletion.executed"
  @Prop({ required: true, index: true })
  action: string

  @Prop({ type: Object })
  target?: Record<string, any>

  @Prop({ type: Object })
  meta?: Record<string, any>

  @Prop()
  ip?: string
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLogModel)

AuditLogSchema.index({ teamId: 1, createdAt: -1 })
AuditLogSchema.index({ teamId: 1, action: 1, createdAt: -1 })
