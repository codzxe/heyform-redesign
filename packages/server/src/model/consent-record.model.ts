import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

/**
 * A timestamped record that a respondent accepted (or rejected) the form's
 * GDPR consent text at submission time.
 */
@Schema({
  timestamps: true
})
export class ConsentRecordModel extends Document {
  @Prop({ required: true, index: true })
  formId: string

  @Prop({ index: true })
  submissionId?: string

  @Prop({ required: true })
  anonymousId: string

  @Prop({ required: true })
  accepted: boolean

  @Prop({ required: true })
  consentText: string

  @Prop({ required: true })
  consentVersion: string

  @Prop()
  acceptedAt: number
}

export const ConsentRecordSchema = SchemaFactory.createForClass(ConsentRecordModel)

ConsentRecordSchema.index({ formId: 1, acceptedAt: -1 })
