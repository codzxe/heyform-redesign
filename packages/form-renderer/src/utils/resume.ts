import type { HiddenField } from '@myform/shared-types-enums'

import { helper } from '@myform/utils'

import type { AnyMap } from '../typings'
import { graphqlRequest } from './api'
import { isFile } from './form'

const RESUME_TOKEN_KEY_PREFIX = 'MYFORM_RESUME_'
const RESUME_URL_PARAM = 'resume'

export interface ResponseSessionSaveInput {
  formId: string
  openToken: string
  sessionToken?: string
  answers: Array<{ id: string; value: any }>
  hiddenFields: HiddenField[]
  variables: Array<{ id: string; value: any }>
  currentFieldId?: string
}

export interface ResponseSessionSaveResult {
  sessionToken: string
  expiresAt: number
}

export interface ResumedResponseSession {
  answers: Array<{ id: string; value: any }>
  hiddenFields: HiddenField[]
  variables: Array<{ id: string; value: any }>
  currentFieldId?: string
  expiresAt: number
}

export interface LeaderboardEntry {
  rank: number
  displayName: string
  score: number
  percentage: number
  completedAt: number
}

const SAVE_RESPONSE_SESSION_GQL = `mutation saveResponseSession($input: SaveResponseSessionInput!) {
  saveResponseSession(input: $input) {
    sessionToken
    expiresAt
  }
}`

const RESUME_RESPONSE_SESSION_GQL = `query resumeResponseSession($input: ResumeResponseSessionInput!) {
  resumeResponseSession(input: $input) {
    answers
    hiddenFields
    variables
    currentFieldId
    expiresAt
  }
}`

const PUBLIC_LEADERBOARD_GQL = `query publicLeaderboard($formId: String!, $openToken: String!, $limit: Int) {
  publicLeaderboard(formId: $formId, openToken: $openToken, limit: $limit) {
    rank
    displayName
    score
    percentage
    completedAt
  }
}`

export function getResumeTokenStorageKey(formId: string): string {
  return `${RESUME_TOKEN_KEY_PREFIX}${formId}`
}

/** The resume token remembered on this device, if any. */
export function getSavedResumeToken(formId: string): string | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }

  try {
    return window.localStorage.getItem(getResumeTokenStorageKey(formId)) || undefined
  } catch {
    return undefined
  }
}

export function saveResumeToken(formId: string, token: string): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(getResumeTokenStorageKey(formId), token)
  } catch {}
}

export function clearResumeToken(formId: string): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.removeItem(getResumeTokenStorageKey(formId))
  } catch {}
}

/** Drops the ?resume= URL parameter so a reload does not re-offer the banner. */
export function clearResumeQueryParam(): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    const url = new URL(window.location.href)
    const hadParam = url.searchParams.has(RESUME_URL_PARAM)

    if (!hadParam) {
      return
    }

    url.searchParams.delete(RESUME_URL_PARAM)

    const queryString = url.searchParams.toString()
    const search = queryString ? `?${queryString}` : ''

    window.history.replaceState(null, '', `${url.pathname}${search}${url.hash}`)
  } catch {}
}

// Files cannot survive a JSON round-trip to the server, so they stay behind.
export function serializeSessionAnswers(values: AnyMap): Array<{ id: string; value: any }> {
  return Object.keys(values || {})
    .filter(key => helper.isValid(values[key]) && !isFile(values[key]))
    .map(key => ({ id: key, value: values[key] }))
}

export function deserializeSessionAnswers(answers?: Array<{ id: string; value: any }>): AnyMap {
  const values: AnyMap = {}

  ;(answers || []).forEach(row => {
    if (helper.isValid(row?.id) && helper.isValid(row?.value)) {
      values[row.id] = row.value
    }
  })

  return values
}

export function serializeSessionVariables(variables?: AnyMap): Array<{ id: string; value: any }> {
  const source: AnyMap = variables || {}

  return Object.keys(source)
    .filter(key => helper.isValid(source[key]))
    .map(key => ({ id: key, value: source[key] }))
}

export function deserializeSessionVariables(variables?: Array<{ id: string; value: any }>): AnyMap {
  const result: AnyMap = {}

  ;(variables || []).forEach(row => {
    if (helper.isValid(row?.id) && helper.isValid(row?.value)) {
      result[row.id] = row.value
    }
  })

  return result
}

export function buildSessionHiddenFields(
  hiddenFields?: HiddenField[],
  query?: AnyMap
): HiddenField[] {
  return (hiddenFields || [])
    .map(field => {
      const value = query?.[field.name]

      if (helper.isValid(value)) {
        return { ...field, value: String(value) }
      }

      return undefined
    })
    .filter(Boolean) as HiddenField[]
}

export async function saveResponseSessionRequest(
  input: ResponseSessionSaveInput
): Promise<ResponseSessionSaveResult> {
  const data = await graphqlRequest<{
    saveResponseSession: ResponseSessionSaveResult
  }>(SAVE_RESPONSE_SESSION_GQL, { input })

  return data.saveResponseSession
}

export async function resumeResponseSessionRequest(input: {
  formId: string
  token: string
}): Promise<ResumedResponseSession | null> {
  const data = await graphqlRequest<{
    resumeResponseSession: ResumedResponseSession | null
  }>(RESUME_RESPONSE_SESSION_GQL, { input })

  return data.resumeResponseSession ?? null
}

export async function fetchPublicLeaderboardRequest(input: {
  formId: string
  openToken: string
  limit?: number
}): Promise<LeaderboardEntry[]> {
  const data = await graphqlRequest<{ publicLeaderboard: LeaderboardEntry[] }>(
    PUBLIC_LEADERBOARD_GQL,
    input
  )

  return data.publicLeaderboard || []
}
