import { FormField } from '@myform/shared-types-enums'
import {
  BadRequestException,
  Controller,
  Post,
  Req,
  UploadedFile,
  UseInterceptors
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import type { Request } from 'express'

import { MediaUploadService } from '../service/media-upload.service'
import {
  COOKIE_DEVICE_ID_NAME,
  getMulterStorage,
  isUploadFileContentValid,
  saveUploadedFile,
  uploadFileFilter
} from '@config'
import { APP_HOMEPAGE_URL, UPLOAD_FILE_SIZE } from '@environments'
import { FormModel } from '@model'
import { flattenFields } from '@myform/answer-utils'
import { helper, timestamp } from '@myform/utils'
import {
  AuthService,
  EndpointService,
  FormService,
  MediaAssetService,
  RedisService,
  TeamService
} from '@service'
import { isAllowedUploadField, md5 } from '@utils'

interface UploadResponse {
  filename: string
  url: string
  size: number
  // Present only for recording answers, so existing consumers can ignore it.
  mediaAssetId?: string
}

interface UploadContext {
  form?: FormModel
  field?: FormField
}

function getUploadContextValue(
  req: Request,
  key: 'fieldId' | 'formId' | 'openToken'
): string | undefined {
  const headerName = `x-myform-${key.replace(/[A-Z]/g, matched => `-${matched.toLowerCase()}`)}`
  const value = req.get?.(headerName) || req.query?.[key]
  const firstValue = Array.isArray(value) ? value[0] : value

  return typeof firstValue === 'string' ? firstValue : undefined
}

@Controller()
export class UploadController {
  constructor(
    private readonly authService: AuthService,
    private readonly endpointService: EndpointService,
    private readonly formService: FormService,
    private readonly redisService: RedisService,
    private readonly mediaAssetService: MediaAssetService,
    private readonly mediaUploadService: MediaUploadService,
    private readonly teamService: TeamService
  ) {}

  @Post('/api/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: UPLOAD_FILE_SIZE
      },
      fileFilter: uploadFileFilter,
      storage: getMulterStorage()
    })
  )
  async index(
    @Req() req: Request,
    @UploadedFile() file: Express.Multer.File
  ): Promise<UploadResponse> {
    if (!file) {
      throw new BadRequestException('No supported upload file provided')
    }

    const context = await this.assertUploadAllowed(req)

    if (!isUploadFileContentValid(file)) {
      throw new BadRequestException('The uploaded file contents do not match its file type')
    }

    const savedFile = await saveUploadedFile(file)

    let url: string =
      APP_HOMEPAGE_URL.replace(/\/+$/, '') +
      `/static/upload/${encodeURIComponent(savedFile.filename)}`

    if (savedFile.location) {
      url = savedFile.location
    }

    let mediaAssetId: string | undefined

    // Recording answers are tracked as media assets so form owners can browse them
    // and voice answers can be transcribed. The extra mediaAssetId field is purely
    // additive; uploads without a recording context keep the legacy response shape.
    if (
      context.form &&
      context.field &&
      this.mediaAssetService.isRecordingKind(context.field.kind)
    ) {
      const result = await this.mediaUploadService.handleRecordingUpload({
        form: context.form,
        field: context.field,
        savedFile,
        url,
        mimetype: file.mimetype
      })

      mediaAssetId = result.mediaAssetId
    }

    return {
      filename: savedFile.originalname,
      size: savedFile.size,
      url,
      ...(mediaAssetId ? { mediaAssetId } : {})
    }
  }

  private async assertUploadAllowed(req: Request): Promise<UploadContext> {
    const sessionId = await this.getAuthenticatedSessionId(req)

    if (sessionId) {
      await this.redisService.throttler(`upload:session:${md5(sessionId)}`, 300, '1h')

      // Session uploads have no respondent context. When form context headers are
      // present (e.g. a team member testing their own form), recording uploads are
      // tracked as media assets — but only for members of the form's team, so a
      // logged-in user cannot pollute another team's recordings.
      const formId = getUploadContextValue(req, 'formId')
      const fieldId = getUploadContextValue(req, 'fieldId')

      if (!helper.isValid(formId) || !helper.isValid(fieldId)) {
        return {}
      }

      const form = await this.formService.findById(formId)

      if (!form || form.suspended || form.settings?.active !== true) {
        return {}
      }

      const field = this.findFormField(form, fieldId)

      if (!field || !this.mediaAssetService.isRecordingKind(field.kind)) {
        return {}
      }

      const member = await this.teamService.findMemberById(form.teamId, sessionId)

      return member ? { form, field } : {}
    }

    const fieldId = getUploadContextValue(req, 'fieldId')
    const formId = getUploadContextValue(req, 'formId')
    const openToken = getUploadContextValue(req, 'openToken')

    if (!helper.isValid(formId) || !helper.isValid(openToken) || !helper.isValid(fieldId)) {
      throw new BadRequestException('Invalid upload context')
    }

    const form = await this.formService.findById(formId)

    if (!form || form.suspended || form.settings?.active !== true) {
      throw new BadRequestException('The form is not available')
    }

    const token = this.endpointService.decryptToken(openToken)
    this.endpointService.assertOpenToken(token, formId, form.settings, timestamp())

    const field = this.findFormField(form, fieldId)
    const isRecordingField = field ? this.mediaAssetService.isRecordingKind(field.kind) : false

    // Regular upload/signature fields keep their admission check; recording fields
    // are admitted so respondent voice/video/screen answers can be tracked.
    if (!isAllowedUploadField(form, fieldId) && !isRecordingField) {
      throw new BadRequestException('The upload field is not allowed')
    }

    // A public form token is intentionally obtainable by respondents, so cap both reuse of a
    // single token and aggregate orphan uploads for a form. Redis keeps the limit consistent
    // across application replicas.
    await Promise.all([
      this.redisService.throttler(`upload:form:${formId}`, 300, '1h'),
      this.redisService.throttler(`upload:token:${md5(openToken)}`, 10, '1h')
    ])

    return { form, field }
  }

  private findFormField(form: Pick<FormModel, 'fields'>, fieldId?: string): FormField | undefined {
    if (!fieldId) {
      return
    }

    return flattenFields((form.fields || []) as FormField[], true).find(
      field => field.id === fieldId
    )
  }

  private async getAuthenticatedSessionId(req: Request): Promise<string | undefined> {
    const session = this.authService.getSession(req)
    const deviceId = req.get('x-device-id') || req.cookies?.[COOKIE_DEVICE_ID_NAME]

    if (
      helper.isEmpty(session?.id) ||
      helper.isEmpty(session?.deviceId) ||
      deviceId !== session.deviceId
    ) {
      return
    }

    if (await this.authService.isExpired(session.id, session.deviceId)) {
      return
    }

    return session.id
  }
}
