import { FormField } from '@myform/shared-types-enums'
import { InjectQueue } from '@nestjs/bull'
import { Injectable } from '@nestjs/common'
import { Queue } from 'bull'

import { MediaAssetService } from './media-asset.service'
import { SavedUploadFile } from '@config'
import { TranscriptStatusEnum } from '@model'
import { FormModel } from '@model'

export interface HandleRecordingUploadParams {
  form: Pick<FormModel, 'id' | 'teamId'>
  field: FormField
  savedFile: SavedUploadFile
  // The public URL that was returned to the respondent. Stored verbatim so
  // completeSubmission can link the asset to its submission by matching URLs.
  url: string
  mimetype: string
}

/**
 * Tracks recording answers as media assets right after the raw file was stored,
 * and queues voice recordings for transcription.
 */
@Injectable()
export class MediaUploadService {
  constructor(
    private readonly mediaAssetService: MediaAssetService,
    @InjectQueue('TranscriptionQueue')
    private readonly transcriptionQueue: Queue
  ) {}

  async handleRecordingUpload(
    params: HandleRecordingUploadParams
  ): Promise<{ mediaAssetId: string }> {
    const asset = await this.mediaAssetService.create({
      teamId: params.form.teamId,
      formId: params.form.id,
      fieldId: params.field.id,
      kind: params.field.kind,
      filename: params.savedFile.filename,
      url: params.url,
      key: params.savedFile.key,
      bucket: params.savedFile.bucket,
      mimetype: params.savedFile.mimetype || params.mimetype,
      size: params.savedFile.size
    })

    // Mongoose documents expose both _id and the id virtual; plain objects
    // only carry _id.
    const mediaAssetId = String((asset as any)._id ?? (asset as any).id)

    // Only voice recordings start with a pending transcript; video and screen
    // recordings are archived as uploaded and are never enqueued.
    if (asset.transcript?.status === TranscriptStatusEnum.PENDING) {
      await this.transcriptionQueue.add({ mediaAssetId })
    }

    return { mediaAssetId }
  }
}
