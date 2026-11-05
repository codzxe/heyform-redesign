<br /><br />

<div align="center">
  <h1 align="center">
    <img alt="MyForm logo" height="60" src="./assets/images/logo.svg">
  </h1>
  <p><b>Self-hostable form platform — surveys, quizzes, voice & video answers, real-time analytics</b></p>
</div>

MyForm is a production-ready, self-hostable form platform: a conversational and classic form
builder with logic branching and gamified quizzes, voice/video/screen-recording answers with
automatic transcription, a real-time analytics dashboard, shareable public dashboards,
scheduled reports, GDPR tooling and configurable data retention. It ships as a pnpm monorepo
with a NestJS API, a standalone background worker and a React dashboard.

<img src="./assets/images/screenshot.png" alt="MyForm" />

## Features

**Building forms**

- Two response layouts per form: conversational (one question at a time) or classic
  multi-page with page breaks.
- Field types: short/long text, email, phone, number, website, date/date range, country,
  address, full name, rating, opinion scale, yes/no, multiple/picture choice, input table,
  file upload, signature, payment, statement, legal terms.
- Logic: conditional branching, variables, hidden fields and completion redirects.
- Save & resume: respondents continue later from any device through a hashed,
  non-guessable continuation token.
- AI-generated form fields, Unsplash image picker, form JSON import/export.

**Media answers**

- Voice, video and screen-recording answers recorded in the browser.
- Uploads go to S3-compatible object storage when configured, local disk otherwise.
- Audio is transcribed automatically through a configurable provider (dedicated
  transcription settings fall back to the OpenAI settings).

**Gamified quizzes**

- Per-question and per-choice scores, expected answers, pass score, per-form time limit with
  countdown, and an optional public leaderboard with rank and tie handling — computed server-side.

**Analytics**

- Dashboard with response trends, completion and abandonment rates, average completion time,
  per-question distributions, quiz statistics, device/browser breakdown, media-answer counts.
- Abandonment/hesitation heatmap computed from respondent events.
- Shareable public dashboards: hashed share tokens with revocation, expiry and selectable
  metric groups.
- Scheduled weekly/monthly email reports delivered by the background worker on your schedule.
- Submission export to CSV; streaming XLSX and PDF writers are implemented in the export service.

**Privacy by design**

- Consent records with timestamps, respondent data-deletion requests, a persistent audit log,
  and retention policies enforced by an automatic daily purge (uploaded media included).

**Workspaces and integrations**

- Multi-tenant workspaces: teams with roles, projects and project members.
- Submission-triggered integrations (webhook, Google Sheets over OAuth2, web analytics apps)
  executed by the integration queue.

**Theming**

- Theme designer with live preview: fonts, colors, background image and brightness, logo,
  corner radii, spacing, custom CSS, light/dark/auto appearance.

## Monorepo layout

```
packages/
  server/             NestJS API — GraphQL + REST, MongoDB (Mongoose), Redis/Bull workers
  webapp/             React 19 + Vite dashboard
  form-renderer/      Respondent-facing form runtime (workspace dependency of webapp)
  embed/              Embeddable script for third-party sites (standard/popup/modal/full-page)
  shared-types-enums/ Shared TypeScript types and enums
  answer-utils/       Answer validation/serialization and form-flow domain logic
  utils/              Shared utilities (dates, mime, ids, helpers, …)
```

The root `pnpm-workspace.yaml` includes every package except `packages/embed`, which is a
standalone package with its own rollup build (install and build it inside its directory).

## Quick start

Requirements: Node.js 20+, pnpm 8+, Docker (for MongoDB + Redis).

```bash
pnpm install
cp packages/server/.env.example packages/server/.env.local   # edit as needed
cp packages/webapp/.env.example packages/webapp/.env.local
pnpm --filter ./packages/form-renderer build   # webapp consumes the renderer's dist/
pnpm dev:database   # MongoDB (27017) + Redis (6379) via Docker Compose
pnpm dev            # build shared packages, then run webapp + server
```

- The API listens on `APP_LISTEN_PORT` (default **9157**).
- The webapp dev server runs on port **3000** and proxies `/graphql` and `/api` to
  `VITE_PROXY_TARGET` (default `http://127.0.0.1:9157`).

## Running the background worker

The server package produces two runtimes from the same build: the HTTP API and a standalone
background worker that boots the Bull queues and cron schedules without an HTTP listener
(`packages/server/src/worker.ts`).

```bash
pnpm build:server                          # the worker runs from dist/
pnpm --filter ./packages/server worker     # node scripts/start.js worker
```

The worker validates the environment exactly like the API (exit 1 on any error-severity
problem) and closes queues and connections gracefully on SIGTERM/SIGINT. In the Docker image
(workdir `packages/server`) run `node dist/worker.js`.

Jobs processed by the worker (`packages/server/src/queue/` and `src/schedule/`):

| Component | Purpose |
| --- | --- |
| `TranscriptionQueue` | transcribe voice answers |
| `FormReportQueue` | rebuild cached per-form aggregate reports (rate-limited by `FORM_REPORT_RATE`) |
| `MailQueue` | outgoing email |
| `ScheduledReportQueue` | scheduled report emails |
| `DeletionRequestQueue` | process respondent deletion requests |
| `TranslateFormQueue` | form translations |
| `IntegrationQueue` | run submission integrations |
| `SubmissionNotificationQueue` | notify form owners of new submissions |
| Trash / invite-code / account-deletion schedules | purge trashed forms, reset team invite codes, execute confirmed account deletions |
| `CleanResponseSessionsSchedule` | daily 03:00 purge of completed response sessions |
| `RetentionSchedule` | daily 04:00 retention purge (submissions, media, consent records, analytics events) |
| `ScheduledReportSchedule` | every 5 minutes, enqueue due scheduled reports |

## Configuration

All deployment-specific values come from the environment — no URLs, domains, ports or
secrets are hardcoded in source. Env files are loaded (in order, never overwriting values
already set) from the working directory and `packages/server`: `.env`, `.env.local`,
`.env.<NODE_ENV>`, `.env.<NODE_ENV>.local`.

`packages/server/.env.example` is the template; the tables below are the complete reference
(a few advanced variables are read directly from the environment and are not in the template).

At startup, both the API and the worker call `validateEnvironment()`
(`packages/server/src/environments/validate.ts`), which reports every problem in one pass:
missing `MONGO_URI`, `SESSION_KEY`, `FORM_ENCRYPTION_KEY` or `REDIS_HOST` (errors in all
environments), missing `APP_HOMEPAGE_URL` or `SMTP_HOST` (errors in production), URL, port
and CORS checks, plus warnings for short secrets, partial transcription config and missing
SMTP outside production. Any error stops the process.

### App and serving

| Variable | Required | Notes |
| --- | --- | --- |
| `NODE_ENV` | | `development` (valid: development, test, staging, production) |
| `APP_HOMEPAGE_URL` | production | Public app URL; single source of all generated links. Dev fallback: `http://<host>:<port>` |
| `APP_LISTEN_PORT`, `APP_LISTEN_HOSTNAME` | | listen address; defaults `9157` / `0.0.0.0` |
| `TRUST_PROXY` | | Express `trust proxy` value; default `false` |
| `CORS_ALLOWED_ORIGINS` | | comma-separated dashboard origins; defaults to `APP_HOMEPAGE_URL` |
| `ALLOW_PRIVATE_OUTBOUND` | | let webhooks/image proxy reach localhost or private networks; default `false` |
| `ENABLE_GOOGLE_FONTS` | | default `true` |
| `HELP_CENTER_URL`, `FEEDBACK_FORM_URL` | | optional public links; default app URL / empty |
| `APP_DISABLE_REGISTRATION` | | default `false` |

### Auth and secrets

| Variable | Required | Notes |
| --- | --- | --- |
| `SESSION_KEY` | always | session signing secret (long random value) |
| `SESSION_MAX_AGE` | | default `15d` |
| `FORM_ENCRYPTION_KEY` | always | encrypts form submission payloads |
| `INTEGRATION_ENCRYPTION_KEY` | | encrypts integration credentials; credential-based integrations are unavailable without it |
| `INTEGRATION_ENCRYPTION_KEY_PREVIOUS` | | previous key, read-only, for rotation |
| `DISABLE_LOGIN_WITH_PASSWORD` | | default `false` |
| `VERIFY_USER_EMAIL` | | require email confirmation codes for sign-up; default `true` |
| `COOKIE_MAX_AGE`, `COOKIE_DOMAIN` | | defaults `1y` / hostname of `APP_HOMEPAGE_URL` |
| `BCRYPT_SALT` | | default `10` |

### MongoDB

| Variable | Required | Notes |
| --- | --- | --- |
| `MONGO_URI` | always | connection string |
| `MONGO_USER`, `MONGO_PASSWORD` | | credentials when not embedded in the URI |
| `MONGO_SSL_CA_PATH` | | path to a CA certificate |

### Redis and Bull

| Variable | Required | Notes |
| --- | --- | --- |
| `REDIS_HOST` | always | Bull queue backend; no implicit loopback fallback |
| `REDIS_PORT` | | default `6379` |
| `REDIS_USERNAME`, `REDIS_PASSWORD` | | credentials |
| `REDIS_DB`, `REDIS_TLS` | | default `0` / JSON ioredis TLS options (e.g. `{}`) |
| `BULL_JOB_ATTEMPTS`, `BULL_JOB_TIMEOUT`, `BULL_JOB_BACKOFF_DELAY`, `BULL_JOB_BACKOFF_TYPE` | | defaults `3` / `1m` / `3000` / `fixed` |

### SMTP

| Variable | Required | Notes |
| --- | --- | --- |
| `SMTP_FROM` | | From header for outgoing mail |
| `SMTP_HOST` | production | relay host (warning when missing outside production) |
| `SMTP_PORT` | with `SMTP_HOST` | integer 1–65535 |
| `SMTP_USER`, `SMTP_PASSWORD` | | credentials |
| `SMTP_SERVERNAME`, `SMTP_SECURE`, `SMTP_IGNORE_CERT` | | TLS options |

### Uploads and object storage

| Variable | Required | Notes |
| --- | --- | --- |
| `UPLOAD_FILE_TYPES`, `UPLOAD_FILE_SIZE` | | allowed extensions / max size; defaults: common set from `@myform/utils` / `10mb` |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | all five | enable S3-compatible storage for uploads and recordings; otherwise local disk (`packages/server/static/upload`) |
| `S3_PUBLIC_URL` | | public URL prefix for S3 objects |

### AI and transcription

| Variable | Required | Notes |
| --- | --- | --- |
| `OPENAI_API_KEY`, `OPENAI_BASE_URL` | | provider for AI form fields and translations |
| `OPENAI_GPT_MODEL` | | default `gpt-3.5-turbo-0125` |
| `TRANSCRIPTION_API_KEY` | | falls back to `OPENAI_API_KEY` |
| `TRANSCRIPTION_BASE_URL` | | falls back to `OPENAI_BASE_URL`; must be http(s) |
| `TRANSCRIPTION_MODEL` | | default `whisper-1` |
| `TRANSCRIPTION_LANGUAGE` | | optional language hint |

### Social login

| Variable | Required | Notes |
| --- | --- | --- |
| `GOOGLE_LOGIN_CLIENT_ID`, `GOOGLE_LOGIN_CLIENT_SECRET` | | Google login (hidden when unset) |
| `APPLE_LOGIN_TEAM_ID`, `APPLE_LOGIN_WEB_CLIENT_ID`, `APPLE_LOGIN_KEY_ID`, `APPLE_LOGIN_PRIVATE_KEY_PATH` | | Apple login |
| `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_ISSUER` | | generic OIDC; callback `${APP_HOMEPAGE_URL}/connect/oidc/callback` |
| `OIDC_DISPLAY_NAME`, `OIDC_DISPLAY_ICON_URL` | | defaults `SSO` / empty |
| `OIDC_CLIENT_AUTH_METHOD` | | `client_secret_basic` or `client_secret_post`; default basic |
| `OIDC_ALLOW_PROVISIONING` | | create accounts from new OIDC identities when registration is disabled |

### Integrations, anti-abuse and misc

| Variable | Required | Notes |
| --- | --- | --- |
| `GOOGLE_INTEGRATION_CLIENT_ID`, `GOOGLE_INTEGRATION_CLIENT_SECRET` | | per-installation OAuth client for Google Sheets; redirect `${APP_HOMEPAGE_URL}/api/integrations/oauth/callback` |
| `AKISMET_KEY`, `GOOGLE_RECAPTCHA_KEY`, `GOOGLE_RECAPTCHA_SECRET` | | submission spam filter / bot protection |
| `DISABLE_SUBMISSION_IP` | | do not store respondent IPs (per-IP limits keep a keyed hash); default `false` |
| `STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_CONNECT_CLIENT_ID`, `STRIPE_WEBHOOK_SECRET_KEY`, `STRIPE_VERSION` | | payments and connected accounts; `STRIPE_VERSION` optionally pins the API version |
| `UNSPLASH_CLIENT_ID` | | image picker |
| `INVITE_CODE_EXPIRE_DAYS`, `ACCOUNT_DELETION_SCHEDULE_INTERVAL` | | invite-link / account-deletion intervals; defaults `7` / `2d` |
| `FORM_REPORT_RATE` | | report rebuild rate limit; default `5s` |
| `VERIFICATION_CODE_EXPIRE`, `VERIFICATION_CODE_LIMIT`, `VERIFY_EMAIL_RESEND_COOLDOWN`, `VERIFY_EMAIL_RESEND_DAILY_LIMIT` | | verification-code expiry / resend limits; defaults `10m` / `5` / `60s` / `20` |

## Testing

| What | Command |
| --- | --- |
| Server unit tests (63 files, ts-node runner) | `pnpm --filter ./packages/server test:unit` |
| Webapp unit tests (vitest) | `pnpm --filter ./packages/webapp test:unit` |
| Form renderer unit tests (vitest) | `pnpm --filter ./packages/form-renderer test:unit` |
| Shared library suites | `pnpm --filter ./packages/utils cov` · `pnpm --filter ./packages/answer-utils cov` |
| Server e2e against a running server | `pnpm --filter ./packages/server test:e2e` |
| Server e2e via Docker | `pnpm --filter ./packages/server test:e2e:docker` |

The e2e suite (11 suites) drives a running server over HTTP/GraphQL — see
`packages/server/docs/e2e-tests.md`. `test:e2e` waits for `/health/ready` on `E2E_BASE_URL`
(default `http://localhost:9157`); `test:e2e:docker` builds the stack from
`docker-compose.test.yml` (app + Mongo on 27018 + KeyDB on 9514; requires `SESSION_KEY` and
`FORM_ENCRYPTION_KEY` in the root `.env`) and tears it down afterwards.

Type checking: `pnpm --filter ./packages/server type-check` (likewise for `webapp`,
`form-renderer` and `answer-utils`). Repo-wide lint: `pnpm lint` (oxlint); formatting:
`pnpm format`.

## Validation

Two zero-dependency Node scripts guard repository hygiene. Both are plain
Node (no install step) and exit non-zero on violations, so they should gate
CI and pre-commit/pre-push hooks — a red run means the change must be fixed
(or, for hardcoded values, the audited allowlist in the script header must be
consciously widened in review).

```bash
node scripts/validate-branding.js               # old brand name must not survive
node scripts/validate-hardcoded-values.js       # no machine-specific values in source
```

### Branding check — `scripts/validate-branding.js`

Fails when the old brand name (`heyform`, any case — this also catches
`@heyform-inc/*` package names) appears in any scanned file. Files are
enumerated with `git ls-files` (filesystem walk fallback). Skipped:
`node_modules`, `.git`, `dist`, `build`, `coverage`, `.turbo`, `.next`;
binary/asset extensions (png jpg jpeg gif ico woff woff2 ttf eot mp3 mp4
webm wav ogg zip pdf); `.env` local secret files. SVG files and tracked
`.env.example` templates **are** scanned.

Flags: `--exclude-lockfile` (transitional — the default strict run **does**
scan `pnpm-lock.yaml`; drop the flag once lockfiles are regenerated and
clean), `--strict` (explicit no-op for self-documenting CI calls), `--help`.

### Hardcoded-value check — `scripts/validate-hardcoded-values.js`

Fails when deployment- or machine-specific values are hardcoded instead of
coming from configuration. Scope: `packages/*/src/**` (including translation
files), `packages/*/test/**` (tests and fixtures) and
`packages/server/scripts/**`. Never scanned: `.env*` files, binary assets.
Detected patterns, reported as `path:line [rule]`:

- **A** — loopback URL literals `http(s)://localhost|127.0.0.1|0.0.0.0[:port]`
- **B** — bare `localhost` / `127.0.0.1` inside string literals
- **C** — machine-specific paths inside string literals (`/home/<user>` and
  `/Users/<user>` always; `/workspace/…` and `/project/…/` only when the
  literal is file-shaped, since bare forms are legitimate app routes)

The SSRF guard and its tests legitimately reference loopback literals to
block them; they sit on an audited allowlist at the top of the script, each
entry with a reason. Allowlisted hits are counted in a one-line summary by
default; `--verbose` prints every suppressed line with its reason. Keep the
allowlist as narrow as possible — widening it is a review decision.

## Build and deployment

```bash
pnpm build:shared                              # utils + shared-types-enums + answer-utils
pnpm build:server                              # shared packages, then NestJS server (dist/)
pnpm build:webapp                              # shared packages, then Vite dashboard (dist/)
pnpm --filter ./packages/form-renderer build   # renderer dist consumed by the webapp
cd packages/embed && pnpm install && pnpm build # embeddable script (rollup → dist/)
```

Production notes:

- **`APP_HOMEPAGE_URL` is the single source for generated links** — share links, email
  links, OAuth callbacks and local-upload URLs are all derived from it; no domain is
  hardcoded anywhere.
- The API serves the built dashboard: copy `packages/webapp/dist/static` into
  `packages/server/static` and `dist/index.html` into `packages/server/view/` (this is what
  the root `Dockerfile` does), then run `pnpm --filter ./packages/server start`
  (`node scripts/start.js` → `dist/main.js`; its `prestart` seed step is a no-op check).
- Run the worker as a separate process from the same build for dedicated background capacity.
- The root `Dockerfile` is a multi-stage build (Node 22 alpine, pnpm 9.15.9) that compiles
  every package and produces a runtime image with only production dependencies and build
  output; it starts the API on port 9157.
- `docker-compose.development.yml` provides local MongoDB and Redis for development;
  `docker-compose.test.yml` builds the full stack for e2e runs.
- Uploads land on local disk under `packages/server/static/upload` unless the S3 variables
  are set.

## License

MyForm is licensed under the [GNU AGPL-3.0](./LICENSE).
