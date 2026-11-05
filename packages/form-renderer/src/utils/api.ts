import { helper, nanoid } from '@myform/utils'

// The anonymous id header every public endpoint (GraphQL + REST analytics)
// expects. The webapp keeps the same value in the MYFORM_ID cookie/localStorage,
// so read those first and only mint a fresh id when neither exists.
const ANONYMOUS_ID_KEY = 'MYFORM_ID'

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') {
    return undefined
  }

  const matched = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))

  return matched ? decodeURIComponent(matched[1]) : undefined
}

function writeCookie(name: string, value: string): void {
  try {
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=strict`
  } catch {}
}

function readLocalStorage(name: string): string | undefined {
  try {
    return window.localStorage.getItem(name) || undefined
  } catch {
    return undefined
  }
}

function writeLocalStorage(name: string, value: string): void {
  try {
    window.localStorage.setItem(name, value)
  } catch {}
}

export function getAnonymousId(): string {
  if (typeof window === 'undefined') {
    return ''
  }

  let id = readCookie(ANONYMOUS_ID_KEY) || readLocalStorage(ANONYMOUS_ID_KEY)

  if (helper.isEmpty(id)) {
    id = nanoid(8)
    writeCookie(ANONYMOUS_ID_KEY, id)
    writeLocalStorage(ANONYMOUS_ID_KEY, id)
  }

  return id!
}

/**
 * Base URL for public API calls. The respondent-facing page is served by the
 * same origin that exposes /graphql and /api/* (that is also how the webapp
 * render page talks to the server), so relative URLs are the default. A
 * deployment can override it through the runtime config injected by the
 * server-rendered page.
 */
export function getAPIBaseURL(): string {
  if (typeof window === 'undefined') {
    return ''
  }

  const baseURL = (window as any).myform?.apiBaseURL

  return helper.isURL(baseURL) ? baseURL.replace(/\/+$/, '') : ''
}

/**
 * The open token the host obtained when the form was opened. Hosts bridge it
 * onto the runtime config (`window.myform.openToken`); an `openToken` URL
 * query parameter is honored as a fallback. Public endpoints (analytics,
 * save/resume, leaderboard) need it to attribute calls to a legitimate open.
 */
export function getFormOpenToken(query?: Record<string, any>): string | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }

  const runtime = (window as { myform?: { openToken?: unknown } }).myform
  const token = runtime?.openToken || query?.openToken

  return helper.isString(token) && helper.isValid(token) ? String(token) : undefined
}

export interface GraphQLResponse<T = any> {
  data?: T
  errors?: Array<{ message: string }>
}

/**
 * Minimal GraphQL client for the respondent-facing calls the renderer owns
 * (save/resume sessions and the public leaderboard). It mirrors the webapp
 * render page's transport: a same-origin POST to /graphql carrying the
 * anonymous id header.
 */
export async function graphqlRequest<T = any>(
  query: string,
  variables?: Record<string, any>
): Promise<T> {
  const response = await fetch(`${getAPIBaseURL()}/graphql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Anonymous-ID': getAnonymousId()
    },
    body: JSON.stringify({ query, variables })
  })

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`)
  }

  const json: GraphQLResponse<T> = await response.json()

  if (helper.isValidArray(json.errors)) {
    throw new Error(json.errors![0].message)
  }

  return json.data as T
}
