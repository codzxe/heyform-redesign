import { spawnSync } from 'child_process'
import path from 'path'

const tests = [
  'abuse-limits.test.ts',
  'auth-security.test.ts',
  'authorization-security.test.ts',
  'complete-submission-security.test.ts',
  'cors.test.ts',
  'deletion-cascade-security.test.ts',
  'endpoint-security.test.ts',
  'exception-security.test.ts',
  'form-password-security.test.ts',
  'handlebars.test.ts',
  'image-url.test.ts',
  'mail.service.test.ts',
  'mongo-redaction.test.ts',
  'outbound-url.test.ts',
  'permission.guard.test.ts',
  'redis-service.test.ts',
  'stripe-authorization-security.test.ts',
  'submission-quota.test.ts',
  'submission.test.ts',
  'update-form-theme.resolver.test.ts',
  'update-submission-answer-security.test.ts',
  'upload.test.ts',
  'form-branding.test.ts',
  'templates.test.ts',
  'changelog.test.ts',
  'password-login.test.ts',
  'ai-json.test.ts',
  'ai-fields.test.ts',
  'ai-rich-text.test.ts',
  'ai-form-flow.test.ts',
  'form-schema.test.ts',
  'import-export-form-json.test.ts',
  'update-form.resolver.test.ts',
  'ai-resolver.test.ts',
  'redis-config.test.ts',
  'environment-validation.test.ts',
  'oauth-state.test.ts',
  'oidc-security.test.ts',
  'oidc-provisioning.test.ts',
  'notification-recipients.test.ts',
  'notification-options.test.ts',
  'export-file.service.test.ts',
  'form-report.service.test.ts',
  'webhook.test.ts',
  'submission-ip.test.ts',
  'submission-ip-disabled.test.ts',
  'submission-ip-limit.test.ts',
  'submission-discard.test.ts',
  'submission-time-limit.test.ts',
  'form-flow-outcomes.test.ts',
  'app-config.test.ts',
  'integration-auth.test.ts',
  'integration-records.test.ts',
  'integration-secrets.test.ts',
  'googlesheets.test.ts',
  'page-apps.test.ts',
  'form-analytic-cache.test.ts',
  'dashboard-share.service.test.ts',
  'submission-choice-limit.test.ts',
  'response-session.test.ts',
  'leaderboard.test.ts',
  'media-transcription.test.ts',
  'graphql-schema.test.ts'
]
const serverRoot = path.resolve(__dirname, '..')

for (const test of tests) {
  const result = spawnSync(
    process.execPath,
    [
      '-r',
      require.resolve('ts-node/register/transpile-only'),
      '-r',
      require.resolve('tsconfig-paths/register'),
      path.join(__dirname, test)
    ],
    {
      cwd: serverRoot,
      env: process.env,
      stdio: 'inherit'
    }
  )

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    process.exitCode = result.status ?? 1
    break
  }
}
