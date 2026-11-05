import assert from 'assert'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import type { EnvironmentProblem } from '../src/environments/validate'

type ValidateModule = typeof import('../src/environments/validate')

/**
 * Every environment variable the validation reads, plus the ones the
 * environments module itself consumes at import time. Each scenario controls
 * every key, so nothing leaks between scenarios and no value from the shell
 * that started the suite can influence a result.
 */
const ENVIRONMENT_KEYS = [
  'NODE_ENV',
  'MONGO_URI',
  'MONGO_SSL_CA_PATH',
  'SESSION_KEY',
  'FORM_ENCRYPTION_KEY',
  'REDIS_HOST',
  'REDIS_PORT',
  'APP_LISTEN_HOSTNAME',
  'APP_HOMEPAGE_URL',
  'APP_LISTEN_PORT',
  'SMTP_HOST',
  'SMTP_PORT',
  'CORS_ALLOWED_ORIGINS',
  'TRANSCRIPTION_MODEL',
  'TRANSCRIPTION_BASE_URL',
  'TRANSCRIPTION_API_KEY',
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'APPLE_LOGIN_PRIVATE_KEY_PATH'
]

/**
 * The baseline every scenario overrides: a minimal, fully valid development
 * setup. A scenario removes a variable by overriding it with `undefined`.
 */
const VALID_MINIMAL_ENV: Record<string, string> = {
  NODE_ENV: 'development',
  MONGO_URI: 'mongodb://127.0.0.1:27017/myform',
  SESSION_KEY: 'unit-test-session-key',
  FORM_ENCRYPTION_KEY: 'unit-test-form-encryption-key',
  REDIS_HOST: '127.0.0.1'
}

let sandboxDir: string | undefined

/**
 * Runs the callback against a freshly imported validation module captured
 * under a controlled environment.
 *
 * The environments module freezes its constants at import time, so it is
 * re-imported for every scenario (the same require-cache technique as
 * image-url.test.ts). The import additionally happens with the working
 * directory moved into an empty sandbox folder, so the module's .env loading
 * cannot reintroduce a variable a scenario deliberately removed — without it,
 * a developer's packages/server/.env.local would decide whether the "missing
 * variable" scenarios see the variable or not.
 */
function withEnvironment(
  overrides: Record<string, string | undefined>,
  callback: (validate: ValidateModule) => void
): void {
  const env: Record<string, string | undefined> = { ...VALID_MINIMAL_ENV, ...overrides }
  const previousCwd = process.cwd()
  const previousValues = ENVIRONMENT_KEYS.map(key => ({ key, value: process.env[key] }))

  for (const key of ENVIRONMENT_KEYS) {
    if (env[key] === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = env[key]
    }
  }

  if (!sandboxDir) {
    sandboxDir = mkdtempSync(join(tmpdir(), 'myform-environment-validation-'))
  }

  process.chdir(sandboxDir)
  delete require.cache[require.resolve('../src/environments')]
  delete require.cache[require.resolve('../src/environments/validate')]

  try {
    callback(require('../src/environments/validate') as ValidateModule)
  } finally {
    process.chdir(previousCwd)

    for (const { key, value } of previousValues) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }

    delete require.cache[require.resolve('../src/environments')]
    delete require.cache[require.resolve('../src/environments/validate')]
  }
}

function errorsFor(problems: EnvironmentProblem[], field: string): EnvironmentProblem[] {
  return problems.filter(problem => problem.severity === 'error' && problem.field === field)
}

function warningsFor(problems: EnvironmentProblem[], field: string): EnvironmentProblem[] {
  return problems.filter(problem => problem.severity === 'warning' && problem.field === field)
}

function testMissingRequiredVariablesAreErrors() {
  for (const field of ['MONGO_URI', 'SESSION_KEY', 'FORM_ENCRYPTION_KEY', 'REDIS_HOST']) {
    withEnvironment({ [field]: undefined }, validate => {
      const problems = validate.validateEnvironment()
      const errors = errorsFor(problems, field)

      // Every other required variable is set, so the missing one is the only error
      assert.strictEqual(
        problems.filter(problem => problem.severity === 'error').length,
        1,
        `expected missing ${field} to be the only error, got ${JSON.stringify(problems)}`
      )
      assert.strictEqual(errors.length, 1, `expected an error problem for ${field}`)
      assert.match(errors[0].message, new RegExp(`^${field} is required`))
      assert.strictEqual(validate.hasEnvironmentErrors(), true)
    })
  }
}

function testValidMinimalEnvironmentHasNoErrors() {
  withEnvironment({}, validate => {
    const problems = validate.validateEnvironment()
    const errors = problems.filter(problem => problem.severity === 'error')

    assert.deepStrictEqual(errors, [])
    assert.strictEqual(validate.hasEnvironmentErrors(), false)
  })
}

function testValidProductionEnvironmentHasNoErrors() {
  withEnvironment(
    {
      NODE_ENV: 'production',
      APP_HOMEPAGE_URL: 'https://myform.example.com',
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '587'
    },
    validate => {
      const problems = validate.validateEnvironment()
      const errors = problems.filter(problem => problem.severity === 'error')

      assert.deepStrictEqual(errors, [])
      assert.strictEqual(validate.hasEnvironmentErrors(), false)
    }
  )
}

function testProductionLoopbackHomepageUrlIsRejected() {
  for (const appHomepageUrl of [
    'http://localhost:9157',
    'http://127.0.0.1:9157',
    'http://[::1]:9157'
  ]) {
    withEnvironment(
      {
        NODE_ENV: 'production',
        APP_HOMEPAGE_URL: appHomepageUrl,
        SMTP_HOST: 'smtp.example.com',
        SMTP_PORT: '587'
      },
      validate => {
        const problems = validate.validateEnvironment()
        const errors = errorsFor(problems, 'APP_HOMEPAGE_URL')

        assert.strictEqual(errors.length, 1, `expected an error problem for ${appHomepageUrl}`)
        assert.match(errors[0].message, /publicly reachable URL in production/)
      }
    )
  }
}

function testInvalidTranscriptionBaseUrlIsRejected() {
  for (const transcriptionBaseUrl of ['not a url', 'ftp://example.com/v1']) {
    withEnvironment({ TRANSCRIPTION_BASE_URL: transcriptionBaseUrl }, validate => {
      const problems = validate.validateEnvironment()
      const errors = errorsFor(problems, 'TRANSCRIPTION_BASE_URL')

      assert.strictEqual(errors.length, 1)
      assert.strictEqual(validate.hasEnvironmentErrors(), true)
    })
  }
}

function testValidTranscriptionConfigurationHasNoErrors() {
  withEnvironment(
    {
      TRANSCRIPTION_BASE_URL: 'https://api.example.com/v1',
      TRANSCRIPTION_API_KEY: 'transcription-test-key'
    },
    validate => {
      const problems = validate.validateEnvironment()
      const errors = problems.filter(problem => problem.severity === 'error')

      assert.deepStrictEqual(errors, [])
    }
  )
}

function testCorsAllowedOriginsProblems() {
  withEnvironment({ CORS_ALLOWED_ORIGINS: 'not an origin' }, validate => {
    const problems = validate.validateEnvironment()

    assert.strictEqual(errorsFor(problems, 'CORS_ALLOWED_ORIGINS').length, 1)
    assert.match(errorsFor(problems, 'CORS_ALLOWED_ORIGINS')[0].message, /is not a valid origin/)
  })

  // An origin with a path is still a warning, not a startup blocker
  withEnvironment({ CORS_ALLOWED_ORIGINS: 'https://example.com/some/path' }, validate => {
    const problems = validate.validateEnvironment()

    assert.strictEqual(errorsFor(problems, 'CORS_ALLOWED_ORIGINS').length, 0)
    assert.strictEqual(warningsFor(problems, 'CORS_ALLOWED_ORIGINS').length, 1)
    assert.strictEqual(validate.hasEnvironmentErrors(), false)
  })
}

function testShortSecretsWarnWithoutError() {
  for (const field of ['SESSION_KEY', 'FORM_ENCRYPTION_KEY']) {
    withEnvironment({ [field]: 'short' }, validate => {
      const problems = validate.validateEnvironment()

      assert.strictEqual(errorsFor(problems, field).length, 0, `expected no error for ${field}`)
      assert.strictEqual(warningsFor(problems, field).length, 1, `expected a warning for ${field}`)
      assert.match(warningsFor(problems, field)[0].message, /shorter than 16 characters/)
      assert.strictEqual(validate.hasEnvironmentErrors(), false)
    })
  }
}

function testOutOfRangePortsAreErrors() {
  withEnvironment({ REDIS_PORT: '99999' }, validate => {
    const problems = validate.validateEnvironment()

    assert.strictEqual(errorsFor(problems, 'REDIS_PORT').length, 1)
  })

  withEnvironment({ SMTP_HOST: 'smtp.example.com', SMTP_PORT: '99999' }, validate => {
    const problems = validate.validateEnvironment()

    assert.strictEqual(errorsFor(problems, 'SMTP_PORT').length, 1)
  })

  // APP_HOMEPAGE_URL is set explicitly because an out-of-range
  // APP_LISTEN_PORT otherwise makes the derived homepage URL unparseable and
  // crashes the environments module at import time, before validation runs.
  withEnvironment(
    { APP_LISTEN_PORT: '99999', APP_HOMEPAGE_URL: 'https://myform.example.com' },
    validate => {
      const problems = validate.validateEnvironment()

      assert.strictEqual(errorsFor(problems, 'APP_LISTEN_PORT').length, 1)
    }
  )
}

async function run() {
  try {
    testMissingRequiredVariablesAreErrors()
    testValidMinimalEnvironmentHasNoErrors()
    testValidProductionEnvironmentHasNoErrors()
    testProductionLoopbackHomepageUrlIsRejected()
    testInvalidTranscriptionBaseUrlIsRejected()
    testValidTranscriptionConfigurationHasNoErrors()
    testCorsAllowedOriginsProblems()
    testShortSecretsWarnWithoutError()
    testOutOfRangePortsAreErrors()
  } finally {
    if (sandboxDir) {
      rmSync(sandboxDir, { recursive: true, force: true })
      sandboxDir = undefined
    }
  }
}

if (require.main === module) {
  run().catch(error => {
    // eslint-disable-next-line no-console
    console.error(error)
    process.exitCode = 1
  })
}
