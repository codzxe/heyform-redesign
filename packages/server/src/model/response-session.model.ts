import { Answer, HiddenFieldAnswer, Variable } from '@myform/shared-types-enums'
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

/**
 * A respondent's saved, unfinished form state. Created when a respondent
 * starts a form with resume enabled and updated as they progress. The resume
 * token is a random secret; only its hash is stored.
 */
@Schema({
  timestamps: true
})
export class ResponseSessionModel extends Document {
  @Prop({ required: true, index: true })
  formId: string

  @Prop({ required: true })
  tokenHash: string

  // Anonymous device identifier, so a respondent can be offered their own
  // unfinished sessions without authentication.
  @Prop({ index: true })
  anonymousId?: string

  @Prop({ type: [Object], default: [] })
  answers: Answer[]

  @Prop({ type: [Object], default: [] })
  hiddenFields?: HiddenFieldAnswer[]

  @Prop({ type: [Object], default: [] })
  variables?: Variable[]

  @Prop()
  currentFieldId?: string

  @Prop()
  startAt?: number

  @Prop()
  expiresAt: number

  @Prop()
  completedAt?: number

  @Prop()
  abandonedAt?: number
}

export const ResponseSessionSchema = SchemaFactory.createForClass(ResponseSessionModel)

ResponseSessionSchema.index({ formId: 1, tokenHash: 1 }, { unique: true })
ResponseSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
