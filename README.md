<br /><br />

<div align="center">
  <h1 align="center">
    <img alt="MyForm logo" height="60" src="./assets/images/logo.svg">
  </h1>
  <p><b>Open-source form builder — surveys, quizzes, voice & video answers, real-time analytics</b></p>
</div>

<p align="center">
MyForm is a production-ready, self-hostable form platform: a conversational form builder with
logic branching, quizzes and gamification, voice/video/screen-recording answers with automatic
transcription, shareable analytics dashboards, scheduled reports, GDPR tooling and configurable
data retention.
</p>

<img src="./assets/images/screenshot.png" alt="MyForm" />

## Features

### Build forms with ease

- **Two response layouts**: classic one-question-at-a-time conversational flow **or** multi-page
  forms with configurable page breaks — selected per form in the builder.
- **Versatile inputs**: text, email, phone, picture choices, date pickers, tables, payments,
  file uploads, signatures and more.
- **Voice, video and screen-recording answers**: respondents can record audio/video (or share
  their screen) in the browser; recordings are uploaded to configurable object storage and audio
  is transcribed automatically through a configurable provider.
- **Save & resume**: respondents can leave and continue later from any device through a secure,
  non-guessable continuation link.
- **Smart logic**: conditional branching, variables, hidden fields and URL redirections.

### Gamified quizzes

- Configurable scoring per question and per choice, timers with countdown, result states,
  percentage calculation and an optional leaderboard with ranking and tie handling — all stored
  as form configuration and computed from real submissions.

### Analyze and act on data

- **Real-time analytics dashboard**: response trends, completion and abandonment rates, average
  completion time, per-question distributions, quiz scores, device/browser breakdown and
  media-answer counts — all queried from your live database.
- **Hesitation heatmap**: see where respondents spend time, hesitate, hit validation errors or
  abandon the form, computed from real respondent events.
- **Shareable public dashboards**: publish a read-only analytics view through a secure,
  revocable share link.
- **Scheduled reports**: weekly/monthly summary emails with real response data, delivered by a
  background worker on your schedule and timezone.
- **Exports**: CSV, XLSX and PDF generated from actual response data, with date-range filters.

### Privacy by design

- Consent records with timestamps, respondent data-deletion requests, a persistent audit log,
  and configurable retention policies with automatic deletion (including uploaded media) run by
  a background worker.

### Customize to your brand

- Visual theme designer with live preview: fonts, colors, backgrounds, buttons, borders,
  spacing, logo — plus dark mode and custom CSS.

## Monorepo layout

```
packages/
  server/             NestJS API — GraphQL + REST, MongoDB, Redis/Bull workers
  webapp/             React 19 + Vite dashboard
  form-renderer/      Respondent-facing form runtime (also used by the embed package)
  embed/              Embeddable script for third-party sites
  shared-types-enums/ Shared TypeScript types and enums
  answer-utils/       Shared answer validation/serialization domain logic
  utils/              Shared utilities (env loading, dates, mime, ids, …)
```

## Quick start

Requirements: Node.js 20+, pnpm 9, Docker (for MongoDB + Redis).

```bash
pnpm install
cp packages/server/.env.example packages/server/.env.local   # edit as needed
cp packages/webapp/.env.example packages/webapp/.env.local
pnpm dev:database   # MongoDB + Redis via Docker Compose
pnpm dev            # build shared packages, then run webapp + server
```

The server listens on `APP_LISTEN_PORT` (default 9157) and the webapp dev server proxies to it.

## Configuration

All deployment-specific values come from environment configuration — no URLs, domains, ports or
secrets are hardcoded in source. See `packages/server/.env.example` for the full reference
(database, Redis, SMTP, object storage, OAuth/social login, Stripe, transcription provider,
retention, scheduled jobs). Configuration is validated at startup and fails fast with clear
errors when required variables are missing.

## Development

```bash
pnpm build          # build all packages
pnpm lint           # oxlint across packages
pnpm test           # unit + integration tests
```

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

## License

MyForm is licensed under the [GNU AGPL-3.0](./LICENSE).
