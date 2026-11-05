import { Answer, HiddenFieldAnswer, Variable } from '@myform/shared-types-enums'
import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { createHash, randomBytes } from 'crypto'
import { Model } from 'mongoose'

import { ResponseSessionModel } from '@model'
import { helper, timestamp } from '@myform/utils'

export const DEFAULT_RESUME_EXPIRATION_DAYS = 30
export const MAX_RESUME_EXPIRATION_DAYS = 365

export function generateResumeToken(): string {
  return randomBytes(24).toString('base64url')
}

export function hashResumeToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export interface SaveSessionPayload {
  formId: string
  anonymousId?: string
  sessionToken?: string
  answers: Answer[]
  hiddenFields: HiddenFieldAnswer[]
  variables: Variable[]
  currentFieldId?: string
  startAt?: number
  expirationDays?: number
}

/**
 * Server-persisted respondent sessions for save & resume. The resume token is
 * a random secret handed to the respondent; only its SHA-256 hash is stored.
 */
@Injectable()
export class ResponseSessionService {
  constructor(
    @InjectModel(ResponseSessionModel.name) private readonly model: Model<ResponseSessionModel>
  ) {}

  private expirationDate(expirationDays?: number): number {
    const days = Math.min(
      MAX_RESUME_EXPIRATION_DAYS,
      Math.max(1, expirationDays ?? DEFAULT_RESUME_EXPIRATION_DAYS)
    )
    return timestamp() + days * 24 * 60 * 60
  }

  async save(payload: SaveSessionPayload): Promise<{ token: string; expiresAt: number }> {
    const expiresAt = this.expirationDate(payload.expirationDays)

    if (helper.isValid(payload.sessionToken)) {
      const tokenHash = hashResumeToken(payload.sessionToken)
      const existing = await this.model.findOne({ formId: payload.formId, tokenHash })

      if (existing && !existing.completedAt) {
        await this.model.updateOne(
          { _id: existing._id },
          {
            answers: payload.answers,
            hiddenFields: payload.hiddenFields,
            variables: payload.variables,
            currentFieldId: payload.currentFieldId,
            anonymousId: payload.anonymousId ?? existing.anonymousId,
            startAt: payload.startAt ?? existing.startAt,
            expiresAt
          }
        )
        return { token: payload.sessionToken!, expiresAt }
      }
    }

    const token = generateResumeToken()
    await this.model.create({
      formId: payload.formId,
      tokenHash: hashResumeToken(token),
      anonymousId: payload.anonymousId,
      answers: payload.answers,
      hiddenFields: payload.hiddenFields,
      variables: payload.variables,
      currentFieldId: payload.currentFieldId,
      startAt: payload.startAt,
      expiresAt
    })

    return { token, expiresAt }
  }

  async resume(formId: string, token: string): Promise<ResponseSessionModel | null> {
    if (!helper.isValid(token)) {
      return null
    }

    const session = await this.model.findOne({ formId, tokenHash: hashResumeToken(token) }).lean()

    if (!session || session.completedAt) {
      return null
    }

    if (session.expiresAt < timestamp()) {
      return null
    }

    return session
  }

  /** Marks a session finished when its form submission completes. */
  async complete(formId: string, token: string | undefined): Promise<void> {
    if (!helper.isValid(token)) {
      return
    }

    await this.model.updateOne(
      { formId, tokenHash: hashResumeToken(token) },
      { completedAt: timestamp() }
    )
  }

  /** Deletes a finished session so its answers do not linger. */
  async purgeCompleted(): Promise<number> {
    const cutoff = timestamp() - 24 * 60 * 60
    const result = await this.model.deleteMany({
      completedAt: { $lt: cutoff, $exists: true }
    })
    return result.deletedCount ?? 0
  }
}
