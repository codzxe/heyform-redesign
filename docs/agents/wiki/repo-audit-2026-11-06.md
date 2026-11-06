# Repository Audit — 2026-11-06

Audited at commit `35d3aaa` by three parallel agents (backend architecture, branding/hardcoding, frontend/layout). Findings below fed directly into the spec issues (#1–#6) — ticket Problem Statements cite them.

## Stack

- pnpm monorepo, packages: `server` (NestJS 10, GraphQL/Apollo + REST, Mongoose 7 / MongoDB), `webapp` (React 19 + Vite 5 + SWC, Tailwind 3.4 + SCSS layers, Radix-based custom components), `form-renderer`, `embed`, `utils`, `shared-types-enums`, `answer-utils`.
- 2,100 tracked files; `packages/webapp/src/assets/fonts/` alone is ~327 MB of self-hosted Google fonts (not media) — excluded from size concerns.
- Docker Compose: MongoDB + Redis (dev), KeyDB (test). CI: `server-e2e.yml`, `oxlint-launcher.yml`, `publish-docker-image.yml`.

## What already exists (do not re-implement)

- **Rebrand** HeyForm→MyForm landed in commit `fe65089`; residual: nested `packages/webapp/pnpm-lock.yaml` with `@heyform-inc/*` refs (stale, root lockfile correct) and `myformhq.com` in answer-utils fixtures + one server comment.
- **37 Mongoose models** including: `response-session` (token hash + TTL), `consent-record`, `media-asset` (embedded transcript, status), `analytics-event` (+ query service with trends/breakdowns/heatmap/quiz analytics, 10-min Redis cache), `dashboard-share` + public-dashboard controller, `scheduled-report` (queue + 5-min cron), `deletion-request`, `audit-log`, `submission-ip-limit`, submission quiz fields + leaderboard index, `team` (storageQuota, removeBranding).
- **8 Bull queues** (Mail, TranslateForm, Integration, SubmissionNotification, Transcription — idempotent, ScheduledReport — idempotent, DeletionRequest, FormReport) + 5 `@nestjs/schedule` crons (trash purge, invite reset, account deletion, response-session cleanup, retention purge, scheduled reports).
- **Auth complete**: encrypted AES session cookie bound to device id (Redis hash, max-device eviction), email verification codes, password reset, account deletion, OAuth (Google/Apple/OIDC), disposable-email blocklist, guards `AuthGuard`/`PermissionGuard`/`RoleGuard` (OWNER/ADMIN/COLLABORATOR/MEMBER)/`DeviceIdGuard`, `GqlThrottlerGuard` 1000/min.
- **Payments**: Stripe Connect for form payment blocks only; webhook signature verified; no event dedup.
- **AI**: OpenAI service (model via `OPENAI_GPT_MODEL`) — form/fields/logic/theme generation, form translation queue, real transcription pipeline (OpenAI-compatible provider via `TRANSCRIPTION_*`).
- **Public respondent surface isolated** (`resolver/endpoint/`) with reCAPTCHA, Akismet, per-IP limits, choice limits, upload/session throttles, form passwords.
- **Integrations framework** (`src/apps/` defineApp) with 3 apps: webhook (SSRF-guarded), Google Sheets, Privatus Analytics; encrypted credentials + rotation CLI.
- **Tests**: ~65 unit (auth, permission matrix, endpoint, stripe authz, deletion cascade, quotas, AI) + e2e (auth, team flow, permission matrix, rate limit, choice limits, stateful edges, input validation, catalog, navigation, health).

## Critical gaps (drove the ticket set)

1. **SaaS commercial layer is a stub**: `ai.resolver.ts getPlan()` hardcoded; no plans/subscriptions/entitlements/billing portal; AI limits are constants (20/user/hr, 100/team/hr); `team.storageQuota` never enforced; no storage metering.
2. **Respondent experience is dead code**: commit `35d3aaa` added `ClassicMain.tsx`, `ResumeBanner.tsx`, `BlockRegistry.tsx` (voice/video/screen blocks), `useResponseSessionSync` — but `views/Blocks.tsx` still routes through its local `getBlock` switch; nothing imports the new views; `style.scss` has no `.myform-classic-*`/`.myform-resume-*` rules; no builder layout toggle.
3. **Storage is public-read**: S3 `PutObject` ACL public-read, no signed URLs, no private bucket; S3 envs read in `environments/index.ts` but missing from `.env.example`.
4. **Config unvalidated**: zod dep unused; `.env.example` missing S3_*, TRANSCRIPTION_*, APP_LISTEN_*, BULL_JOB_TIMEOUT, UPLOAD_FILE_SIZE, SMTP_SECURE/SERVERNAME + webapp VITE_DASHBOARD_URL/VITE_TEMPLATES_URL/VITE_HELP_CENTER_URL/VITE_FEEDBACK_FORM_URL.
5. **Hardcoded URLs**: dead templates host (`template.service.ts`), nonexistent changelog repo (`changelog.service.ts`), default Unsplash cover, `PRIVATUS_SCRIPT_URL`, unpkg CDN in embed modal; docs point to nonexistent `codzxe/myform`.
6. **Drifting constants**: webapp "10MB" vs server `UPLOAD_FILE_SIZE`, 30-day trash, integration TTL, cron literals, throttle numbers, invite expiry 7d vs `INVITE_CODE_EXPIRE_DAYS`, `max_tokens: 1000`.
7. **Layout weaknesses** (palette/fonts are good — `--hf-*` vars, Inter + Playfair, dark mode class): triple card-in-card shell layering, `max-w-6xl` caps tables, fixed sidebar no collapse, builder RightSidebar `max-lg:hidden` with no mobile fallback, Logic tab redundancy, `focus-visible` in ~5 files, no skip link, `Async` error fallback renders children, `LoginGuard` flash.
8. No realtime analytics refresh; no standalone worker process; no job observability; zh-cn email templates missing.

## Frontend design system facts (preserve)

- Tailwind 3.4 JS config; palette as `--hf-*` CSS vars in `src/styles/globals.scss` (warm editorial: cream bg, ink text, forest brand; dark: charcoal + yellow accents); fonts Inter (sans) + Playfair Display (serif); `darkMode: ['class']` applied in `WorkspaceAccount.tsx`; custom breakpoints `builder-md:1230px`/`builder-lg:1440px` (barely used).
- Builder: LeftSidebar `w-16rem` (questions/endings PanelGroup), Compose canvas using real `myform-*` classes, RightSidebar `w-20rem` tabs (Question/Design/Logic); **live preview** exists (`PreviewModal` renders real `FormRenderer` with viewport tabs).
- Conversational renderer: `myform-block-main` max-width 45rem, 1000ms transitions with `prefers-reduced-motion`, Enter-to-advance, validation error display — strong.
