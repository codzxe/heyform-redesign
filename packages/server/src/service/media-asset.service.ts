import { FieldKindEnum, MEDIA_RECORDING_FIELD_KINDS } from '@myform/shared-types-enums'
import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'

import { MediaAssetModel, MediaAssetStatusEnum } from '@model'

export interface CreateMediaAssetInput {
  teamId: string
  formId: string
  fieldId: string
  kind: FieldKindEnum
  filename: string
  url: string
  key?: string
  bucket?: string
  mimetype: string
  size: number
  durationSeconds?: number
}

/** Persists and queries respondent recordings and their transcriptions. */
@Injectable()
export class MediaAssetService {
  constructor(@InjectModel(MediaAssetModel.name) private readonly model: Model<MediaAssetModel>) {}

  isRecordingKind(kind: FieldKindEnum): boolean {
    return MEDIA_RECORDING_FIELD_KINDS.includes(kind)
  }

  async create(input: CreateMediaAssetInput): Promise<MediaAssetModel> {
    return this.model.create({
      ...input,
      status: MediaAssetStatusEnum.UPLOADED,
      transcript:
        input.kind === FieldKindEnum.VOICE_RECORDING ? { status: 'pending' as const } : undefined
    })
  }

  async linkSubmission(formId: string, submissionId: string, urls: string[]): Promise<number> {
    if (urls.length < 1) {
      return 0
    }

    const result = await this.model.updateMany(
      { formId, url: { $in: urls }, submissionId: { $exists: false } },
      { submissionId }
    )
    return result.modifiedCount ?? 0
  }

  async findPendingTranscriptions(limit = 20): Promise<MediaAssetModel[]> {
    return this.model
      .find({
        kind: FieldKindEnum.VOICE_RECORDING,
        status: { $ne: MediaAssetStatusEnum.DELETED },
        'transcript.status': 'pending'
      })
      .limit(limit)
      .lean()
  }

  async page(
    formId: string,
    options: { fieldId?: string; page?: number; limit?: number } = {}
  ): Promise<{ items: MediaAssetModel[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, options.page ?? 1)
    const limit = Math.min(100, Math.max(1, options.limit ?? 20))
    const filter: Record<string, any> = { formId, status: { $ne: MediaAssetStatusEnum.DELETED } }

    if (options.fieldId) {
      filter.fieldId = options.fieldId
    }

    const [items, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.model.countDocuments(filter)
    ])

    return { items, total, page, limit }
  }

  async countByKind(formId: string, since?: number): Promise<Record<string, number>> {
    const match: Record<string, any> = { formId, status: { $ne: MediaAssetStatusEnum.DELETED } }
    if (since) {
      match.createdAt = { $gte: new Date(since * 1000) }
    }

    const rows = await this.model.aggregate<{
      _id: FieldKindEnum
      count: number
    }>([{ $match: match }, { $group: { _id: '$kind', count: { $sum: 1 } } }])

    const result: Record<string, number> = {
      voice: 0,
      video: 0,
      screen: 0
    }
    for (const row of rows) {
      if (row._id === FieldKindEnum.VOICE_RECORDING) result.voice = row.count
      if (row._id === FieldKindEnum.VIDEO_RECORDING) result.video = row.count
      if (row._id === FieldKindEnum.SCREEN_RECORDING) result.screen = row.count
    }
    return result
  }
}
