#!/usr/bin/env node
/**
 * validate-branding.js — fail when the OLD brand name survives anywhere.
 *
 * Scans every candidate file in the repository for case-insensitive
 * occurrences of "heyform" (this also catches "HeyForm", "HEYFORM" and
 * scoped package names such as "@heyform-inc/..."). Any occurrence is a
 * violation: the product is MyForm.
 *
 * ZERO npm dependencies — Node.js built-ins only.
 *
 * Usage:
 *   node scripts/validate-branding.js [root] [flags]
 *
 *   root                 Optional repository root (defaults to the current
 *                        working directory). Only needed to point the
 *                        scanner somewhere else, e.g. a fixture tree.
 *
 * Flags:
 *   --exclude-lockfile   Transitional: skip pnpm-lock.yaml files. The
 *                        DEFAULT (strict) run includes lockfiles — they
 *                        must be clean once regenerated. Remove this flag
 *                        from CI once the lockfile has been regenerated.
 *   --strict             Explicit no-op: lockfiles are always scanned
 *                        unless --exclude-lockfile is given. Intended for
 *                        self-documenting CI invocations.
 *   --help               Print this usage.
 *
 * What is scanned:
 *   - files tracked by git (`git ls-files`); falls back to a recursive
 *     filesystem walk when git is not usable
 *   - directories skipped in both modes: node_modules, .git, dist, build,
 *     coverage, .turbo, .next
 *   - binary/asset extensions skipped: png jpg jpeg gif ico woff woff2
 *     ttf eot mp3 mp4 webm wav ogg zip pdf
 *   - SVG files ARE scanned (they are text)
 *   - .env / .env.* local secret files are skipped, but tracked
 *     templates ending in `.example` (e.g. .env.example) ARE scanned
 *
 * Output: one `path:line: <trimmed line>` entry per match, then a summary.
 * Exit code 1 when at least one match is found, 0 otherwise.
 */

'use strict'

const path = require('path')

const {
  listFiles,
  isBinaryPath,
  isEnvPath,
  isLockfilePath,
  readLines,
  trimForReport,
  parseArgs
} = require('./scan-utils')

const OLD_BRAND_PATTERN = /heyform/i
const OLD_BRAND_DESCRIPTION = 'heyform (any case, incl. @heyform-inc/* package names)'

// ALLOWLIST — audited references that must mention the old name to document
// the migration or explain what the validation itself checks (the genuinely
// required history references). Keep this the narrowest possible set.
const ALLOWLIST = [
  {
    file: 'README.md',
    reason:
      'The Validation section documents what validate-branding.js detects and must name the old brand to do so.'
  },
  {
    file: 'scripts/validate-branding.js',
    reason: 'The validator documents its own detection pattern.'
  }
]

function isAllowlisted(relativePath) {
  return ALLOWLIST.some(entry => entry.file === relativePath)
}

const USAGE = `Usage: node scripts/validate-branding.js [root] [flags]

Fails (exit 1) when the old brand name "${OLD_BRAND_DESCRIPTION}" is found
in any scanned file of the repository.

Arguments:
  root                 Optional repository root (default: current directory).

Flags:
  --exclude-lockfile   Transitional: skip pnpm-lock.yaml files. The default
                       (strict) run scans lockfiles; they must be clean once
                       regenerated. Drop this flag once the lockfile is clean.
  --strict             Explicit no-op: the default already scans lockfiles.
                       Useful for self-documenting CI invocations.
  --help               Show this help.

Skipped: node_modules, .git, dist, build, coverage, .turbo, .next
directories; binary/asset files (png jpg jpeg gif ico woff woff2 ttf eot
mp3 mp4 webm wav ogg zip pdf); .env local secret files. SVG files and
.env.example templates ARE scanned.`

function main() {
  const { flags, positional } = parseArgs(process.argv.slice(2), [
    'help',
    'exclude-lockfile',
    'strict'
  ])

  if (flags.help) {
    process.stdout.write(`${USAGE}\n`)
    return 0
  }

  const rootDir = path.resolve(positional[0] || process.cwd())
  const { files, mode } = listFiles(rootDir)

  const candidates = files.filter(
    file =>
      !isBinaryPath(file) &&
      !isEnvPath(file) &&
      !(flags['exclude-lockfile'] && isLockfilePath(file))
  )

  const matches = []
  const allowlistedFiles = []

  for (const relativePath of candidates) {
    const allowlisted = isAllowlisted(relativePath)

    if (allowlisted) {
      allowlistedFiles.push(relativePath)
    }

    const content = readLines(path.join(rootDir, relativePath))

    if (!content) {
      continue
    }

    content.lines.forEach((line, index) => {
      if (OLD_BRAND_PATTERN.test(line) && !allowlisted) {
        matches.push({
          file: relativePath,
          line: index + 1,
          text: trimForReport(line)
        })
      }
    })
  }

  process.stdout.write(
    `Old-brand scan: ${OLD_BRAND_DESCRIPTION}\n` +
      `Root: ${rootDir} (enumerated via ${mode})\n` +
      `Scanned ${candidates.length} of ${files.length} candidate file(s)` +
      `${flags['exclude-lockfile'] ? ' [lockfiles excluded]' : ''}\n\n`
  )

  if (allowlistedFiles.length > 0) {
    process.stdout.write(
      `Allowlisted (documented migration references): ${allowlistedFiles.join(', ')}\n\n`
    )
  }

  if (matches.length === 0) {
    process.stdout.write('PASS: no occurrences of the old brand name found.\n')
    return 0
  }

  for (const match of matches) {
    process.stdout.write(`${match.file}:${match.line}: ${match.text}\n`)
  }

  const affectedFiles = new Set(matches.map(match => match.file)).size

  process.stdout.write(
    `\nFAIL: ${matches.length} old-brand occurrence(s) found in ${affectedFiles} file(s).\n` +
      'Every occurrence must be replaced with the MyForm branding.\n'
  )

  return 1
}

process.exit(main())
