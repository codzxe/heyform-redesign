import { FieldKindEnum, MEDIA_RECORDING_FIELD_KINDS } from '@myform/shared-types-enums'
import { BadRequestException } from '@nestjs/common'
import assert from 'assert'
import { promises as fs } from 'fs'
import { join } from 'path'

import { getUploadType, isUploadFileContentValid } from '../src/config/upload'
import { UploadController } from '../src/controller/upload.controller'
import {
  TRANSCRIPTION_API_KEY,
  TRANSCRIPTION_BASE_URL,
  TRANSCRIPTION_MODEL,
  UPLOAD_DIR
} from '../src/environments'
import { MediaAssetModel, MediaAssetStatusEnum, TranscriptStatusEnum } from '../src/model'
import { MediaAssetsResolver } from '../src/resolver/form/media-assets.resolver'
import { MediaAssetService } from '../src/service/media-asset.service'
import { MediaUploadService } from '../src/service/media-upload.service'
import {
  TranscriptionConfiguration,
  TranscriptionService
} from '../src/service/transcription.service'

import { TranscriptionQueue } from '../src/queue/transcription.queue'

const WEBM_MAGIC = [0x1a, 0x45, 0xdf, 0xa3]

function webmBuffer(): Buffer {
  return Buffer.from([...WEBM_MAGIC, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01])
}

function mp4Buffer(): Buffer {
  return Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypM4A ')])
}

function matchesFilter(document: Record<string, any>, filter: Record<string, any>): boolean {
  for (const [key, condition] of Object.entries(filter)) {
    const value = key.split('.').reduce((acc, part) => (acc == null ? acc : acc[part]), document)

    if (condition && typeof condition === 'object' && !Array.isArray(condition)) {
      if ('$in' in condition) {
        if (!condition.$in.includes(value)) {
          return false
        }
      } else if ('$ne' in condition) {
        if (value === condition.$ne) {
          return false
        }
      } else if ('$exists' in condition) {
        if ((value !== undefined) !== Boolean(condition.$exists)) {
          return false
        }
      } else if ('$gte' in condition) {
        if (!(value >= condition.$gte)) {
          return false
        }
      } else {
        return false
      }
    } else if (value !== condition) {
      return false
    }
  }

  return true
}

function applyUpdates(document: Record<string, any>, updates: Record<string, any>): void {
  for (const [key, value] of Object.entries(updates)) {
    const parts = key.split('.')
    let target = document

    while (parts.length > 1) {
      const part = parts.shift() as string
      target[part] = target[part] || {}
      target = target[part]
    }

    target[parts[0]] = value
  }
}

function createFakeMediaAssetModel(documents: Record<string, any>[] = []) {
  return {
    documents,
    create: async (input: Record<string, any>) => {
      const document = {
        _id: `asset_${documents.length + 1}`,
        createdAt: new Date(Date.UTC(2024, 0, 2, 3, 4, 5)),
        ...input
      }
      documents.push(document)
      return document
    },
    findById: async (id: string) =>
      documents.find(document => String(document._id) === String(id)) || null,
    updateOne: async (filter: Record<string, any>, updates: Record<string, any>) => {
      const matched = documents.filter(document => matchesFilter(document, filter))
      matched.forEach(document => applyUpdates(document, updates))
      return { acknowledged: true, modifiedCount: matched.length }
    },
    updateMany: async (filter: Record<string, any>, updates: Record<string, any>) => {
      const matched = documents.filter(document => matchesFilter(document, filter))
      matched.forEach(document => applyUpdates(document, updates))
      return { acknowledged: true, modifiedCount: matched.length }
    },
    find: (filter: Record<string, any>) => {
      const matched = documents.filter(document => matchesFilter(document, filter))

      return {
        sort: () => ({
          skip: (offset: number) => ({
            limit: (count: number) => ({
              lean: async () =>
                matched.slice(offset, offset + count).map(document => ({ ...document }))
            })
          })
        })
      }
    },
    countDocuments: async (filter: Record<string, any>) =>
      documents.filter(document => matchesFilter(document, filter)).length
  }
}

function createVoiceAsset(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    _id: 'asset_1',
    teamId: 'team_1',
    formId: 'form_1',
    fieldId: 'voice_1',
    kind: FieldKindEnum.VOICE_RECORDING,
    filename: 'abc123.webm',
    url: 'http://example.test/static/upload/abc123.webm',
    key: undefined,
    bucket: undefined,
    mimetype: 'audio/webm',
    size: 120,
    status: MediaAssetStatusEnum.UPLOADED,
    transcript: { status: TranscriptStatusEnum.PENDING },
    ...overrides
  }
}

function createFormService(fields: any[]) {
  return {
    findById: async (formId: string) => (formId === 'form_1' ? { id: 'form_1', fields } : null)
  } as any
}

class TestableTranscriptionService extends TranscriptionService {
  public downloads: string[] = []
  public requests: Array<Record<string, any>> = []
  public configuration: TranscriptionConfiguration = {
    apiKey: 'test-api-key',
    model: 'whisper-1'
  }

  protected getConfiguration(): TranscriptionConfiguration {
    return this.configuration
  }

  protected async downloadAudio(asset: MediaAssetModel): Promise<Buffer> {
    this.downloads.push(asset.filename)
    return webmBuffer()
  }

  protected async requestTranscription(
    audio: Buffer,
    filename: string,
    mimetype: string,
    configuration: TranscriptionConfiguration
  ): Promise<string> {
    this.requests.push({ audioLength: audio.length, filename, mimetype, configuration })
    return 'Hello from the recording'
  }
}

class UnconfiguredTranscriptionService extends TranscriptionService {
  protected getConfiguration(): TranscriptionConfiguration {
    return { model: TRANSCRIPTION_MODEL }
  }
}

function testEnvironmentFallsBackToOpenAICredentials() {
  if (!process.env.TRANSCRIPTION_MODEL) {
    assert.strictEqual(TRANSCRIPTION_MODEL, 'whisper-1')
  }

  assert.strictEqual(
    TRANSCRIPTION_API_KEY,
    process.env.TRANSCRIPTION_API_KEY || process.env.OPENAI_API_KEY
  )
  assert.strictEqual(
    TRANSCRIPTION_BASE_URL,
    process.env.TRANSCRIPTION_BASE_URL || process.env.OPENAI_BASE_URL
  )
}

function testAdmitsBrowserRecordingMimeTypes() {
  assert.ok(getUploadType('answer.webm', 'audio/webm'))
  assert.ok(getUploadType('answer.m4a', 'audio/mp4'))
  assert.ok(getUploadType('answer.mp4', 'audio/mp4'))
  assert.ok(getUploadType('clip.webm', 'video/webm'))
  assert.ok(getUploadType('answer.webm', 'audio/webm; charset=utf-8'))
  assert.strictEqual(getUploadType('answer.wav', 'audio/wav'), undefined)
  assert.strictEqual(getUploadType('answer.webm.exe', 'audio/webm'), undefined)

  assert.strictEqual(
    isUploadFileContentValid({
      buffer: webmBuffer(),
      mimetype: 'audio/webm',
      originalname: 'answer.webm'
    }),
    true
  )
  assert.strictEqual(
    isUploadFileContentValid({
      buffer: mp4Buffer(),
      mimetype: 'audio/mp4',
      originalname: 'answer.m4a'
    }),
    true
  )
  assert.strictEqual(
    isUploadFileContentValid({
      buffer: Buffer.from('definitely not audio'),
      mimetype: 'audio/webm',
      originalname: 'answer.webm'
    }),
    false
  )
}

async function testTranscriptionGuardsAndHappyPath() {
  // Not configured: the provider is never called and the asset stays untouched.
  const unconfiguredModel = createFakeMediaAssetModel([createVoiceAsset()])
  const unconfigured = new UnconfiguredTranscriptionService(
    unconfiguredModel as any,
    createFormService([{ id: 'voice_1', kind: FieldKindEnum.VOICE_RECORDING, properties: {} }])
  )

  await assert.rejects(unconfigured.transcribe('asset_1'), (err: any) => {
    assert.ok(err instanceof BadRequestException)
    assert.strictEqual(err.message, 'Transcription is not configured')
    return true
  })
  assert.strictEqual(unconfiguredModel.documents[0].transcript.status, 'pending')

  // Completed transcripts are never reprocessed (idempotent jobs).
  const completedModel = createFakeMediaAssetModel([
    createVoiceAsset({ transcript: { status: 'completed', text: 'done' } })
  ])
  const completedService = new TestableTranscriptionService(
    completedModel as any,
    createFormService([])
  )

  await completedService.transcribe('asset_1')
  assert.strictEqual(completedService.downloads.length, 0)
  assert.strictEqual(completedService.requests.length, 0)
  assert.strictEqual(completedModel.documents[0].transcript.text, 'done')

  // Non-voice assets are archived as uploaded, without transcription.
  const videoModel = createFakeMediaAssetModel([
    createVoiceAsset({
      kind: FieldKindEnum.VIDEO_RECORDING,
      transcript: undefined
    })
  ])
  const videoService = new TestableTranscriptionService(videoModel as any, createFormService([]))

  await videoService.transcribe('asset_1')
  assert.strictEqual(videoService.downloads.length, 0)
  assert.strictEqual(videoService.requests.length, 0)
  assert.strictEqual(videoModel.documents[0].status, MediaAssetStatusEnum.UPLOADED)

  // Form owners can opt out per field; opted-out assets are skipped, not failed.
  const skippedModel = createFakeMediaAssetModel([createVoiceAsset()])
  const skippedService = new TestableTranscriptionService(
    skippedModel as any,
    createFormService([
      { id: 'voice_1', kind: FieldKindEnum.VOICE_RECORDING, properties: { transcribe: false } }
    ])
  )

  await skippedService.transcribe('asset_1')
  assert.strictEqual(skippedModel.documents[0].transcript.status, 'skipped')
  assert.strictEqual(skippedService.requests.length, 0)

  // Happy path: claim, download, call the provider, persist the transcript.
  const model = createFakeMediaAssetModel([createVoiceAsset()])
  const service = new TestableTranscriptionService(
    model as any,
    createFormService([{ id: 'voice_1', kind: FieldKindEnum.VOICE_RECORDING, properties: {} }])
  )
  service.configuration = { apiKey: 'test-api-key', model: 'whisper-1', language: 'de' }

  await service.transcribe('asset_1')

  assert.deepStrictEqual(service.downloads, ['abc123.webm'])
  assert.strictEqual(service.requests.length, 1)
  assert.strictEqual(service.requests[0].filename, 'abc123.webm')
  assert.strictEqual(service.requests[0].mimetype, 'audio/webm')
  assert.strictEqual(service.requests[0].configuration.model, 'whisper-1')

  const document = model.documents[0]
  assert.strictEqual(document.status, MediaAssetStatusEnum.READY)
  assert.strictEqual(document.transcript.status, TranscriptStatusEnum.COMPLETED)
  assert.strictEqual(document.transcript.text, 'Hello from the recording')
  assert.strictEqual(document.transcript.provider, 'openai')
  assert.strictEqual(document.transcript.language, 'de')
  assert.ok(Number.isFinite(document.transcript.completedAt))

  // Terminal failure state written by the queue after exhausting retries.
  await service.markFailed('asset_1', 'provider unavailable')
  assert.strictEqual(document.status, MediaAssetStatusEnum.FAILED)
  assert.strictEqual(document.transcript.status, TranscriptStatusEnum.FAILED)
  assert.strictEqual(document.transcript.error, 'provider unavailable')
}

async function testMediaAssetServiceLinkAndPage() {
  const model = createFakeMediaAssetModel()
  const service = new MediaAssetService(model as any)

  const voice = await service.create({
    teamId: 'team_1',
    formId: 'form_1',
    fieldId: 'voice_1',
    kind: FieldKindEnum.VOICE_RECORDING,
    filename: 'voice.webm',
    url: 'http://example.test/static/upload/voice.webm',
    mimetype: 'audio/webm',
    size: 120
  })
  const video = await service.create({
    teamId: 'team_1',
    formId: 'form_1',
    fieldId: 'video_1',
    kind: FieldKindEnum.VIDEO_RECORDING,
    filename: 'video.webm',
    url: 'http://example.test/static/upload/video.webm',
    mimetype: 'video/webm',
    size: 480
  })

  assert.strictEqual(voice.transcript.status, 'pending')
  assert.strictEqual(video.transcript, undefined)
  assert.strictEqual(service.isRecordingKind(FieldKindEnum.VOICE_RECORDING), true)
  assert.strictEqual(service.isRecordingKind(FieldKindEnum.FILE_UPLOAD), false)
  assert.ok(MEDIA_RECORDING_FIELD_KINDS.every(kind => service.isRecordingKind(kind)))

  // Only matching, still unlinked assets on the same form are linked.
  model.documents[1].submissionId = 'submission_earlier'

  const linked = await service.linkSubmission('form_1', 'submission_1', [
    voice.url,
    video.url,
    'http://example.test/static/upload/missing.webm'
  ])

  assert.strictEqual(linked, 1)
  assert.strictEqual(model.documents[0].submissionId, 'submission_1')
  assert.strictEqual(model.documents[1].submissionId, 'submission_earlier')

  // Pagination filters by field, hides deleted assets and clamps the limit.
  await service.create({
    teamId: 'team_1',
    formId: 'form_1',
    fieldId: 'voice_1',
    kind: FieldKindEnum.VOICE_RECORDING,
    filename: 'voice2.webm',
    url: 'http://example.test/static/upload/voice2.webm',
    mimetype: 'audio/webm',
    size: 130
  })
  model.documents[2].status = MediaAssetStatusEnum.DELETED

  const page = await service.page('form_1', { fieldId: 'voice_1', page: 1, limit: 10 })
  assert.strictEqual(page.total, 1)
  assert.strictEqual(page.items.length, 1)
  assert.strictEqual(page.items[0].fieldId, 'voice_1')

  const clamped = await service.page('form_1', { page: 0, limit: 500 })
  assert.strictEqual(clamped.page, 1)
  assert.strictEqual(clamped.limit, 100)
  assert.strictEqual(clamped.total, 2)
}

async function testMediaUploadServiceEnqueuesVoiceOnly() {
  const added: Record<string, any>[] = []
  const queue = {
    add: async (data: Record<string, any>) => {
      added.push(data)
    }
  }
  const model = createFakeMediaAssetModel()
  const service = new MediaUploadService(new MediaAssetService(model as any), queue as any)

  const voice = await service.handleRecordingUpload({
    form: { id: 'form_1', teamId: 'team_1' },
    field: { id: 'voice_1', kind: FieldKindEnum.VOICE_RECORDING } as any,
    savedFile: {
      filename: 'abc123.webm',
      mimetype: 'audio/webm',
      originalname: 'answer.webm',
      size: 120
    },
    url: 'http://example.test/static/upload/abc123.webm',
    mimetype: 'audio/webm'
  })

  assert.strictEqual(voice.mediaAssetId, 'asset_1')
  assert.deepStrictEqual(added, [{ mediaAssetId: 'asset_1' }])
  assert.strictEqual(model.documents[0].url, 'http://example.test/static/upload/abc123.webm')
  assert.strictEqual(model.documents[0].kind, FieldKindEnum.VOICE_RECORDING)

  const video = await service.handleRecordingUpload({
    form: { id: 'form_1', teamId: 'team_1' },
    field: { id: 'video_1', kind: FieldKindEnum.VIDEO_RECORDING } as any,
    savedFile: {
      filename: 'def456.webm',
      mimetype: 'video/webm',
      originalname: 'clip.webm',
      size: 480
    },
    url: 'http://example.test/static/upload/def456.webm',
    mimetype: 'video/webm'
  })

  assert.strictEqual(video.mediaAssetId, 'asset_2')
  assert.strictEqual(added.length, 1)
}

async function testTranscriptionQueueRetryAndFailureHandling() {
  const failed: Array<{ mediaAssetId: string; error: string }> = []
  let discarded = false

  const queue = new TranscriptionQueue({
    transcribe: async () => {
      throw new Error('boom')
    },
    markFailed: async (mediaAssetId: string, error: string) => {
      failed.push({ mediaAssetId, error })
    }
  } as any)

  const createJob = (mediaAssetId: string, attemptsMade: number, attempts: number) =>
    ({
      data: { mediaAssetId },
      attemptsMade,
      opts: { attempts },
      failedReason: 'boom',
      discard: async () => {
        discarded = true
      }
    }) as any

  // Intermediate attempts rethrow for Bull's backoff without writing the failure.
  await assert.rejects(queue.process(createJob('asset_1', 0, 3)), /boom/)
  await assert.rejects(queue.process(createJob('asset_1', 1, 3)), /boom/)
  assert.strictEqual(failed.length, 0)

  // The final attempt persists the error before rethrowing.
  await assert.rejects(queue.process(createJob('asset_1', 2, 3)), /boom/)
  assert.deepStrictEqual(failed, [{ mediaAssetId: 'asset_1', error: 'boom' }])

  // Failures the processor never sees (e.g. timeouts) are covered by onFailed.
  await queue.onFailed(createJob('asset_2', 3, 3))
  assert.deepStrictEqual(failed[1], { mediaAssetId: 'asset_2', error: 'boom' })
  assert.strictEqual(discarded, true)

  // Non-final onFailed events leave the transcript retryable.
  await queue.onFailed(createJob('asset_3', 1, 3))
  assert.strictEqual(failed.length, 2)
}

function createRecordingControllerFixture() {
  const recordingUploads: Array<Record<string, any>> = []
  const form = {
    id: 'form_1',
    teamId: 'team_1',
    suspended: false,
    settings: { active: true },
    fields: [
      { id: 'voice_1', kind: FieldKindEnum.VOICE_RECORDING, properties: {} },
      { id: 'file_1', kind: FieldKindEnum.FILE_UPLOAD, properties: {} }
    ]
  }
  const redisService = {
    throttler: async () => {}
  }

  const controller = new UploadController(
    { getSession: () => undefined } as any,
    {
      decryptToken: () => ({ formId: 'form_1', timestamp: Math.floor(Date.now() / 1_000) }),
      assertOpenToken: () => {}
    } as any,
    { findById: async () => form } as any,
    redisService as any,
    new MediaAssetService(createFakeMediaAssetModel() as any),
    {
      handleRecordingUpload: async (params: Record<string, any>) => {
        recordingUploads.push(params)
        return { mediaAssetId: `asset_${recordingUploads.length}` }
      }
    } as any,
    {
      findMemberById: async () => ({ memberId: 'user_1', teamId: 'team_1' })
    } as any
  )

  const respondentRequest = (headers: Record<string, string>) => ({
    cookies: {},
    query: {},
    get: (name: string) => headers[name]
  })

  return { controller, recordingUploads, form, respondentRequest }
}

async function testUploadControllerRecordingBranch() {
  // saveUploadedFile writes real files into the local upload directory; snapshot
  // the directory so every file this test creates is removed afterwards.
  const snapshot = new Set((await fs.readdir(UPLOAD_DIR).catch(() => [] as string[])) as string[])

  try {
    const { controller, recordingUploads, respondentRequest } = createRecordingControllerFixture()

    // Respondent voice answer: recording fields are admitted, tracked and the
    // response carries the additive mediaAssetId.
    const response = await controller.index(
      respondentRequest({
        'x-device-id': 'device_1',
        'x-myform-field-id': 'voice_1',
        'x-myform-form-id': 'form_1',
        'x-myform-open-token': 'encrypted_token'
      }) as any,
      {
        buffer: webmBuffer(),
        mimetype: 'audio/webm',
        originalname: 'answer.webm',
        size: webmBuffer().length
      } as any
    )

    assert.strictEqual(response.filename, 'answer.webm')
    assert.strictEqual(response.size, webmBuffer().length)
    assert.match(response.url, /\/static\/upload\//)
    assert.strictEqual(response.mediaAssetId, 'asset_1')
    assert.strictEqual(recordingUploads.length, 1)
    assert.strictEqual(recordingUploads[0].form.id, 'form_1')
    assert.strictEqual(recordingUploads[0].field.id, 'voice_1')
    assert.strictEqual(recordingUploads[0].field.kind, FieldKindEnum.VOICE_RECORDING)
    assert.strictEqual(recordingUploads[0].url, response.url)
    assert.strictEqual(recordingUploads[0].mimetype, 'audio/webm')
    assert.match(recordingUploads[0].savedFile.filename, /\.webm$/)

    // Regular file answers keep the legacy response shape.
    const fileResponse = await controller.index(
      respondentRequest({
        'x-device-id': 'device_1',
        'x-myform-field-id': 'file_1',
        'x-myform-form-id': 'form_1',
        'x-myform-open-token': 'encrypted_token'
      }) as any,
      {
        buffer: Buffer.concat([
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
          Buffer.from('body')
        ]),
        mimetype: 'image/png',
        originalname: 'photo.png',
        size: 12
      } as any
    )

    assert.strictEqual(fileResponse.mediaAssetId, undefined)
    assert.strictEqual(recordingUploads.length, 1)

    // Non-recording, non-upload fields are still rejected.
    await assert.rejects(
      controller.index(
        respondentRequest({
          'x-device-id': 'device_1',
          'x-myform-field-id': 'unknown_1',
          'x-myform-form-id': 'form_1',
          'x-myform-open-token': 'encrypted_token'
        }) as any,
        {
          buffer: webmBuffer(),
          mimetype: 'audio/webm',
          originalname: 'answer.webm',
          size: webmBuffer().length
        } as any
      ),
      /The upload field is not allowed/
    )
  } finally {
    const created = (await fs.readdir(UPLOAD_DIR).catch(() => [] as string[])) as string[]

    for (const filename of created) {
      if (!snapshot.has(filename)) {
        await fs.unlink(join(UPLOAD_DIR, filename)).catch(() => {})
      }
    }
  }
}

async function testAuthenticatedSessionRecordingUploads() {
  const snapshot = new Set((await fs.readdir(UPLOAD_DIR).catch(() => [] as string[])) as string[])

  const buildController = (isMember: boolean) => {
    const recordingUploads: Array<Record<string, any>> = []
    const form = {
      id: 'form_1',
      teamId: 'team_1',
      suspended: false,
      settings: { active: true },
      fields: [{ id: 'voice_1', kind: FieldKindEnum.VOICE_RECORDING, properties: {} }]
    }
    const controller = new UploadController(
      {
        getSession: () => ({ id: 'user_1', deviceId: 'device_1', loginAt: 0 }),
        isExpired: async () => false
      } as any,
      {} as any,
      { findById: async () => form } as any,
      { throttler: async () => {} } as any,
      new MediaAssetService(createFakeMediaAssetModel() as any),
      {
        handleRecordingUpload: async (params: Record<string, any>) => {
          recordingUploads.push(params)
          return { mediaAssetId: 'asset_session' }
        }
      } as any,
      {
        findMemberById: async () => (isMember ? { memberId: 'user_1' } : null)
      } as any
    )

    return { controller, recordingUploads }
  }

  const request = {
    cookies: {},
    query: {},
    get: (name: string) =>
      ({
        'x-device-id': 'device_1',
        'x-myform-field-id': 'voice_1',
        'x-myform-form-id': 'form_1'
      })[name]
  }

  try {
    // Team members testing their own form get tracked recording uploads.
    const member = buildController(true)
    const memberResponse = await member.controller.index(
      request as any,
      {
        buffer: webmBuffer(),
        mimetype: 'audio/webm',
        originalname: 'answer.webm',
        size: webmBuffer().length
      } as any
    )

    assert.strictEqual(memberResponse.mediaAssetId, 'asset_session')
    assert.strictEqual(member.recordingUploads.length, 1)

    // Strangers keep the legacy behavior: the upload succeeds, nothing is tracked.
    const stranger = buildController(false)
    const strangerResponse = await stranger.controller.index(
      request as any,
      {
        buffer: webmBuffer(),
        mimetype: 'audio/webm',
        originalname: 'answer.webm',
        size: webmBuffer().length
      } as any
    )

    assert.strictEqual(strangerResponse.mediaAssetId, undefined)
    assert.strictEqual(stranger.recordingUploads.length, 0)
  } finally {
    const created = (await fs.readdir(UPLOAD_DIR).catch(() => [] as string[])) as string[]

    for (const filename of created) {
      if (!snapshot.has(filename)) {
        await fs.unlink(join(UPLOAD_DIR, filename)).catch(() => {})
      }
    }
  }
}

async function testMediaAssetsResolverMapping() {
  const model = createFakeMediaAssetModel()
  const service = new MediaAssetService(model as any)

  await service.create({
    teamId: 'team_1',
    formId: 'form_1',
    fieldId: 'voice_1',
    kind: FieldKindEnum.VOICE_RECORDING,
    filename: 'voice.webm',
    url: 'http://example.test/static/upload/voice.webm',
    mimetype: 'audio/webm',
    size: 120
  })
  applyUpdates(model.documents[0], {
    status: MediaAssetStatusEnum.READY,
    transcript: {
      text: 'Hello',
      provider: 'openai',
      language: 'en',
      status: TranscriptStatusEnum.COMPLETED
    }
  })

  const resolver = new MediaAssetsResolver(service)
  const page = await resolver.mediaAssets({ formId: 'form_1', fieldId: 'voice_1' })

  assert.strictEqual(page.total, 1)
  assert.strictEqual(page.page, 1)
  assert.strictEqual(page.limit, 20)
  assert.strictEqual(page.items.length, 1)
  assert.strictEqual(page.items[0].id, 'asset_1')
  assert.strictEqual(page.items[0].kind, FieldKindEnum.VOICE_RECORDING)
  assert.strictEqual(page.items[0].status, 'ready')
  assert.strictEqual(page.items[0].transcript?.text, 'Hello')
  assert.strictEqual(page.items[0].transcript?.provider, 'openai')
  assert.strictEqual(page.items[0].transcript?.status, 'completed')
  assert.ok(page.items[0].createdAt > 1_600_000_000)
}

async function run() {
  testEnvironmentFallsBackToOpenAICredentials()
  testAdmitsBrowserRecordingMimeTypes()
  await testTranscriptionGuardsAndHappyPath()
  await testMediaAssetServiceLinkAndPage()
  await testMediaUploadServiceEnqueuesVoiceOnly()
  await testTranscriptionQueueRetryAndFailureHandling()
  await testUploadControllerRecordingBranch()
  await testAuthenticatedSessionRecordingUploads()
  await testMediaAssetsResolverMapping()
}

if (require.main === module) {
  run().catch(error => {
    // eslint-disable-next-line no-console
    console.error(error)
    process.exitCode = 1
  })
}
