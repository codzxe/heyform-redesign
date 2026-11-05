import { date, helper } from '@myform/utils'

// A plain `YYYY-MM-DD` ISO string, anchored to UTC midnight by the JS date parser
const DATE_ONLY_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

// The minimal submission shape the export date-range helpers need, so real
// SubmissionModel documents and plain objects (tests) both satisfy it.
export interface ExportDateRangeSubject {
  endAt?: number
  createdAt?: Date | string | number
}

/**
 * The timestamp a submission counts as submitted at for export filtering:
 * `endAt` (unix seconds) when present, `createdAt` (converted to unix
 * seconds) otherwise. Mirrors the `$ifNull` fallback of the `$expr` filter in
 * `SubmissionService.findAllByFormBatched`.
 */
export function effectiveSubmittedAt(submission: ExportDateRangeSubject): number | undefined {
  // $ifNull semantics: only a missing endAt falls back to createdAt
  if (helper.isValid(submission.endAt)) {
    return Number(submission.endAt)
  }

  if (helper.isValid(submission.createdAt)) {
    return new Date(submission.createdAt).getTime() / 1000
  }

  return undefined
}

/**
 * Whether a submission falls within the `[from, to]` export window (unix
 * seconds, both bounds inclusive). With no bounds every submission matches,
 * while submissions without a usable timestamp never match a bounded
 * window — the same semantics as the `$expr` filter in
 * `SubmissionService.findAllByFormBatched`.
 */
export function isWithinRange(
  submission: ExportDateRangeSubject,
  from?: number,
  to?: number
): boolean {
  if (!helper.isValid(from) && !helper.isValid(to)) {
    return true
  }

  const submittedAt = effectiveSubmittedAt(submission)

  // Missing or corrupt timestamps never match a bounded window
  if (submittedAt === undefined || !Number.isFinite(submittedAt)) {
    return false
  }

  if (helper.isValid(from) && submittedAt < from!) {
    return false
  }

  if (helper.isValid(to) && submittedAt > to!) {
    return false
  }

  return true
}

/**
 * Converts the export endpoint's ISO 8601 `from`/`to` query strings into
 * unix seconds for `SubmissionService.findAllByFormBatched`.
 *
 * Boundary choice: a date-only `from` selects from the start of that UTC
 * day, and a date-only `to` is expanded to the very end of that UTC day
 * (inclusive), so `to=2024-06-15` exports everything submitted up to
 * 2024-06-15T23:59:59.999Z. Date-only values are therefore parsed against
 * an explicit `Z` offset so the selected day never shifts with the server's
 * timezone. Timestamps carrying a time component are used as-is down to the
 * millisecond (offset-less ones resolve in the server's local timezone,
 * following native Date semantics). Both bounds are inclusive, and values
 * that do not parse to a real date are ignored as if they had been omitted.
 */
export function resolveExportDateRange(from?: string, to?: string): { from?: number; to?: number } {
  const range: { from?: number; to?: number } = {}

  if (helper.isValid(from)) {
    const seconds = toExportUnixSeconds(from)

    if (seconds !== undefined) {
      range.from = seconds
    }
  }

  if (helper.isValid(to)) {
    const seconds = toExportUnixSeconds(to, true)

    if (seconds !== undefined) {
      range.to = seconds
    }
  }

  return range
}

// One export bound as unix seconds: date-only ISO strings anchor to UTC
// midnight (end of the UTC day for an inclusive `to`), everything else goes
// through dayjs. Returns undefined for values that are not a real date.
function toExportUnixSeconds(value: string, endOfDay = false): number | undefined {
  if (DATE_ONLY_ISO_PATTERN.test(value)) {
    const dayStart = Date.parse(`${value}T00:00:00.000Z`)

    if (Number.isNaN(dayStart)) {
      return undefined
    }

    return (endOfDay ? dayStart + MILLISECONDS_PER_DAY - 1 : dayStart) / 1000
  }

  const parsed = date(value)

  if (!parsed.isValid()) {
    return undefined
  }

  return parsed.valueOf() / 1000
}
