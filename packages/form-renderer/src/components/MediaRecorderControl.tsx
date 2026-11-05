import type { FileUploadValue } from '@myform/shared-types-enums'
import {
  IconDeviceDesktop,
  IconMicrophone,
  IconPlayerStop,
  IconRefresh,
  IconVideo
} from '@tabler/icons-react'
import clsx from 'clsx'
import type { FC, KeyboardEvent } from 'react'
import { useEffect, useRef, useState } from 'react'

import { useTranslation } from '../utils'
import { helper } from '@myform/utils'

import type { IComponentProps } from '../typings'
import { Loader } from './Loader'

/**
 * Shared recording engine behind the voice/video/screen recording blocks.
 *
 * Lifecycle: idle → requesting-permission → recording (live timer, manual stop,
 * auto-stop at `maxDurationSeconds`) → recorded (preview + retry) → uploading
 * (XHR progress) → done. Error states: permission-denied / not-supported /
 * device-unavailable / upload-failed (with retry-upload).
 *
 * Upload design (chosen deliberately, one clean path): THE CONTROL HANDLES THE
 * UPLOAD. When an `upload` context is given, a finished take is uploaded
 * immediately to the respondent upload endpoint (`POST /api/upload`, multipart
 * field `file`, `x-myform-form-id`/`x-myform-field-id`/`x-myform-open-token`
 * headers — the same contract the file-upload flow uses) with real XHR upload
 * progress, and the resulting `{filename, key, urlPrefix, url, size}` value is
 * emitted through `onChange`, so the block stores it exactly like a
 * file-upload answer. `onReady` still fires with the raw take
 * `(blob, mimetype, durationSeconds)` the moment it is finalized — hosts that
 * prefer to upload themselves simply omit the `upload` context and keep the
 * take in the "recorded" state (preview + re-take) instead.
 */

export type MediaRecordingMode = 'audio' | 'video' | 'screen'

export interface MediaRecordingUploadConfig {
  formId: string
  fieldId: string
  // Respondent uploads are authorized with the form's open token. Hosts that
  // already opened the form can also expose it on the runtime config
  // (window.myform.openToken); it is re-resolved on every upload attempt.
  openToken?: string
  // Upload endpoint, relative to the current origin. Defaults to /api/upload.
  endpoint?: string
}

// The upload response plus the optional media-asset id recording fields get.
export interface MediaRecordingAnswerValue extends FileUploadValue {
  mediaAssetId?: string
}

export interface MediaRecorderControlProps extends Omit<
  IComponentProps<HTMLDivElement>,
  'onChange'
> {
  mode: MediaRecordingMode
  maxDurationSeconds?: number
  disabled?: boolean
  // Upload context. Without it a finished take stays in the "recorded" state
  // and is only handed to the host through onReady.
  upload?: MediaRecordingUploadConfig
  value?: MediaRecordingAnswerValue
  onChange?: (value: MediaRecordingAnswerValue) => void
  // Fired the moment a take is finalized (before the upload starts).
  onReady?: (blob: Blob, mimetype: string, durationSeconds: number) => void
}

type RecordingPhase =
  | 'idle'
  | 'requesting-permission'
  | 'recording'
  | 'recorded'
  | 'uploading'
  | 'done'
  | 'error'

type RecordingErrorKind =
  | 'permission-denied'
  | 'not-supported'
  | 'device-unavailable'
  | 'upload-failed'

type SupportState = 'unknown' | 'supported' | 'unsupported'

interface RecordedTake {
  blob: Blob
  mimetype: string
  durationSeconds: number
  objectUrl: string
}

interface UploadResponse {
  filename?: string
  key?: string
  urlPrefix?: string
  url?: string
  size?: number
  mediaAssetId?: string
}

// MediaRecorder mimetype preference. The first candidate the browser reports
// as supported wins; the server-side upload filter admits all of them.
const MIME_TYPE_CANDIDATES: Record<MediaRecordingMode, string[]> = {
  audio: ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'],
  video: ['video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4'],
  screen: ['video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4']
}

// Upload filenames must carry an extension matching the container so the
// upload endpoint's mimetype/extension checks accept the recording.
const MODE_FILE_PREFIX: Record<MediaRecordingMode, string> = {
  audio: 'voice-recording',
  video: 'video-recording',
  screen: 'screen-recording'
}

const RECORDING_TIMESLICE_MS = 250
const RECORDING_TICK_MS = 200
const MIN_RECORDING_MS = 250

// Tailwind's sr-only utility is not part of the package stylesheet, so the
// clip pattern is inlined for the screen-reader status output.
const VISUALLY_HIDDEN_STYLE = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0
} as const

const MODE_ICONS = {
  audio: IconMicrophone,
  video: IconVideo,
  screen: IconDeviceDesktop
} as const

/**
 * Resolves the respondent open token for upload authorization.
 *
 * Hosts bridge the token they got from opening the form onto the runtime
 * config (`window.myform.openToken`); an `openToken` URL query parameter is
 * honored as a fallback. Returns undefined when no token is available —
 * anonymous uploads will then be rejected by the endpoint and surfaced
 * through the control's upload-failed state.
 */
export function getRecordingOpenToken(query?: Record<string, unknown>): string | undefined {
  if (typeof window === 'undefined') {
    return
  }

  // `window.myform` is globally typed with the device info only; the open
  // token hosts may bridge onto it is read defensively here.
  const runtime = (window as { myform?: { openToken?: unknown } }).myform
  const token = runtime?.openToken || query?.openToken

  return helper.isString(token) && helper.isValid(token) ? String(token) : undefined
}

export function formatRecordingDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secondsOfMinute = total % 60
  const minuteText = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes)
  const secondText = String(secondsOfMinute).padStart(2, '0')

  return hours > 0 ? `${hours}:${minuteText}:${secondText}` : `${minuteText}:${secondText}`
}

function getRecordingMimetype(mode: MediaRecordingMode): string | undefined {
  if (typeof window === 'undefined' || typeof window.MediaRecorder === 'undefined') {
    return
  }

  return MIME_TYPE_CANDIDATES[mode].find(mimetype => {
    try {
      return window.MediaRecorder.isTypeSupported(mimetype)
    } catch {
      return false
    }
  })
}

function getRecordingExtension(mimetype: string): string {
  const base = mimetype.split(';', 1)[0].trim().toLowerCase()

  if (base === 'audio/mp4') {
    return '.m4a'
  }

  if (base === 'video/mp4') {
    return '.mp4'
  }

  return '.webm'
}

function isRecordingModeSupported(mode: MediaRecordingMode): boolean {
  if (typeof window === 'undefined' || typeof window.MediaRecorder === 'undefined') {
    return false
  }

  const mediaDevices = navigator.mediaDevices

  if (!mediaDevices) {
    return false
  }

  if (mode === 'screen') {
    return typeof mediaDevices.getDisplayMedia === 'function'
  }

  return typeof mediaDevices.getUserMedia === 'function'
}

function toRecordingAnswerValue(
  response: UploadResponse,
  blob: Blob,
  filename: string
): MediaRecordingAnswerValue {
  const url = String(response.url || '')
  const slashIndex = url.lastIndexOf('/')

  // Legacy answers built the playback url from urlPrefix + key; keep both
  // derived from the returned url when the endpoint does not spell them out.
  const key =
    helper.isString(response.key) && helper.isValid(response.key)
      ? String(response.key)
      : slashIndex >= 0
        ? url.slice(slashIndex + 1)
        : ''

  const urlPrefix =
    helper.isString(response.urlPrefix) && helper.isValid(response.urlPrefix)
      ? String(response.urlPrefix)
      : slashIndex >= 0
        ? url.slice(0, slashIndex)
        : ''

  const value: MediaRecordingAnswerValue = {
    filename:
      helper.isString(response.filename) && helper.isValid(response.filename)
        ? String(response.filename)
        : filename,
    key,
    urlPrefix,
    url,
    size: typeof response.size === 'number' ? response.size : blob.size
  }

  if (helper.isString(response.mediaAssetId) && helper.isValid(response.mediaAssetId)) {
    value.mediaAssetId = String(response.mediaAssetId)
  }

  return value
}

/**
 * Uploads a recorded blob with real upload progress. XHR is used instead of
 * fetch because fetch has no upload progress events.
 */
function uploadRecordingBlob(options: {
  blob: Blob
  filename: string
  config: MediaRecordingUploadConfig
  onProgress: (percent: number) => void
}): { promise: Promise<UploadResponse>; abort: () => void } {
  const { blob, filename, config, onProgress } = options

  const formData = new FormData()
  formData.append('file', blob, filename)

  const xhr = new XMLHttpRequest()
  xhr.open('POST', config.endpoint || '/api/upload')
  xhr.responseType = 'json'

  const promise = new Promise<UploadResponse>((resolve, reject) => {
    xhr.upload.onprogress = event => {
      if (event.lengthComputable && event.total > 0) {
        // Hold at 99% until the server confirms; 100 means fully done.
        onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)))
      }
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const response = xhr.response

        if (response && typeof response === 'object' && helper.isString(response.url)) {
          resolve(response as UploadResponse)
        } else {
          reject(new Error('Invalid upload response'))
        }
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`))
      }
    }
    xhr.onerror = () => reject(new Error('Upload network error'))
    xhr.onabort = () => reject(new Error('Upload aborted'))
    xhr.ontimeout = () => reject(new Error('Upload timed out'))
  })

  // The browser sets the multipart Content-Type (with boundary) itself.
  xhr.setRequestHeader('x-myform-form-id', config.formId)
  xhr.setRequestHeader('x-myform-field-id', config.fieldId)

  if (typeof config.openToken === 'string' && config.openToken.length > 0) {
    xhr.setRequestHeader('x-myform-open-token', config.openToken)
  }

  xhr.send(formData)

  return {
    promise,
    abort: () => xhr.abort()
  }
}

export const MediaRecorderControl: FC<MediaRecorderControlProps> = ({
  mode,
  maxDurationSeconds,
  disabled,
  upload,
  value,
  onChange,
  onReady,
  className,
  ...restProps
}) => {
  const { t } = useTranslation()

  const [phase, setPhase] = useState<RecordingPhase>(value?.url ? 'done' : 'idle')
  const [errorKind, setErrorKind] = useState<RecordingErrorKind>()
  const [support, setSupport] = useState<SupportState>('unknown')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [progress, setProgress] = useState(0)
  const [take, setTake] = useState<RecordedTake>()
  const [isPreviewFailed, setIsPreviewFailed] = useState(false)

  const phaseRef = useRef<RecordingPhase>(phase)
  const takeRef = useRef<RecordedTake>()
  const recorderRef = useRef<MediaRecorder>()
  const streamRef = useRef<MediaStream>()
  const chunksRef = useRef<BlobPart[]>([])
  const startedAtRef = useRef(0)
  const tickIntervalRef = useRef<number>()
  const autoStopTimeoutRef = useRef<number>()
  const abortUploadRef = useRef<(() => void) | undefined>(undefined)
  const trackEndedListenerRef = useRef<() => void>()
  // The permission prompt can outlive the block (the respondent navigates
  // away mid-prompt), so late grants are released instead of recorded.
  const isMountedRef = useRef(true)

  const uploadRef = useRef(upload)
  const onChangeRef = useRef(onChange)
  const onReadyRef = useRef(onReady)
  const maxDurationRef = useRef(maxDurationSeconds)

  useEffect(() => {
    uploadRef.current = upload
    onChangeRef.current = onChange
    onReadyRef.current = onReady
    maxDurationRef.current = maxDurationSeconds
  })

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  const setPhaseState = (next: RecordingPhase) => {
    phaseRef.current = next
    setPhase(next)
  }

  const clearTimers = () => {
    if (tickIntervalRef.current) {
      window.clearInterval(tickIntervalRef.current)
      tickIntervalRef.current = undefined
    }

    if (autoStopTimeoutRef.current) {
      window.clearTimeout(autoStopTimeoutRef.current)
      autoStopTimeoutRef.current = undefined
    }
  }

  const releaseStream = () => {
    trackEndedListenerRef.current = undefined

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = undefined
    }
  }

  const discardTake = () => {
    if (takeRef.current) {
      URL.revokeObjectURL(takeRef.current.objectUrl)
    }

    takeRef.current = undefined
    setTake(undefined)
  }

  const showError = (kind: RecordingErrorKind) => {
    setErrorKind(kind)
    setPhaseState('error')
  }

  // Support is probed after mount so server rendering stays stable.
  useEffect(() => {
    setSupport(isRecordingModeSupported(mode) ? 'supported' : 'unsupported')
  }, [mode])

  // Keep the phase aligned with an externally changed answer (a restored
  // upload shows as done; a cleared answer returns to the start state).
  useEffect(() => {
    if (takeRef.current) {
      return
    }

    if (value?.url) {
      if (phaseRef.current === 'idle') {
        setPhaseState('done')
      }
    } else if (phaseRef.current === 'done') {
      setPhaseState('idle')
    }
  }, [value?.url])

  // Stop every track, timer and in-flight upload when the block goes away.
  useEffect(() => {
    return () => {
      isMountedRef.current = false
      clearTimers()

      const recorder = recorderRef.current
      recorderRef.current = undefined
      chunksRef.current = []

      if (recorder && recorder.state !== 'inactive') {
        // Do not finalize into an unmounted control; just halt the recorder.
        recorder.onstop = null
        recorder.ondataavailable = null
        recorder.onerror = null

        try {
          recorder.stop()
        } catch {}
      }

      releaseStream()
      abortUploadRef.current?.()
      abortUploadRef.current = undefined

      if (takeRef.current) {
        URL.revokeObjectURL(takeRef.current.objectUrl)
        takeRef.current = undefined
      }
    }
  }, [])

  const requestStream = (): Promise<MediaStream> => {
    const mediaDevices = navigator.mediaDevices

    if (mode === 'screen') {
      // The browser picker chooses the shared surface and optional tab/system
      // audio; the microphone is deliberately not mixed into screen takes.
      return mediaDevices.getDisplayMedia({ video: true, audio: true })
    }

    return mediaDevices.getUserMedia(
      mode === 'video' ? { video: true, audio: true } : { audio: true }
    )
  }

  const handlePermissionError = (error: unknown) => {
    const name = (error as DOMException | undefined)?.name

    if (name === 'AbortError') {
      // The respondent dismissed the screen-share picker; nothing went wrong.
      setPhaseState('idle')
      return
    }

    if (
      name === 'NotAllowedError' ||
      name === 'SecurityError' ||
      name === 'PermissionDeniedError'
    ) {
      showError('permission-denied')
      return
    }

    showError('device-unavailable')
  }

  const finalizeRecording = () => {
    const recorder = recorderRef.current
    const mimetype = recorder?.mimeType || getRecordingMimetype(mode) || 'application/octet-stream'

    recorderRef.current = undefined
    releaseStream()

    const chunks = chunksRef.current
    chunksRef.current = []

    const elapsedMsRecorded = Date.now() - startedAtRef.current
    const maxMs = maxDurationRef.current ? maxDurationRef.current * 1000 : undefined

    if (chunks.length < 1 || elapsedMsRecorded < MIN_RECORDING_MS) {
      // Nothing worth keeping was captured; start over quietly.
      setElapsedMs(0)
      setPhaseState('idle')
      return
    }

    const blob = new Blob(chunks, { type: mimetype })
    const durationSeconds =
      Math.round((Math.min(elapsedMsRecorded, maxMs ?? elapsedMsRecorded) / 1000) * 10) / 10
    const objectUrl = URL.createObjectURL(blob)
    const nextTake: RecordedTake = { blob, mimetype, durationSeconds, objectUrl }

    takeRef.current = nextTake
    setTake(nextTake)
    setIsPreviewFailed(false)
    setProgress(0)
    setPhaseState('recorded')

    onReadyRef.current?.(blob, mimetype, durationSeconds)

    if (uploadRef.current) {
      startUpload()
    }
  }

  const startUpload = () => {
    const currentTake = takeRef.current
    const config = uploadRef.current

    if (!currentTake || !config) {
      return
    }

    setPhaseState('uploading')
    setProgress(0)

    const filename = `${MODE_FILE_PREFIX[mode]}-${Date.now()}${getRecordingExtension(currentTake.mimetype)}`
    const openToken =
      typeof config.openToken === 'string' && config.openToken.length > 0
        ? config.openToken
        : getRecordingOpenToken()

    const { promise, abort } = uploadRecordingBlob({
      blob: currentTake.blob,
      filename,
      config: { ...config, openToken },
      onProgress: percent => setProgress(percent)
    })

    abortUploadRef.current = abort

    promise.then(
      response => {
        abortUploadRef.current = undefined

        // A newer take (or a reset) replaced this upload's take meanwhile.
        if (takeRef.current !== currentTake) {
          return
        }

        setProgress(100)
        setPhaseState('done')
        onChangeRef.current?.(toRecordingAnswerValue(response, currentTake.blob, filename))
      },
      () => {
        abortUploadRef.current = undefined

        if (takeRef.current !== currentTake) {
          return
        }

        showError('upload-failed')
      }
    )
  }

  const stopRecording = () => {
    clearTimers()

    const recorder = recorderRef.current

    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop()
      } catch {
        finalizeRecording()
      }
    } else if (recorder) {
      finalizeRecording()
    }
  }

  const handleStart = async () => {
    if (disabled || support === 'unsupported') {
      return
    }

    // Starting is offered everywhere except mid-capture and mid-upload; a
    // previous take (or its failed upload) is discarded in favor of a new one.
    if (
      phaseRef.current === 'requesting-permission' ||
      phaseRef.current === 'recording' ||
      phaseRef.current === 'uploading'
    ) {
      return
    }

    abortUploadRef.current?.()
    abortUploadRef.current = undefined
    discardTake()

    setErrorKind(undefined)
    setProgress(0)
    setElapsedMs(0)
    setIsPreviewFailed(false)
    setPhaseState('requesting-permission')

    let stream: MediaStream

    try {
      stream = await requestStream()
    } catch (error) {
      handlePermissionError(error)
      return
    }

    if (!isMountedRef.current) {
      stream.getTracks().forEach(track => track.stop())
      return
    }

    streamRef.current = stream

    const mimetype = getRecordingMimetype(mode)

    if (!mimetype) {
      releaseStream()
      showError('not-supported')
      return
    }

    let recorder: MediaRecorder

    try {
      recorder = new MediaRecorder(stream, { mimeType: mimetype })
    } catch {
      releaseStream()
      showError('not-supported')
      return
    }

    chunksRef.current = []
    recorder.ondataavailable = event => {
      if (event.data && event.data.size > 0) {
        chunksRef.current.push(event.data)
      }
    }
    recorder.onstop = finalizeRecording
    recorder.onerror = () => {
      // The recorder died mid-take; drop everything and let the respondent retry.
      clearTimers()
      recorderRef.current = undefined
      releaseStream()
      chunksRef.current = []
      showError('device-unavailable')
    }

    if (mode === 'screen') {
      // The browser's own "stop sharing" bar ends the video track without
      // touching MediaRecorder, so treat it as an explicit stop.
      const listener = () => {
        if (phaseRef.current === 'recording') {
          stopRecording()
        }
      }

      trackEndedListenerRef.current = listener
      stream.getVideoTracks()[0]?.addEventListener('ended', listener)
    }

    startedAtRef.current = Date.now()
    recorderRef.current = recorder
    setElapsedMs(0)

    try {
      recorder.start(RECORDING_TIMESLICE_MS)
    } catch {
      recorderRef.current = undefined
      releaseStream()
      showError('device-unavailable')
      return
    }

    setPhaseState('recording')

    tickIntervalRef.current = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAtRef.current)
    }, RECORDING_TICK_MS)

    const maxSeconds = maxDurationRef.current

    if (typeof maxSeconds === 'number' && maxSeconds > 0) {
      autoStopTimeoutRef.current = window.setTimeout(() => {
        autoStopTimeoutRef.current = undefined

        if (phaseRef.current === 'recording') {
          stopRecording()
        }
      }, maxSeconds * 1000)
    }
  }

  const handleRetryUpload = () => {
    if (phaseRef.current === 'error' && errorKind === 'upload-failed' && takeRef.current) {
      setErrorKind(undefined)
      startUpload()
    }
  }

  // The renderer submits the active question on Enter; keep keyboard use of
  // the recorder controls from also submitting the form underneath.
  const suppressEnterSubmit = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter') {
      event.stopPropagation()
    }
  }

  const ModeIcon = MODE_ICONS[mode]
  const maxDurationText =
    typeof maxDurationSeconds === 'number' && maxDurationSeconds > 0
      ? formatRecordingDuration(maxDurationSeconds)
      : undefined
  const isScreenMode = mode === 'screen'
  const previewUrl = take?.objectUrl || value?.url
  const previewIsVideo = mode !== 'audio'

  const renderPermissionHint = () => {
    if (isScreenMode) {
      return t('recording.permissionPrompt.screen')
    }

    return mode === 'video'
      ? t('recording.permissionPrompt.video')
      : t('recording.permissionPrompt.audio')
  }

  const renderPreview = () => {
    if (!previewUrl) {
      return
    }

    if (isPreviewFailed) {
      // The host could not render the media inline (e.g. a stored file served
      // as a download); fall back to a plain link.
      return (
        <a
          href={previewUrl}
          target="_blank"
          rel="noreferrer"
          style={{ color: 'var(--myform-answer-color)' }}
        >
          {t('recording.openRecording')}
        </a>
      )
    }

    return previewIsVideo ? (
      <video
        src={previewUrl}
        controls
        playsInline
        preload="metadata"
        aria-label={t('recording.preview')}
        onError={() => setIsPreviewFailed(true)}
        style={{ maxWidth: '100%', maxHeight: '16rem', borderRadius: '0.5rem' }}
      />
    ) : (
      <audio
        src={previewUrl}
        controls
        preload="metadata"
        aria-label={t('recording.preview')}
        onError={() => setIsPreviewFailed(true)}
        style={{ width: '100%', maxWidth: '26rem' }}
      />
    )
  }

  const renderBody = () => {
    // A browser without the needed capture APIs gets a calm note, not an error.
    if (support === 'unsupported') {
      return (
        <>
          <ModeIcon className="myform-upload-icon" />
          <div style={{ color: 'var(--myform-answer-color)' }}>
            {isScreenMode ? t('recording.screenNotSupported') : t('recording.notSupported')}
          </div>
        </>
      )
    }

    switch (phase) {
      case 'requesting-permission':
        return (
          <>
            <Loader className="myform-upload-icon" />
            <div style={{ color: 'var(--myform-answer-opacity-60-color)' }}>
              {t('recording.requestingPermission')}
            </div>
          </>
        )

      case 'recording':
        return (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span
                aria-hidden="true"
                style={{
                  width: '0.75rem',
                  height: '0.75rem',
                  borderRadius: '9999px',
                  backgroundColor: '#ef4444',
                  animation: 'myform-recorder-pulse 1.2s ease-in-out infinite'
                }}
              />
              <span
                style={{
                  color: 'var(--myform-answer-color)',
                  fontSize: '1.5rem',
                  fontWeight: 600,
                  fontVariantNumeric: 'tabular-nums'
                }}
              >
                {formatRecordingDuration(elapsedMs / 1000)}
              </span>
              {maxDurationText && (
                <span style={{ color: 'var(--myform-answer-opacity-60-color)' }}>
                  / {maxDurationText}
                </span>
              )}
            </div>
            <button
              type="button"
              className="myform-submit-button"
              onClick={stopRecording}
              onKeyDown={suppressEnterSubmit}
              aria-label={t('recording.stop')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <IconPlayerStop style={{ width: '1.1rem', height: '1.1rem', margin: 0 }} />
              {t('recording.stop')}
            </button>
          </>
        )

      case 'uploading':
        return (
          <>
            {renderPreview()}
            <div style={{ width: '100%', maxWidth: '26rem' }}>
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
                aria-label={t('recording.uploading', { percent: progress })}
                style={{
                  height: '0.5rem',
                  borderRadius: '9999px',
                  overflow: 'hidden',
                  backgroundColor: 'var(--myform-answer-opacity-30-color)'
                }}
              >
                <div
                  style={{
                    width: `${progress}%`,
                    height: '100%',
                    borderRadius: '9999px',
                    backgroundColor: 'var(--myform-answer-color)',
                    transition: 'width 200ms ease-out'
                  }}
                />
              </div>
              <div
                style={{
                  marginTop: '0.5rem',
                  textAlign: 'center',
                  fontSize: '0.875rem',
                  color: 'var(--myform-answer-opacity-60-color)'
                }}
              >
                {t('recording.uploading', { percent: progress })}
              </div>
            </div>
          </>
        )

      case 'done':
        return (
          <>
            {renderPreview()}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                color: 'var(--myform-answer-color)'
              }}
            >
              {take && (
                <span style={{ fontSize: '0.875rem' }}>
                  {t('recording.duration', {
                    duration: formatRecordingDuration(take.durationSeconds)
                  })}
                </span>
              )}
            </div>
            <button
              type="button"
              className="myform-skip-button"
              onClick={handleStart}
              onKeyDown={suppressEnterSubmit}
              aria-label={t('recording.recordAgain')}
            >
              {t('recording.recordAgain')}
            </button>
          </>
        )

      case 'error':
        if (errorKind === 'upload-failed') {
          return (
            <>
              {renderPreview()}
              <div className="myform-validation-wrapper" style={{ marginTop: 0 }}>
                <div className="myform-validation-error">{t('recording.uploadFailed')}</div>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="myform-submit-button"
                  onClick={handleRetryUpload}
                  onKeyDown={suppressEnterSubmit}
                  aria-label={t('recording.retryUpload')}
                >
                  {t('recording.retryUpload')}
                </button>
                <button
                  type="button"
                  className="myform-skip-button"
                  onClick={handleStart}
                  onKeyDown={suppressEnterSubmit}
                  aria-label={t('recording.recordAgain')}
                >
                  {t('recording.recordAgain')}
                </button>
              </div>
            </>
          )
        }

        if (errorKind === 'permission-denied') {
          return (
            <>
              <div className="myform-validation-wrapper" style={{ marginTop: 0 }}>
                <div className="myform-validation-error">{t('recording.denied')}</div>
              </div>
              <button
                type="button"
                className="myform-submit-button"
                onClick={handleStart}
                onKeyDown={suppressEnterSubmit}
                aria-label={t('recording.retry')}
              >
                {t('recording.retry')}
              </button>
            </>
          )
        }

        if (errorKind === 'device-unavailable') {
          return (
            <>
              <div className="myform-validation-wrapper" style={{ marginTop: 0 }}>
                <div className="myform-validation-error">{t('recording.deviceUnavailable')}</div>
              </div>
              <button
                type="button"
                className="myform-submit-button"
                onClick={handleStart}
                onKeyDown={suppressEnterSubmit}
                aria-label={t('recording.retry')}
              >
                {t('recording.retry')}
              </button>
            </>
          )
        }

        // not-supported (no usable recording mimetype) still offers a retry:
        // mimetype support can change after the respondent plugs in a device or
        // grants permission, so a dead-end would be premature.
        return (
          <>
            <div style={{ color: 'var(--myform-answer-color)' }}>{t('recording.notSupported')}</div>
            <button
              type="button"
              className="myform-submit-button"
              onClick={handleStart}
              onKeyDown={suppressEnterSubmit}
              aria-label={t('recording.retry')}
            >
              {t('recording.retry')}
            </button>
          </>
        )

      default:
        // idle (and "recorded" without upload config, which offers a re-take)
        return (
          <>
            {phase === 'recorded' && take ? (
              <>
                {renderPreview()}
                <div style={{ color: 'var(--myform-answer-color)', fontSize: '0.875rem' }}>
                  {t('recording.duration', {
                    duration: formatRecordingDuration(take.durationSeconds)
                  })}
                </div>
              </>
            ) : (
              <ModeIcon className="myform-upload-icon" />
            )}
            <button
              type="button"
              className="myform-submit-button"
              onClick={handleStart}
              onKeyDown={suppressEnterSubmit}
              disabled={disabled}
              aria-label={t('recording.start')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
            >
              {phase === 'recorded' ? (
                <IconRefresh style={{ width: '1.1rem', height: '1.1rem', margin: 0 }} />
              ) : null}
              {phase === 'recorded'
                ? t('recording.recordAgain')
                : isScreenMode
                  ? t('recording.start.screen')
                  : mode === 'video'
                    ? t('recording.start.video')
                    : t('recording.start.audio')}
            </button>
            {phase !== 'recorded' && (
              <div
                style={{
                  fontSize: '0.875rem',
                  textAlign: 'center',
                  color: 'var(--myform-answer-opacity-60-color)'
                }}
              >
                {renderPermissionHint()}
                {maxDurationText && (
                  <>
                    <br />
                    {t('recording.maxDuration', { duration: maxDurationText })}
                  </>
                )}
                {isScreenMode && (
                  <>
                    <br />
                    {t('recording.screenAudioNote')}
                  </>
                )}
              </div>
            )}
          </>
        )
    }
  }

  return (
    <div
      className={clsx('myform-media-recorder', className)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1rem',
        width: '100%',
        padding: '2rem 1rem',
        borderRadius: '0.375rem',
        border: `1px dashed var(--myform-answer-color)`,
        backgroundColor: 'var(--myform-answer-opacity-10-color)'
      }}
      {...restProps}
    >
      {renderBody()}
      {/* Screen-reader status for capture/upload transitions. */}
      <span style={VISUALLY_HIDDEN_STYLE} role="status" aria-live="polite">
        {phase === 'recording'
          ? t('recording.recording')
          : phase === 'uploading'
            ? t('recording.uploadingStatus')
            : phase === 'done'
              ? t('recording.done')
              : ''}
      </span>
      {/* Pulse keyframes for the live recording indicator. */}
      <style>{`@keyframes myform-recorder-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }`}</style>
    </div>
  )
}
