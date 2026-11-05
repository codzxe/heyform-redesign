#!/usr/bin/env node
/**
 * validate-hardcoded-values.js — fail when machine/deployment-specific values
 * are hardcoded in source code instead of coming from configuration.
 *
 * ZERO npm dependencies — Node.js built-ins only.
 *
 * SCOPE (path filter, everything else is ignored):
 *   - packages/<pkg>/src/**        (source code of every package)
 *   - packages/<pkg>/test/**       (tests AND their fixtures are scanned)
 *   - packages/server/scripts/**   (server helper scripts)
 *   Translation files (packages/webapp/src/locales) are inside src/** and ARE
 *   scanned — they must be clean too.
 *   NEVER scanned: .env* files (secrets/templates), binary/asset extensions
 *   (png jpg jpeg gif ico woff woff2 ttf eot mp3 mp4 webm wav ogg zip pdf —
 *   SVG is text and IS scanned), node_modules/dist/build/coverage/.turbo/.next.
 *
 * RULES (a hit is reported as `path:line [rule] <trimmed line>`):
 *
 *   A  Loopback URL literal — http(s)://localhost, http(s)://127.0.0.1 or
 *      http(s)://0.0.0.0 with an optional port, matched anywhere on the line
 *      (URLs are unambiguous, so comments are not exempt).
 *
 *   B  Bare loopback token inside a string literal — `localhost` or
 *      `127.0.0.1` (word-boundary, case-insensitive) inside a '...', "..."
 *      or `...` quoted span on the line. This is what catches fallbacks like
 *      `process.env.REDIS_HOST || '127.0.0.1'`.
 *      False-positive policy: quoted examples inside comments (e.g.
 *      "// use 'localhost' in dev") also match — the line is printed for
 *      human review; fix the comment or the code. Bare '0.0.0.0' is NOT
 *      part of rule B (only its URL form is covered by rule A).
 *
 *   C  Machine-specific filesystem path inside a string literal.
 *        - `/home/<user>` and `/Users/<user>` are always flagged
 *          (unambiguous machine paths).
 *        - `/workspace/<seg>` and `/project/<seg>/` are flagged ONLY when
 *          the same literal also contains a file-extension-like segment
 *          (e.g. `dist/index.js`, `.env`): bare `/workspace/...` and
 *          `/project/...` strings are legitimate URL routes in this app
 *          (see packages/webapp/src/routes — /workspace/create,
 *          /workspace/:team/project/:id), so directory-only shapes cannot
 *          be distinguished from routes by shape alone. This trade-off is
 *          deliberate and documented here.
 *        - http(s):// URLs are stripped before rule C runs, so URL paths
 *          like `https://example.com/home/page` do not false-positive.
 *
 * ALLOWLIST: audited below (exact file or directory prefix, each with a
 * reason). Allowlisted hits are counted and summarized by default; pass
 * --verbose to print every suppressed line together with the reason.
 *
 * Usage:
 *   node scripts/validate-hardcoded-values.js [root] [--verbose] [--help]
 *
 *     root        Optional root to scan (default: current working
 *                 directory). Only needed for fixture testing.
 *     --verbose   Also print allowlisted (suppressed) hits with reasons.
 *     --help      Print this usage.
 *
 * Exit code 1 when any NON-allowlisted violation is found, 0 otherwise.
 */

'use strict'

const path = require('path')

const {
  listFiles,
  isBinaryPath,
  isEnvPath,
  readLines,
  trimForReport,
  extractQuotedSegments,
  parseArgs
} = require('./scan-utils')

// ---------------------------------------------------------------------------
// ALLOWLIST — every entry needs a reason. Keep this the narrowest set that
// still avoids false positives; widening it requires a review.
// ---------------------------------------------------------------------------

const ALLOWLIST = [
  {
    file: 'packages/server/src/utils/outbound-url.ts',
    reason:
      'SSRF guard: must reference loopback/private literals (localhost, .localhost, 127.0.0.0/8, RFC1918 ranges, ::1) in order to detect and block them.'
  },
  {
    file: 'packages/server/test/outbound-url.test.ts',
    reason:
      'Tests the SSRF guard: localhost/127.0.0.1 and private-range URLs are the test vectors proving they are blocked.'
  },
  {
    file: 'packages/server/test/environment-validation.test.ts',
    reason:
      'Tests environment defaults and validation: loopback MONGO_URI/REDIS_HOST values form the minimal valid dev baseline, and http://localhost|127.0.0.1 homepage URLs are the vectors that must be REJECTED in production.'
  },
  {
    file: 'packages/server/src/environments/validate.ts',
    reason:
      'Startup configuration guard: isLocalHostname/isLoopbackIp reference loopback literals in order to REJECT loopback APP_HOMEPAGE_URL values in production — same pattern as the SSRF guard in outbound-url.ts.'
  },
  {
    file: 'packages/server/test/endpoint-security.test.ts',
    reason:
      'Security test fixture: the mocked client IP (127.0.0.1) is the test vector for trust-proxy/IP-authorization behavior.'
  },
  {
    file: 'packages/server/test/googlesheets.test.ts',
    reason:
      'Integration test binds an ephemeral local HTTP server on 127.0.0.1 to mock the Google Sheets API — development tooling usage permitted by the validation policy.'
  },
  {
    file: 'packages/server/test/integration-auth.test.ts',
    reason:
      'Integration test binds an ephemeral local HTTP server on 127.0.0.1 to mock OAuth2 token endpoints — development tooling usage permitted by the validation policy.'
  },
  {
    file: 'packages/server/test/integration-secrets.test.ts',
    reason:
      'Integration test uses unreachable loopback URLs (127.0.0.1:1) as deliberately-failing endpoints to test secret-decryption error paths — development tooling usage.'
  },
  {
    file: 'packages/server/test/e2e/scripts/run-with-docker.js',
    reason:
      'E2E orchestration tooling: E2E_REDIS_HOST defaults to 127.0.0.1 for the local Docker Compose test stack — development tooling, never shipped to runtime configuration.'
  },
  {
    file: 'packages/webapp/test/apollo-auth.test.ts',
    reason:
      'Unit test injects a local GRAPHQL_API_URL to assert apollo client auth headers against a mocked transport — development tooling usage.'
  },
  {
    file: 'packages/server/test/cors.test.ts',
    reason:
      'CORS unit test: http://localhost:3000 origins are the test vectors proving loopback origins are matched/normalized correctly.'
  },
  {
    file: 'packages/server/test/e2e/helpers/seed.ts',
    reason:
      'E2E seeding connects to the local Docker Compose MongoDB on 127.0.0.1:27018 — development tooling, never runtime configuration.'
  },
  {
    file: 'packages/server/test/e2e/helpers/verification.ts',
    reason:
      'E2E verification helper reads Redis on the local Docker Compose stack — development tooling, never runtime configuration.'
  },
  {
    file: 'packages/server/test/e2e/run.ts',
    reason:
      'E2E runner base URL fallback for the local test stack — development tooling, never runtime configuration.'
  }

  // AUDIT NOTES (do not widen without re-inspecting):
  // - packages/server/src/environments/load-env.ts was inspected per the task
  //   brief and contains NO loopback/localhost/machine-path string literals —
  //   it is intentionally NOT allowlisted.
  // - packages/webapp/pnpm-lock.yaml contains stale old-brand workspace
  //   package names; it is a BRANDING finding handled by validate-branding.js
  //   and is resolved by regenerating the lockfile (scheduled integration task).
]

// ---------------------------------------------------------------------------
// Scope + rules
// ---------------------------------------------------------------------------

const SCOPE_PATTERNS = [/^packages\/[^/]+\/(?:src|test)\/.+/, /^packages\/server\/scripts\/.+/]

const LOOPBACK_URL_RE = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?/i
const QUOTED_LOOPBACK_TOKEN_RE = /\b(?:localhost|127\.0\.0\.1)\b/i
const HTTP_URL_RE = /https?:\/\/[^\s'"`]*/gi
const MACHINE_PATH_UNAMBIGUOUS_RE = /\/(?:home|Users)\/[A-Za-z0-9._-]+/
const MACHINE_PATH_WORKSPACE_RE = /\/workspace\/[A-Za-z0-9._-]+/
const MACHINE_PATH_PROJECT_RE = /\/project\/[A-Za-z0-9._-]+\//

function hasFileExtensionSegment(segment) {
  return segment.split('/').some(part => /^\.*[A-Za-z0-9._-]*\.[A-Za-z][A-Za-z0-9]*$/.test(part))
}

const RULES = [
  {
    id: 'A',
    name: 'loopback URL literal (http(s)://localhost|127.0.0.1|0.0.0.0[:port])',
    test: line => LOOPBACK_URL_RE.test(line)
  },
  {
    id: 'B',
    name: "bare 'localhost' / '127.0.0.1' inside a string literal",
    test: line =>
      extractQuotedSegments(line).some(segment => QUOTED_LOOPBACK_TOKEN_RE.test(segment))
  },
  {
    id: 'C',
    name: 'machine-specific path inside a string literal (/home/…, /Users/…, file-shaped /workspace/…, /project/…/)',
    test: line =>
      extractQuotedSegments(line).some(segment => {
        const stripped = segment.replace(HTTP_URL_RE, '')

        if (MACHINE_PATH_UNAMBIGUOUS_RE.test(stripped)) {
          return true
        }

        const ambiguous =
          MACHINE_PATH_WORKSPACE_RE.test(stripped) || MACHINE_PATH_PROJECT_RE.test(stripped)

        return ambiguous && hasFileExtensionSegment(stripped)
      })
  }
]

// ---------------------------------------------------------------------------
// Allowlist matching
// ---------------------------------------------------------------------------

function findAllowlistEntry(relativePath) {
  return ALLOWLIST.find(entry => {
    if (entry.file !== undefined) {
      return entry.file === relativePath
    }

    if (entry.dirPrefix !== undefined) {
      return relativePath === entry.dirPrefix || relativePath.startsWith(`${entry.dirPrefix}/`)
    }

    return false
  })
}

// ---------------------------------------------------------------------------
// Scan
// ---------------------------------------------------------------------------

function inScope(relativePath) {
  return SCOPE_PATTERNS.some(pattern => pattern.test(relativePath))
}

function main() {
  const { flags, positional } = parseArgs(process.argv.slice(2), ['help', 'verbose'])

  if (flags.help) {
    printUsage()
    return 0
  }

  const rootDir = path.resolve(positional[0] || process.cwd())
  const { files, mode } = listFiles(rootDir)
  const candidates = files.filter(file => inScope(file) && !isEnvPath(file) && !isBinaryPath(file))

  const violations = []
  const allowlistedHits = []
  const allowlistUsage = new Map() // file -> count

  for (const relativePath of candidates) {
    const content = readLines(path.join(rootDir, relativePath))

    if (!content) {
      continue
    }

    const entry = findAllowlistEntry(relativePath)

    content.lines.forEach((line, index) => {
      const matchedRuleIds = RULES.filter(rule => rule.test(line)).map(rule => rule.id)

      if (matchedRuleIds.length === 0) {
        return
      }

      const hit = {
        file: relativePath,
        line: index + 1,
        rules: matchedRuleIds,
        text: trimForReport(line)
      }

      if (entry) {
        allowlistedHits.push({ hit, entry })
        allowlistUsage.set(
          entry.file || entry.dirPrefix,
          (allowlistUsage.get(entry.file || entry.dirPrefix) || 0) + 1
        )
      } else {
        violations.push(hit)
      }
    })
  }

  // ---- report ----

  process.stdout.write(
    `Hardcoded-value scan — rules A (loopback URL), B (quoted loopback token), C (machine path)\n` +
      `Scope: packages/*/src/**, packages/*/test/**, packages/server/scripts/** (no .env*, no binary assets)\n` +
      `Root: ${rootDir} (enumerated via ${mode})\n` +
      `Scanned ${candidates.length} in-scope file(s).\n\n`
  )

  if (violations.length > 0) {
    process.stdout.write(`VIOLATIONS (${violations.length}):\n`)

    for (const hit of violations) {
      process.stdout.write(`  ${hit.file}:${hit.line} [${hit.rules.join(',')}] ${hit.text}\n`)
    }

    process.stdout.write('\n')
  }

  if (allowlistedHits.length > 0) {
    const usage = [...allowlistUsage.entries()]
      .map(([file, count]) => `${file} (${count})`)
      .join(', ')

    process.stdout.write(
      `Allowlisted hits suppressed: ${allowlistedHits.length} — ${usage}. Run with --verbose to list them.\n`
    )

    if (flags.verbose) {
      for (const { hit, entry } of allowlistedHits) {
        process.stdout.write(
          `  [allowlisted] ${hit.file}:${hit.line} [${hit.rules.join(',')}] ${hit.text}\n` +
            `      reason: ${entry.reason}\n`
        )
      }
    }
  } else {
    process.stdout.write('Allowlisted hits suppressed: 0.\n')
  }

  if (violations.length > 0) {
    const affectedFiles = new Set(violations.map(hit => hit.file)).size

    process.stdout.write(
      `\nFAIL: ${violations.length} hardcoded-value violation(s) in ${affectedFiles} file(s). ` +
        'Deployment-specific values must come from configuration, not source literals.\n'
    )

    return 1
  }

  process.stdout.write('PASS: no non-allowlisted hardcoded values found.\n')
  return 0
}

function printUsage() {
  process.stdout.write(
    `Usage: node scripts/validate-hardcoded-values.js [root] [--verbose] [--help]

Fails (exit 1) when machine/deployment-specific values are hardcoded in
scope (packages/*/src/**, packages/*/test/**, packages/server/scripts/**).

Rules:
  A  loopback URL literal: http(s)://localhost|127.0.0.1|0.0.0.0[:port]
  B  bare 'localhost' / '127.0.0.1' inside a string literal (quoted span)
  C  machine path in a string literal: /home/<u>, /Users/<u> always;
     /workspace/<seg> and /project/<seg>/ only when the literal also
     contains a file-extension-like segment (bare forms are app routes)

Never scanned: .env* files, binary/asset extensions, node_modules, dist,
build, coverage, .turbo, .next. Allowlisted files are listed inline in the
script header with reasons; suppressed hits are counted by default and
printed with --verbose.

Arguments:
  root        Optional root to scan (default: current working directory).
  --verbose   Print every allowlisted (suppressed) hit with its reason.
  --help      Show this help.
`
  )
}

process.exit(main())
