import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

/**
 * A revocable, optionally expiring public share of a form's analytics
 * dashboard. The share token is a random secret; only its hash is stored.
 */
@Schema({
  timestamps: true
})
export class DashboardShareModel extends Document {
  @Prop({ required: true, index: true })
  teamId: string

  @Prop({ required: true, index: true })
  formId: string

  @Prop({ required: true, unique: true })
  tokenHash: string

  // Which metric groups the public dashboard may expose
  @Prop({ type: [String], default: () => ['overview', 'trends', 'questions'] })
  metrics: string[]

  @Prop()
  expiresAt?: number

  @Prop()
  revokedAt?: number

  @Prop()
  createdBy: string
}

export const DashboardShareSchema = SchemaFactory.createForClass(DashboardShareModel)

DashboardShareSchema.index({ formId: 1, revokedAt: 1 })
