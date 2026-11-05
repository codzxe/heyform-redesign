#!/usr/bin/env node
/**
 * scan-utils.js — shared helpers for the repository validation scripts.
 *
 * ZERO npm dependencies: Node.js built-ins only. Intentionally written in
 * CommonJS so it can be `require()`d by plain `node scripts/*.js` runs in
 * this workspace (the root package.json has no "type": "module" field).
 */

'use strict'

const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

/**
 * Directories that are never scanned, in both enumeration modes.
 * Used by the filesystem-walk fallback and (defensively) to filter the
 * `git ls-files` output in case build artifacts were ever committed.
 */
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.turbo', '.next'])

/**
 * Binary/asset extensions that are skipped by every scanner.
 *
 * NOTE: `.svg` is intentionally NOT in this list — SVG is text and is
 * scanned (branding strings can hide in SVG markup).
 */
const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.mp3',
  '.mp4',
  '.webm',
  '.wav',
  '.ogg',
  '.zip',
  '.pdf'
])

/** Maximum characters of a matched line that are echoed in reports. */
const REPORT_LINE_MAX_LENGTH = 200

function toPosix(filePath) {
  return filePath.split(path.sep).join('/')
}

/** True for binary/asset files that scanners must not try to read as text. */
function isBinaryPath(filePath) {
  return BINARY_EXTENSIONS.has(path.extname(filePath).toLowerCase())
}

/**
 * True for local secret env files that must NOT be scanned.
 *
 * `.env.example` / `.env.*.example` are tracked templates and ARE scanned
 * (the brand must be correct there too), which is why they are exempted
 * from this check.
 */
function isEnvPath(filePath) {
  const base = path.basename(filePath)

  if (base === '.env') {
    return true
  }

  return base.startsWith('.env.') && !base.endsWith('.example')
}

/** True for pnpm lockfiles. */
function isLockfilePath(filePath) {
  return path.basename(filePath) === 'pnpm-lock.yaml'
}

/** True when any path segment is a skipped directory. */
function underSkippedDir(posixRelPath) {
  return posixRelPath.split('/').some(segment => SKIP_DIRS.has(segment))
}

/**
 * Enumerate files with `git ls-files` (tracked files only).
 * Returns null when git is unavailable, fails, or lists nothing — the
 * caller then falls back to a filesystem walk.
 */
function gitLsFiles(rootDir) {
  let result

  try {
    result = spawnSync('git', ['ls-files', '-z'], {
      cwd: rootDir,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024
    })
  } catch {
    return null
  }

  if (result.error || result.status !== 0 || !result.stdout) {
    return null
  }

  return result.stdout.split('\0').filter(Boolean).map(toPosix)
}

/** Recursive filesystem walk fallback (skips SKIP_DIRS). */
function walkFiles(rootDir, currentDir, accumulator) {
  const dir = currentDir || rootDir
  const acc = accumulator || []

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) {
        continue
      }
      walkFiles(rootDir, path.join(dir, entry.name), acc)
    } else if (entry.isFile()) {
      acc.push(toPosix(path.relative(rootDir, path.join(dir, entry.name))))
    }
  }

  return acc
}

/**
 * Enumerate candidate files relative to `rootDir`.
 *
 * Prefers `git ls-files` (tracked files, deterministic, ignores untracked
 * local secrets); falls back to a recursive walk when git is not usable.
 * Skip-directories are filtered in both modes.
 *
 * @returns {{ files: string[], mode: 'git ls-files' | 'filesystem walk' }}
 */
function listFiles(rootDir) {
  const gitFiles = gitLsFiles(rootDir)
  const mode = gitFiles !== null ? 'git ls-files' : 'filesystem walk'
  const files = (gitFiles !== null ? gitFiles : walkFiles(rootDir)).filter(
    file => !underSkippedDir(file) && file.length > 0
  )

  files.sort()
  return { files, mode }
}

/**
 * Read a file as UTF-8 text and split it into lines.
 *
 * Returns null (and warns once per file) when the file cannot be read or
 * looks binary (NUL byte in the first 8 KB) — e.g. images without a known
 * extension. Line numbers are 1-based.
 *
 * @returns {{ lines: string[] } | null}
 */
function readLines(absolutePath) {
  let buffer

  try {
    buffer = fs.readFileSync(absolutePath)
  } catch (error) {
    process.stderr.write(`warn: could not read ${absolutePath}: ${error.message}\n`)
    return null
  }

  const probe = buffer.subarray(0, 8192)

  if (probe.includes(0)) {
    return null // binary content
  }

  const text = buffer.toString('utf8')
  return { lines: text.split(/\r?\n/) }
}

/** Trim a matched line for reporting; very long lines are capped. */
function trimForReport(text) {
  const trimmed = String(text).trim()

  if (trimmed.length <= REPORT_LINE_MAX_LENGTH) {
    return trimmed
  }

  return `${trimmed.slice(0, REPORT_LINE_MAX_LENGTH)} …[truncated]`
}

/**
 * Extract same-line string-literal segments from a source line.
 *
 * Matches 'single', "double" and `template` quoted spans, honoring
 * backslash escapes. Documented limitations (pragmatic, line-based):
 *   - multi-line template literals are only matched per line,
 *   - apostrophes inside prose comments can open a bogus "string" —
 *     this is the accepted false-positive policy: reviewers look at the
 *     printed line and judge.
 *
 * @returns {string[]} the raw contents of every quoted span found
 */
function extractQuotedSegments(line) {
  const segments = []
  const pattern = /(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g
  let match

  while ((match = pattern.exec(line)) !== null) {
    segments.push(match[2])
  }

  return segments
}

/** Minimal flag parser: `--name` booleans plus `--name=value`. */
function parseArgs(argv, flagNames) {
  const flags = {}
  const positional = []

  for (const name of flagNames) {
    flags[name] = false
  }

  for (const arg of argv) {
    if (arg === '--') {
      continue
    }

    const equalsIndex = arg.indexOf('=')

    if (arg.startsWith('--') && equalsIndex > 2) {
      const name = arg.slice(2, equalsIndex)

      if (flagNames.includes(name)) {
        flags[name] = arg.slice(equalsIndex + 1) !== 'false'
        continue
      }
    }

    if (arg.startsWith('--')) {
      const name = arg.slice(2)

      if (flagNames.includes(name)) {
        flags[name] = true
      } else {
        flags.help = true // unknown flag — show usage
      }
      continue
    }

    positional.push(arg)
  }

  return { flags, positional }
}

module.exports = {
  SKIP_DIRS,
  BINARY_EXTENSIONS,
  REPORT_LINE_MAX_LENGTH,
  toPosix,
  isBinaryPath,
  isEnvPath,
  isLockfilePath,
  underSkippedDir,
  gitLsFiles,
  walkFiles,
  listFiles,
  readLines,
  trimForReport,
  extractQuotedSegments,
  parseArgs
}
