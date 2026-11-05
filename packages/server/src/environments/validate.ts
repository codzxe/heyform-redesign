import { helper } from '@myform/utils'

import {
  APP_HOMEPAGE_URL,
  APP_LISTEN_PORT,
  CORS_ALLOWED_ORIGINS,
  FORM_ENCRYPTION_KEY,
  MONGO_URI,
  NODE_ENV,
  REDIS_HOST,
  REDIS_PORT,
  SESSION_KEY,
  SMTP_HOST,
  SMTP_PORT,
  TRANSCRIPTION_API_KEY,
  TRANSCRIPTION_BASE_URL
} from './index'

export type EnvironmentSeverity = 'error' | 'warning'

export interface EnvironmentProblem {
  field: string
  severity: EnvironmentSeverity
  message: string
}

const VALID_NODE_ENVS = ['development', 'test', 'staging', 'production']

function isIntegerInRange(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max
}

function isValidPort(port: number): boolean {
  return isIntegerInRange(port, 1, 65535)
}

function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  return normalized === 'localhost' || normalized.endsWith('.localhost')
}

function isLoopbackIp(hostname: string): boolean {
  return hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]'
}

function isPrivateIp(hostname: string): boolean {
  return (
    hostname === '0.0.0.0' ||
    /^10\.\d+\.\d+\.\d+$/.test(hostname) ||
    /^192\.168\.\d+\.\d+$/.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(hostname)
  )
}

/**
 * Validates the runtime environment configuration.
 *
 * Returns every problem found so operators see the complete picture in one
 * startup pass instead of fixing variables one crash at a time. Callers decide
 * how to react: `error` severity must stop the process, `warning` severity is
 * logged and tolerated.
 *
 * This module intentionally performs no I/O and never mutates process.env so
 * it stays safe to run in tests and in both the API and worker processes.
 */
export function validateEnvironment(): EnvironmentProblem[] {
  const problems: EnvironmentProblem[] = []
  const isProduction = NODE_ENV === 'production'

  if (!VALID_NODE_ENVS.includes(NODE_ENV)) {
    problems.push({
      field: 'NODE_ENV',
      severity: 'warning',
      message: `Unrecognized NODE_ENV "${NODE_ENV}" (expected one of ${VALID_NODE_ENVS.join(', ')})`
    })
  }

  // Core storage and secrets — required in every environment.
  if (helper.isEmpty(MONGO_URI)) {
    problems.push({
      field: 'MONGO_URI',
      severity: 'error',
      message: 'MONGO_URI is required (MongoDB connection string)'
    })
  }

  if (helper.isEmpty(SESSION_KEY)) {
    problems.push({
      field: 'SESSION_KEY',
      severity: 'error',
      message: 'SESSION_KEY is required (session signing secret)'
    })
  } else if (SESSION_KEY.length < 16) {
    problems.push({
      field: 'SESSION_KEY',
      severity: 'warning',
      message: 'SESSION_KEY is shorter than 16 characters; use a long random value'
    })
  }

  if (helper.isEmpty(FORM_ENCRYPTION_KEY)) {
    problems.push({
      field: 'FORM_ENCRYPTION_KEY',
      severity: 'error',
      message: 'FORM_ENCRYPTION_KEY is required (encrypts form submission payloads)'
    })
  } else if (FORM_ENCRYPTION_KEY.length < 16) {
    problems.push({
      field: 'FORM_ENCRYPTION_KEY',
      severity: 'warning',
      message: 'FORM_ENCRYPTION_KEY is shorter than 16 characters; use a long random value'
    })
  }

  // Redis powers the Bull queues (transcription, reports, retention, mail).
  // There is intentionally no implicit loopback fallback: the address must be
  // provided so deployments never silently point at the wrong host.
  if (helper.isEmpty(REDIS_HOST)) {
    problems.push({
      field: 'REDIS_HOST',
      severity: 'error',
      message: 'REDIS_HOST is required (Bull queue backend for background workers)'
    })
  }

  if (!isValidPort(REDIS_PORT)) {
    problems.push({
      field: 'REDIS_PORT',
      severity: 'error',
      message: `REDIS_PORT must be an integer between 1 and 65535 (got "${REDIS_PORT}")`
    })
  }

  // Public application URL. Development falls back to a runtime-derived local
  // URL, production must be configured explicitly and reachable.
  if (isProduction) {
    if (helper.isEmpty(APP_HOMEPAGE_URL)) {
      problems.push({
        field: 'APP_HOMEPAGE_URL',
        severity: 'error',
        message: 'APP_HOMEPAGE_URL is required in production (public application URL)'
      })
    }
  }

  if (!helper.isEmpty(APP_HOMEPAGE_URL)) {
    try {
      const url = new URL(APP_HOMEPAGE_URL)

      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        problems.push({
          field: 'APP_HOMEPAGE_URL',
          severity: 'error',
          message: `APP_HOMEPAGE_URL must use http or https (got "${url.protocol}")`
        })
      }

      const hostname = url.hostname.toLowerCase()

      if (isProduction && (isLocalHostname(hostname) || isLoopbackIp(hostname))) {
        problems.push({
          field: 'APP_HOMEPAGE_URL',
          severity: 'error',
          message:
            'APP_HOMEPAGE_URL must be a publicly reachable URL in production, not a loopback address'
        })
      }

      if (isProduction && hostname === '0.0.0.0') {
        problems.push({
          field: 'APP_HOMEPAGE_URL',
          severity: 'error',
          message: 'APP_HOMEPAGE_URL cannot use the 0.0.0.0 wildcard address in production'
        })
      }

      if (isProduction && !url.pathname.startsWith('https:') && isPrivateIp(hostname)) {
        problems.push({
          field: 'APP_HOMEPAGE_URL',
          severity: 'warning',
          message: 'APP_HOMEPAGE_URL resolves to a private network address in production'
        })
      }
    } catch {
      problems.push({
        field: 'APP_HOMEPAGE_URL',
        severity: 'error',
        message: `APP_HOMEPAGE_URL is not a valid URL (got "${APP_HOMEPAGE_URL}")`
      })
    }
  } else if (!isProduction) {
    problems.push({
      field: 'APP_HOMEPAGE_URL',
      severity: 'warning',
      message: 'APP_HOMEPAGE_URL is not set; a runtime-derived local URL will be used'
    })
  }

  if (!isValidPort(APP_LISTEN_PORT)) {
    problems.push({
      field: 'APP_LISTEN_PORT',
      severity: 'error',
      message: `APP_LISTEN_PORT must be an integer between 1 and 65535 (got "${APP_LISTEN_PORT}")`
    })
  }

  // Email — production installs need a working SMTP server for verification
  // codes, team invitations, notifications and scheduled reports.
  if (isProduction && helper.isEmpty(SMTP_HOST)) {
    problems.push({
      field: 'SMTP_HOST',
      severity: 'error',
      message:
        'SMTP_HOST is required in production (email delivery for verification, invitations and reports)'
    })
  } else if (!isProduction && helper.isEmpty(SMTP_HOST)) {
    problems.push({
      field: 'SMTP_HOST',
      severity: 'warning',
      message: 'SMTP_HOST is not set; outgoing email will be unavailable'
    })
  }

  if (!helper.isEmpty(SMTP_HOST) && !isValidPort(SMTP_PORT)) {
    problems.push({
      field: 'SMTP_PORT',
      severity: 'error',
      message: `SMTP_PORT must be an integer between 1 and 65535 (got "${SMTP_PORT}")`
    })
  }

  // Transcription is an optional feature: it degrades gracefully, so a partial
  // configuration is a warning (voice answers stay uploadable, transcription
  // jobs report a clear failure) rather than a startup blocker.
  const transcriptionExplicitlyConfigured =
    !helper.isEmpty(process.env.TRANSCRIPTION_MODEL) ||
    !helper.isEmpty(process.env.TRANSCRIPTION_BASE_URL)
  const hasTranscriptionCredentials = !helper.isEmpty(TRANSCRIPTION_API_KEY)

  if (transcriptionExplicitlyConfigured && !hasTranscriptionCredentials) {
    problems.push({
      field: 'TRANSCRIPTION_API_KEY',
      severity: 'warning',
      message:
        'Transcription is configured without TRANSCRIPTION_API_KEY (or OPENAI_API_KEY); transcription jobs will fail until a key is provided'
    })
  }

  if (!helper.isEmpty(TRANSCRIPTION_BASE_URL)) {
    try {
      const url = new URL(TRANSCRIPTION_BASE_URL)

      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        problems.push({
          field: 'TRANSCRIPTION_BASE_URL',
          severity: 'error',
          message: `TRANSCRIPTION_BASE_URL must use http or https (got "${url.protocol}")`
        })
      }
    } catch {
      problems.push({
        field: 'TRANSCRIPTION_BASE_URL',
        severity: 'error',
        message: `TRANSCRIPTION_BASE_URL is not a valid URL (got "${TRANSCRIPTION_BASE_URL}")`
      })
    }
  }

  // CORS origins, when supplied, must be valid origins.
  for (const origin of CORS_ALLOWED_ORIGINS) {
    if (helper.isEmpty(origin)) {
      continue
    }

    try {
      const url = new URL(origin)

      if (url.pathname !== '/' || url.search || url.hash) {
        problems.push({
          field: 'CORS_ALLOWED_ORIGINS',
          severity: 'warning',
          message: `CORS_ALLOWED_ORIGINS entry "${origin}" should be an origin only (scheme://host:port), not a full URL`
        })
      }
    } catch {
      problems.push({
        field: 'CORS_ALLOWED_ORIGINS',
        severity: 'error',
        message: `CORS_ALLOWED_ORIGINS entry "${origin}" is not a valid origin`
      })
    }
  }

  return problems
}

/**
 * True when the environment has no `error`-severity problems. Used by the API
 * and worker entry points to fail fast with the full problem list.
 */
export function hasEnvironmentErrors(): boolean {
  return validateEnvironment().some(problem => problem.severity === 'error')
}
