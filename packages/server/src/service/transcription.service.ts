import { GetObjectCommand } from '@aws-sdk/client-s3'
import { FieldKindEnum, FormField } from '@myform/shared-types-enums'
import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import axios from 'axios'
import { promises as fs } from 'fs'
import { Model } from 'mongoose'
import { OpenAI } from 'openai'
import { resolve, sep } from 'path'

import { FormService } from './form.service'
import { getS3Client, isS3Configured } from '@config'
import {
  APP_HOMEPAGE_URL,
  TRANSCRIPTION_API_KEY,
  TRANSCRIPTION_BASE_URL,
  TRANSCRIPTION_LANGUAGE,
  TRANSCRIPTION_MODEL,
  UPLOAD_DIR
} from '@environments'
import {
  MediaAssetModel,
  MediaAssetStatusEnum,
  TranscriptRecord,
  TranscriptStatusEnum
} from '@model'
import { flattenFields } from '@myform/answer-utils'
import { helper, timestamp } from '@myform/utils'

export const TRANSCRIPTION_PROVIDER = 'openai'

export interface TranscriptionConfiguration {
  apiKey?: string
  baseURL?: string
  language?: string
  model: string
}

/**
 * Transcribes respondent voice recordings through the configured OpenAI-compatible
 * audio transcription provider. Runs inside the TranscriptionQueue worker; every
 * external side effect (the provider call) happens only after the asset is claimed
 * for processing, and completed transcripts are never reprocessed.
 */
@Injectable()
export class TranscriptionService {
  constructor(
    @InjectModel(MediaAssetModel.name) private readonly model: Model<MediaAssetModel>,
    private readonly formService: FormService
  ) {}

  async transcribe(mediaAssetId: string): Promise<void> {
    const asset = await this.model.findById(mediaAssetId)

    if (!asset || asset.status === MediaAssetStatusEnum.DELETED) {
      return
    }

    // Mongoose documents expose both _id and the id virtual; plain objects
    // (lean results, tests) only carry _id.
    const assetId = String((asset as any)._id ?? (asset as any).id ?? mediaAssetId)

    // Only voice recordings carry transcriptions; video and screen answers are
    // archived as uploaded.
    if (asset.kind !== FieldKindEnum.VOICE_RECORDING) {
      return
    }

    // Idempotency: transcripts that already reached a terminal state are never
    // reprocessed, so replayed or duplicate queue jobs never bill the provider twice.
    const currentStatus = asset.transcript?.status

    if (
      currentStatus !== TranscriptStatusEnum.PENDING &&
      currentStatus !== TranscriptStatusEnum.PROCESSING
    ) {
      return
    }

    const field = await this.findVoiceField(asset.formId, asset.fieldId)

    // Transcription is enabled by default for voice fields; form owners opt out
    // per field. Fields removed from the form (or no longer voice fields) are
    // skipped rather than failed, so the asset is not retried forever.
    if (
      !field ||
      field.kind !== FieldKindEnum.VOICE_RECORDING ||
      field.properties?.transcribe === false
    ) {
      await this.model.updateOne(
        { _id: assetId },
        { 'transcript.status': TranscriptStatusEnum.SKIPPED }
      )
      return
    }

    const configuration = this.getConfiguration()

    if (helper.isEmpty(configuration.apiKey)) {
      throw new BadRequestException('Transcription is not configured')
    }

    await this.model.updateOne(
      { _id: assetId },
      {
        status: MediaAssetStatusEnum.PROCESSING,
        'transcript.status': TranscriptStatusEnum.PROCESSING
      }
    )

    const audio = await this.downloadAudio(asset)
    const text = await this.requestTranscription(
      audio,
      asset.filename,
      asset.mimetype,
      configuration
    )

    const transcript: TranscriptRecord = {
      text,
      provider: TRANSCRIPTION_PROVIDER,
      language: configuration.language,
      status: TranscriptStatusEnum.COMPLETED,
      completedAt: timestamp()
    }

    await this.model.updateOne(
      { _id: assetId },
      {
        status: MediaAssetStatusEnum.READY,
        transcript
      }
    )
  }

  /**
   * Persists the terminal failure state after the queue exhausted its retries.
   */
  async markFailed(mediaAssetId: string, error: string): Promise<void> {
    await this.model.updateOne(
      { _id: mediaAssetId, kind: FieldKindEnum.VOICE_RECORDING },
      {
        status: MediaAssetStatusEnum.FAILED,
        'transcript.status': TranscriptStatusEnum.FAILED,
        'transcript.error': error
      }
    )
  }

  protected getConfiguration(): TranscriptionConfiguration {
    return {
      apiKey: TRANSCRIPTION_API_KEY,
      baseURL: TRANSCRIPTION_BASE_URL,
      language: TRANSCRIPTION_LANGUAGE,
      model: TRANSCRIPTION_MODEL
    }
  }

  private async findVoiceField(formId: string, fieldId: string): Promise<FormField | undefined> {
    const form = await this.formService.findById(formId)

    if (!form) {
      return
    }

    return flattenFields((form.fields || []) as FormField[], true).find(
      field => field.id === fieldId
    )
  }

  protected async downloadAudio(asset: MediaAssetModel): Promise<Buffer> {
    // Locally stored recordings are read straight from the upload directory instead
    // of looping back through the web server.
    const localPrefix = `${APP_HOMEPAGE_URL.replace(/\/+$/, '')}/static/upload/`

    if (
      helper.isEmpty(asset.key) &&
      helper.isEmpty(asset.bucket) &&
      asset.url.startsWith(localPrefix)
    ) {
      return this.readLocalAudio(asset.filename)
    }

    if (helper.isValid(asset.key) && helper.isValid(asset.bucket) && isS3Configured()) {
      const result = await getS3Client().send(
        new GetObjectCommand({
          Bucket: asset.bucket,
          Key: asset.key
        })
      )

      if (!result.Body) {
        throw new BadRequestException('The recording could not be read from storage')
      }

      return Buffer.from(await result.Body.transformToByteArray())
    }

    const response = await axios.get(asset.url, { responseType: 'arraybuffer' })
    return Buffer.from(response.data)
  }

  private async readLocalAudio(filename: string): Promise<Buffer> {
    const uploadRoot = resolve(UPLOAD_DIR)
    const path = resolve(uploadRoot, filename)

    // Stored filenames are server generated (nanoid + extension); the containment
    // check keeps a tampered record from reading outside the upload directory.
    if (helper.isEmpty(filename) || !path.startsWith(uploadRoot + sep)) {
      throw new BadRequestException('Invalid recording file name')
    }

    return fs.readFile(path)
  }

  protected async requestTranscription(
    audio: Buffer,
    filename: string,
    mimetype: string,
    configuration: TranscriptionConfiguration
  ): Promise<string> {
    const client = new OpenAI({
      apiKey: configuration.apiKey,
      baseURL: configuration.baseURL
    })

    const file = new File([audio], filename, { type: mimetype })
    const transcription = await client.audio.transcriptions.create({
      model: configuration.model,
      file,
      language: configuration.language || undefined
    })

    return transcription.text
  }
}
