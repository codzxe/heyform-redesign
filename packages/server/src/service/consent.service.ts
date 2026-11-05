import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'

import { ConsentRecordModel } from '@model'
import { timestamp } from '@myform/utils'

export interface RecordConsentInput {
  formId: string
  submissionId?: string
  anonymousId: string
  accepted: boolean
  consentText: string
  consentVersion: string
}

/** Timestamped GDPR consent records attached to form submissions. */
@Injectable()
export class ConsentService {
  constructor(
    @InjectModel(ConsentRecordModel.name) private readonly model: Model<ConsentRecordModel>
  ) {}

  async record(input: RecordConsentInput): Promise<void> {
    await this.model.create({
      ...input,
      acceptedAt: timestamp()
    })
  }

  async listByForm(formId: string, limit = 100): Promise<ConsentRecordModel[]> {
    return this.model.find({ formId }).sort({ acceptedAt: -1 }).limit(limit).lean()
  }
}
