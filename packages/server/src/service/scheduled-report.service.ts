import { FormKindEnum, FormStatusEnum, SubmissionStatusEnum } from '@myform/shared-types-enums'
import { InjectQueue } from '@nestjs/bull'
import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Queue } from 'bull'
import { readFileSync, readdirSync } from 'fs'
import { Model } from 'mongoose'
import { join } from 'path'

import type {
  CreateScheduledReportInput,
  UpdateScheduledReportInput
} from '../common/graphql/report.graphql'
import { FormService } from './form.service'
import { UserService } from './user.service'
import {
  APP_HOMEPAGE_URL,
  EMAIL_TEMPLATES_DIR,
  SMTP_FROM,
  SMTP_HOST,
  SMTP_PORT
} from '@environments'
import {
  FormAnalyticModel,
  FormModel,
  ScheduledReportFrequencyEnum,
  ScheduledReportModel,
  ScheduledReportStatusEnum,
  SubmissionModel
} from '@model'
import { date, helper, timestamp, unixDate } from '@myform/utils'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Product behavior (not deployment config): every scheduled report is delivered
// at 08:00 in the report's own timezone.
export const REPORT_HOUR = 8

const DAY_SECONDS = 86_400
const WEEK_SECONDS = 7 * DAY_SECONDS
// Hard cap so a corrupt period can never loop the day list forever
const MAX_DAILY_ROWS = 400

const TEMPLATE_NAME = 'scheduled_report'
const HTML_EXT = '.html'
const TEMPLATE_META_REGEX = /^---([\s\S]*?)---[\n\s\S]\n/
const DEFAULT_LOCALE = 'en'

// Frequency labels per supported UI language (UserLangEnum), used in the email
const FREQUENCY_LABELS: Record<string, Record<string, string>> = {
  en: { weekly: 'Weekly', monthly: 'Monthly' },
  'pt-br': { weekly: 'Semanal', monthly: 'Mensal' },
  'zh-cn': { weekly: '每周', monthly: '每月' }
}

// ---------------------------------------------------------------------------
// Timezone helpers (Intl only — no dayjs timezone plugin is resolvable here)
// ---------------------------------------------------------------------------

interface ZonedDateParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

export function isValidTimezone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

function zonedDateParts(utcSeconds: number, timeZone: string): ZonedDateParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  })
  const parts: Record<string, string> = {}

  for (const part of formatter.formatToParts(new Date(utcSeconds * 1_000))) {
    if (part.type !== 'literal') {
      parts[part.type] = part.value
    }
  }

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second)
  }
}

/**
 * Wall-clock time in a named timezone -> UTC seconds. Two passes absorb the
 * zone's UTC offset (including DST), the same way dayjs' timezone plugin does.
 */
function zonedWallClockToUtc(
  parts: Pick<ZonedDateParts, 'year' | 'month' | 'day'>,
  hour: number,
  minute: number,
  timeZone: string
): number {
  let guess = Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day, hour, minute) / 1_000)

  for (let round = 0; round < 3; round += 1) {
    const zoned = zonedDateParts(guess, timeZone)
    const asUtc = Math.floor(
      Date.UTC(zoned.year, zoned.month - 1, zoned.day, zoned.hour, zoned.minute, zoned.second) /
        1_000
    )
    const offset = asUtc - guess

    if (offset === 0) {
      break
    }

    guess -= offset
  }

  return guess
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function zonedDateString(utcSeconds: number, timeZone: string): string {
  const parts = zonedDateParts(utcSeconds, timeZone)
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`
}

/**
 * Next occurrence of the report's schedule, strictly after `from`:
 * weekly -> next `dayOfWeek` at 08:00 in the report timezone;
 * monthly -> `dayOfMonth` (1-28, so it exists in every month) at 08:00.
 * An invalid stored timezone falls back to UTC instead of throwing, so one bad
 * row can never stop the worker.
 */
export function computeNextRunAt(
  frequency: ScheduledReportFrequencyEnum | string,
  dayOfWeek: number | undefined,
  dayOfMonth: number | undefined,
  timezone: string,
  from: number = timestamp()
): number {
  const timeZone = isValidTimezone(timezone) ? timezone : 'UTC'
  const nowParts = zonedDateParts(from, timeZone)

  if (frequency === ScheduledReportFrequencyEnum.MONTHLY) {
    const targetDay = Math.min(Math.max(dayOfMonth ?? 1, 1), 28)

    for (let addMonths = 0; addMonths <= 2; addMonths += 1) {
      const totalMonths = nowParts.year * 12 + (nowParts.month - 1) + addMonths
      const year = Math.floor(totalMonths / 12)
      const month = (totalMonths % 12) + 1
      const runAt = zonedWallClockToUtc({ year, month, day: targetDay }, REPORT_HOUR, 0, timeZone)

      if (runAt > from) {
        return runAt
      }
    }

    // Unreachable for day 1-28; keeps the schedule moving even on corrupt input
    return from + 30 * DAY_SECONDS
  }

  const targetWeekday = Math.min(Math.max(dayOfWeek ?? 1, 0), 6)
  const localMidnightMs = Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day)

  for (let addDays = 0; addDays <= 14; addDays += 1) {
    const candidate = new Date(localMidnightMs + addDays * DAY_SECONDS * 1_000)
    const weekday = candidate.getUTCDay()

    if (weekday !== targetWeekday) {
      continue
    }

    const runAt = zonedWallClockToUtc(
      {
        year: candidate.getUTCFullYear(),
        month: candidate.getUTCMonth() + 1,
        day: candidate.getUTCDate()
      },
      REPORT_HOUR,
      0,
      timeZone
    )

    if (runAt > from) {
      return runAt
    }
  }

  // Unreachable: a matching weekday always exists within 14 days
  return from + WEEK_SECONDS
}

// ---------------------------------------------------------------------------
// Email helpers
// ---------------------------------------------------------------------------

interface TrustedHtml {
  html: string
  trusted: true
}

function trustedHtml(html: string): TrustedHtml {
  return { html, trusted: true }
}

function isTrustedHtml(value: unknown): value is TrustedHtml {
  return (
    helper.isPlainObject(value) &&
    (value as TrustedHtml).trusted === true &&
    helper.isString((value as TrustedHtml).html)
  )
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Only http(s) links are ever rendered as clickable
function safeEmailLink(value: unknown): string {
  try {
    const url = new URL(String(value ?? ''))

    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.toString()
    }
  } catch {}

  return '#'
}

function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds))

  if (seconds < 60) {
    return `${seconds}s`
  }

  const minutes = Math.floor(seconds / 60)

  if (minutes < 60) {
    return `${minutes}m ${seconds % 60}s`
  }

  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

interface EmailTemplate {
  subject: string
  html: string
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

export interface ScheduledReportQuizStats {
  averageScore: number
  averagePercentage: number
  highestScore: number
  passingRate: number
  responseCount: number
}

export interface ScheduledReportMetrics {
  totalResponses: number
  totalVisits: number
  completionRate: number
  avgCompletionTimeSeconds: number
  dailyCounts: Array<{ date: string; count: number }>
  quiz: ScheduledReportQuizStats | null
}

// Same rule the analytics overview uses, so the emailed rate always matches
// what the dashboard shows for the same period.
function completionRateOf(totalVisits: number, responses: number): number {
  if (totalVisits > 0 && responses > 0) {
    return Math.min(100, Math.round((100 * responses) / totalVisits))
  }

  if (totalVisits < 1 && responses > 1) {
    return 100
  }

  return 0
}

interface DailyCountRow {
  _id: string
  count: number
}

interface SummaryRow {
  total: number
  avgDuration: number | null
  avgScore: number | null
  avgPercentage: number | null
  highestScore: number | null
  passedCount: number
}

interface VisitRow {
  totalVisits: number
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class ScheduledReportService {
  private readonly emailTemplates: Record<string, EmailTemplate> = {}

  constructor(
    @InjectModel(ScheduledReportModel.name)
    private readonly scheduledReportModel: Model<ScheduledReportModel>,
    @InjectModel(SubmissionModel.name)
    private readonly submissionModel: Model<SubmissionModel>,
    @InjectModel(FormAnalyticModel.name)
    private readonly formAnalyticModel: Model<FormAnalyticModel>,
    private readonly formService: FormService,
    private readonly userService: UserService,
    @InjectQueue('MailQueue')
    private readonly mailQueue: Queue
  ) {
    this.loadEmailTemplates()
  }

  // ------------------------------------------------------------------
  // CRUD
  // ------------------------------------------------------------------

  async listByForm(formId: string): Promise<ScheduledReportModel[]> {
    return this.scheduledReportModel
      .find({
        formId
      })
      .sort({
        createdAt: 1
      })
  }

  /**
   * `form` comes from the authenticated resolver (FormGuard), so `form.teamId`
   * is server-side truth; the caller's team is never taken from input.
   */
  async create(
    form: FormModel,
    input: CreateScheduledReportInput,
    userId: string
  ): Promise<ScheduledReportModel> {
    const frequency = input.frequency as ScheduledReportFrequencyEnum
    const dayOfWeek =
      frequency === ScheduledReportFrequencyEnum.WEEKLY ? input.dayOfWeek : undefined
    const dayOfMonth =
      frequency === ScheduledReportFrequencyEnum.MONTHLY ? input.dayOfMonth : undefined

    this.validateSchedule(frequency, dayOfWeek, dayOfMonth, input.timezone)

    return this.scheduledReportModel.create({
      teamId: form.teamId,
      formId: input.formId,
      frequency,
      dayOfWeek,
      dayOfMonth,
      timezone: input.timezone,
      recipients: input.recipients,
      enabled: true,
      nextRunAt: this.computeNextRunAt(frequency, dayOfWeek, dayOfMonth, input.timezone),
      status: ScheduledReportStatusEnum.OK,
      createdBy: userId
    })
  }

  async update(
    id: string,
    teamId: string,
    input: UpdateScheduledReportInput
  ): Promise<ScheduledReportModel> {
    const report = await this.scheduledReportModel.findById(id)

    if (!report) {
      throw new BadRequestException('The scheduled report does not exist')
    }

    // Ownership is derived from the report's own form, never from the client
    const form = await this.formService.findById(report.formId)

    if (!form || form.teamId !== teamId || report.formId !== input.formId) {
      throw new BadRequestException('The scheduled report does not exist')
    }

    const frequency = (
      helper.isValid(input.frequency) ? input.frequency : report.frequency
    ) as ScheduledReportFrequencyEnum

    const dayOfWeek =
      frequency === ScheduledReportFrequencyEnum.WEEKLY
        ? input.dayOfWeek !== undefined
          ? input.dayOfWeek
          : report.dayOfWeek
        : undefined
    const dayOfMonth =
      frequency === ScheduledReportFrequencyEnum.MONTHLY
        ? input.dayOfMonth !== undefined
          ? input.dayOfMonth
          : report.dayOfMonth
        : undefined
    const timezone = helper.isValid(input.timezone) ? input.timezone! : report.timezone

    this.validateSchedule(frequency, dayOfWeek, dayOfMonth, timezone)

    const $set: Record<string, any> = {}
    const $unset: Record<string, any> = {}

    if (input.frequency !== undefined) {
      $set.frequency = frequency
    }

    if (frequency === ScheduledReportFrequencyEnum.WEEKLY) {
      if (input.dayOfWeek !== undefined) {
        $set.dayOfWeek = input.dayOfWeek
      }
      // Only the fields the frequency uses are kept, so a schedule read back
      // from the database is never ambiguous.
      $unset.dayOfMonth = 1
    } else {
      if (input.dayOfMonth !== undefined) {
        $set.dayOfMonth = input.dayOfMonth
      }
      $unset.dayOfWeek = 1
    }

    if (input.timezone !== undefined) {
      $set.timezone = input.timezone
    }

    if (helper.isValidArray(input.recipients)) {
      $set.recipients = input.recipients
    }

    if (input.enabled !== undefined) {
      $set.enabled = input.enabled
    }

    const now = timestamp()
    const scheduleChanged =
      $set.frequency !== undefined ||
      $set.dayOfWeek !== undefined ||
      $set.dayOfMonth !== undefined ||
      $set.timezone !== undefined
    const isEnabled = $set.enabled === undefined ? report.enabled : $set.enabled

    // Recompute the next run whenever the schedule itself changed, or when a
    // report is re-enabled with a nextRunAt that already passed.
    if (scheduleChanged || (isEnabled && report.nextRunAt <= now)) {
      $set.nextRunAt = this.computeNextRunAt(frequency, dayOfWeek, dayOfMonth, timezone, now)
    }

    if ($set.enabled === true) {
      $set.status = ScheduledReportStatusEnum.OK
      $unset.lastError = 1
    } else if ($set.enabled === false) {
      $set.status = ScheduledReportStatusEnum.DISABLED
    }

    if (!helper.isEmpty($set) || !helper.isEmpty($unset)) {
      const updates: Record<string, any> = {}

      if (!helper.isEmpty($set)) {
        updates.$set = $set
      }
      if (!helper.isEmpty($unset)) {
        updates.$unset = $unset
      }

      await this.scheduledReportModel.updateOne(
        {
          _id: report._id
        },
        updates
      )
    }

    return (await this.scheduledReportModel.findById(id))!
  }

  async remove(id: string, teamId: string): Promise<boolean> {
    const report = await this.scheduledReportModel.findById(id)

    if (!report) {
      throw new BadRequestException('The scheduled report does not exist')
    }

    const form = await this.formService.findById(report.formId)

    if (!form || form.teamId !== teamId) {
      throw new BadRequestException('The scheduled report does not exist')
    }

    const result = await this.scheduledReportModel.deleteOne({
      _id: report._id
    })

    return (result.deletedCount ?? 0) > 0
  }

  // ------------------------------------------------------------------
  // Worker
  // ------------------------------------------------------------------

  async findDue(now: number): Promise<ScheduledReportModel[]> {
    return this.scheduledReportModel
      .find({
        enabled: true,
        nextRunAt: {
          $lte: now
        }
      })
      .sort({
        nextRunAt: 1
      })
  }

  /**
   * Atomically claim a due report by advancing nextRunAt to the next
   * occurrence. The updateOne condition `nextRunAt <= now` makes the claim
   * race-free: exactly one dispatcher can win, no matter how often the cron
   * overlaps. Returns the due timestamp that was claimed (the run's trigger),
   * or null when another dispatcher got there first.
   */
  async claimNextRun(report: ScheduledReportModel, now: number): Promise<number | null> {
    const next = this.computeNextRunAt(
      report.frequency,
      report.dayOfWeek,
      report.dayOfMonth,
      report.timezone,
      now
    )

    const result = await this.scheduledReportModel.updateOne(
      {
        _id: report._id,
        enabled: true,
        nextRunAt: {
          $lte: now
        }
      },
      {
        $set: {
          nextRunAt: next
        }
      }
    )

    return (result.modifiedCount ?? 0) > 0 ? report.nextRunAt : null
  }

  /**
   * Compute the period's metrics from real submission data and email them to
   * the report's recipients. Idempotent per trigger: a run whose trigger was
   * already recorded in lastRunAt is skipped, so Bull retries and overlapping
   * enqueues never send the same report twice.
   */
  async generateAndSend(reportId: string, triggeredAt?: number): Promise<boolean> {
    const report = await this.scheduledReportModel.findById(reportId)

    if (!report || !report.enabled) {
      return false
    }

    // The trigger is the due timestamp that scheduled this run; falls back to
    // the current time when the job carries none (manual invocation).
    const trigger = helper.isValid(triggeredAt) ? triggeredAt! : timestamp()

    if (helper.isValid(report.lastRunAt) && report.lastRunAt! >= trigger) {
      return false
    }

    const form = await this.formService.findById(report.formId)

    // Missing or trashed forms have nothing to report. The cron already
    // advanced nextRunAt when claiming, so this simply skips the run.
    if (!form || form.status !== FormStatusEnum.NORMAL) {
      return false
    }

    const periodEnd = trigger
    const periodStart = helper.isValid(report.lastRunAt)
      ? report.lastRunAt!
      : this.defaultPeriodStart(report.frequency, periodEnd)

    try {
      const metrics = await this.computeMetrics(form, report, periodStart, periodEnd)
      await this.deliver(form, report, periodStart, periodEnd, metrics)

      const updates: Record<string, any> = {
        lastRunAt: trigger,
        status: ScheduledReportStatusEnum.OK
      }

      // Normally the cron's claim already advanced nextRunAt; recompute only
      // when it is somehow still due, so the report can never hot-loop.
      if (report.nextRunAt <= trigger) {
        updates.nextRunAt = this.computeNextRunAt(
          report.frequency,
          report.dayOfWeek,
          report.dayOfMonth,
          report.timezone,
          trigger
        )
      }

      await this.scheduledReportModel.updateOne(
        {
          _id: report._id
        },
        {
          $set: updates,
          $unset: {
            lastError: 1
          }
        }
      )

      return true
    } catch (error) {
      // lastRunAt deliberately stays behind: a Bull retry (or the next period)
      // then still covers everything since the last successful delivery.
      const updates: Record<string, any> = {
        status: ScheduledReportStatusEnum.FAILED,
        lastError: error instanceof Error ? error.message : String(error)
      }

      if (report.nextRunAt <= trigger) {
        updates.nextRunAt = this.computeNextRunAt(
          report.frequency,
          report.dayOfWeek,
          report.dayOfMonth,
          report.timezone,
          trigger
        )
      }

      await this.scheduledReportModel.updateOne(
        {
          _id: report._id
        },
        {
          $set: updates
        }
      )

      // Rethrow so Bull retries the job with its configured backoff
      throw error
    }
  }

  // ------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------

  private validateSchedule(
    frequency: ScheduledReportFrequencyEnum,
    dayOfWeek: number | undefined,
    dayOfMonth: number | undefined,
    timezone: string
  ): void {
    if (!Object.values(ScheduledReportFrequencyEnum).includes(frequency)) {
      throw new BadRequestException('The report frequency is invalid')
    }

    if (!helper.isString(timezone) || !isValidTimezone(timezone)) {
      throw new BadRequestException('The timezone is invalid')
    }

    if (frequency === ScheduledReportFrequencyEnum.WEEKLY) {
      if (!Number.isInteger(dayOfWeek) || dayOfWeek! < 0 || dayOfWeek! > 6) {
        throw new BadRequestException('Weekly reports need a day of week between 0 and 6')
      }
    } else if (!Number.isInteger(dayOfMonth) || dayOfMonth! < 1 || dayOfMonth! > 28) {
      throw new BadRequestException('Monthly reports need a day of month between 1 and 28')
    }
  }

  private computeNextRunAt(
    frequency: ScheduledReportFrequencyEnum,
    dayOfWeek: number | undefined,
    dayOfMonth: number | undefined,
    timezone: string,
    from: number = timestamp()
  ): number {
    return computeNextRunAt(frequency, dayOfWeek, dayOfMonth, timezone, from)
  }

  private defaultPeriodStart(frequency: ScheduledReportFrequencyEnum, periodEnd: number): number {
    if (frequency === ScheduledReportFrequencyEnum.MONTHLY) {
      return unixDate(periodEnd).subtract(1, 'month').unix()
    }

    return periodEnd - WEEK_SECONDS
  }

  private async computeMetrics(
    form: FormModel,
    report: ScheduledReportModel,
    periodStart: number,
    periodEnd: number
  ): Promise<ScheduledReportMetrics> {
    // Invalid stored timezones (e.g. hand-edited rows) degrade to UTC days
    const timezone = isValidTimezone(report.timezone) ? report.timezone : 'UTC'

    const periodMatch = {
      formId: report.formId,
      status: SubmissionStatusEnum.PUBLIC,
      endAt: {
        $gt: periodStart,
        $lte: periodEnd
      }
    }

    const [summaryRows, dailyRows, visitRows] = await Promise.all([
      this.submissionModel.aggregate<SummaryRow>([
        {
          $match: periodMatch
        },
        {
          $group: {
            _id: null,
            total: {
              $sum: 1
            },
            avgDuration: {
              $avg: {
                $subtract: ['$endAt', '$startAt']
              }
            },
            avgScore: {
              $avg: '$score'
            },
            avgPercentage: {
              $avg: '$scorePercentage'
            },
            highestScore: {
              $max: '$score'
            },
            passedCount: {
              $sum: {
                $cond: [
                  {
                    $eq: ['$passed', true]
                  },
                  1,
                  0
                ]
              }
            }
          }
        }
      ]),
      this.submissionModel.aggregate<DailyCountRow>([
        {
          $match: periodMatch
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: {
                  $toDate: {
                    $multiply: ['$endAt', 1_000]
                  }
                },
                timezone
              }
            },
            count: {
              $sum: 1
            }
          }
        },
        {
          $sort: {
            _id: 1
          }
        }
      ]),
      this.formAnalyticModel.aggregate<VisitRow>([
        {
          $match: {
            formId: report.formId,
            createdAt: {
              $gte: new Date(periodStart * 1_000),
              $lte: new Date(periodEnd * 1_000)
            }
          }
        },
        {
          $group: {
            _id: null,
            totalVisits: {
              $sum: '$totalVisits'
            }
          }
        }
      ])
    ])

    const summary = summaryRows[0]
    const totalResponses = summary?.total ?? 0
    const totalVisits = visitRows[0]?.totalVisits ?? 0

    // Fill the whole period with rows (zeros included), grouped by calendar
    // day in the report's timezone.
    const countByDay = new Map(dailyRows.map(row => [row._id, row.count]))
    const dailyCounts: Array<{ date: string; count: number }> = []

    let cursorDay = zonedDateString(periodStart, timezone)
    const lastDay = zonedDateString(periodEnd, timezone)

    while (dailyCounts.length < MAX_DAILY_ROWS) {
      dailyCounts.push({
        date: cursorDay,
        count: countByDay.get(cursorDay) ?? 0
      })

      if (cursorDay === lastDay) {
        break
      }

      cursorDay = date(cursorDay).add(1, 'day').format('YYYY-MM-DD')
    }

    const isQuiz = form.kind === FormKindEnum.QUIZ

    const quiz =
      isQuiz && totalResponses > 0
        ? {
            averageScore: Math.round((summary?.avgScore ?? 0) * 10) / 10,
            averagePercentage: Math.round(summary?.avgPercentage ?? 0),
            highestScore: summary?.highestScore ?? 0,
            passingRate: Math.round((100 * (summary?.passedCount ?? 0)) / totalResponses),
            responseCount: totalResponses
          }
        : null

    return {
      totalResponses,
      totalVisits,
      completionRate: completionRateOf(totalVisits, totalResponses),
      avgCompletionTimeSeconds: Math.round(summary?.avgDuration ?? 0),
      dailyCounts,
      quiz
    }
  }

  // ------------------------------------------------------------------
  // Email delivery (same template mechanism and queue payload as MailService)
  // ------------------------------------------------------------------

  private loadEmailTemplates(): void {
    try {
      const entries = readdirSync(EMAIL_TEMPLATES_DIR, {
        withFileTypes: true
      })

      this.loadEmailTemplate(DEFAULT_LOCALE, EMAIL_TEMPLATES_DIR)

      for (const entry of entries) {
        if (entry.isDirectory()) {
          this.loadEmailTemplate(entry.name, join(EMAIL_TEMPLATES_DIR, entry.name))
        }
      }
    } catch {
      // A missing template directory must never crash the worker at boot;
      // delivery then reports a clear failure instead.
    }
  }

  private loadEmailTemplate(locale: string, dir: string): void {
    const filePath = join(dir, `${TEMPLATE_NAME}${HTML_EXT}`)

    try {
      const content = readFileSync(filePath).toString('utf8')
      const matches = content.match(TEMPLATE_META_REGEX)
      const html = content.replace(TEMPLATE_META_REGEX, '')

      if (matches) {
        const metaObject: Record<string, string> = {}

        matches[1].split('\n').forEach(line => {
          const [key, value] = line.split(':')

          if (helper.isValid(key) && helper.isValid(value)) {
            metaObject[key.trim()] = value.trim()
          }
        })

        if (helper.isValid(metaObject.title)) {
          this.emailTemplates[locale] = {
            subject: metaObject.title,
            html
          }
        }
      }
    } catch {
      // Locale without this template falls back to the default locale
    }
  }

  private renderEmail(
    locale: string,
    replacements: Record<string, string | number | TrustedHtml>
  ): EmailTemplate | null {
    const template = this.emailTemplates[locale] || this.emailTemplates[DEFAULT_LOCALE]

    if (!template) {
      return null
    }

    let subject = template.subject
    let html = template.html

    for (const [key, value] of Object.entries(replacements)) {
      const placeholder = `{${key}}`
      const trusted = isTrustedHtml(value)
      const rawValue = trusted ? value.html : String(value ?? '')
      const htmlValue = trusted
        ? value.html
        : escapeHtml(key === 'formUrl' ? safeEmailLink(value) : value)

      subject = subject.split(placeholder).join(rawValue.replace(/[\r\n]+/g, ' '))
      html = html.split(placeholder).join(htmlValue)
    }

    return {
      subject,
      html
    }
  }

  private async deliver(
    form: FormModel,
    report: ScheduledReportModel,
    periodStart: number,
    periodEnd: number,
    metrics: ScheduledReportMetrics
  ): Promise<void> {
    if (helper.isEmpty(SMTP_FROM?.trim()) || !SMTP_HOST?.trim() || !Number.isInteger(SMTP_PORT)) {
      throw new Error('SMTP is not configured, scheduled report emails cannot be delivered')
    }

    // Recipients may be anyone; the report author's language picks the locale.
    // A user lookup failure must degrade to the default locale, not abort the
    // report.
    let creatorLang: string | undefined

    try {
      creatorLang = (await this.userService.findById(report.createdBy))?.lang
    } catch {
      creatorLang = undefined
    }

    const locale = creatorLang || DEFAULT_LOCALE
    const frequencyLabel =
      FREQUENCY_LABELS[locale]?.[report.frequency] ??
      FREQUENCY_LABELS[DEFAULT_LOCALE][report.frequency] ??
      report.frequency

    // Matches the webapp's form analytics route:
    // /workspace/:workspaceId/project/:projectId/form/:formId/analytics
    const formUrl = `${APP_HOMEPAGE_URL}/workspace/${form.teamId}/project/${form.projectId}/form/${form.id}/analytics`

    const quizStatsRow = metrics.quiz
      ? `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eeeeee;color:#6b7280;font-size:13px;">Quiz average score</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eeeeee;font-size:13px;font-weight:600;color:#111827;">${metrics.quiz.averageScore} / ${metrics.quiz.highestScore} (${metrics.quiz.averagePercentage}%) · pass rate ${metrics.quiz.passingRate}%</td>
        </tr>`
      : ''

    const dailyRows = metrics.dailyCounts
      .map(
        row => `<tr>
          <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#374151;">${row.date}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#111827;text-align:right;">${row.count}</td>
        </tr>`
      )
      .join('')

    const email = this.renderEmail(locale, {
      formName: form.name,
      frequencyLabel,
      periodStart: zonedDateString(periodStart, report.timezone),
      periodEnd: zonedDateString(periodEnd, report.timezone),
      totalResponses: metrics.totalResponses,
      completionRate: `${metrics.completionRate}%`,
      avgCompletionTime: formatDuration(metrics.avgCompletionTimeSeconds),
      formUrl,
      quizStats: trustedHtml(quizStatsRow),
      dailyRows: trustedHtml(dailyRows)
    })

    if (!email) {
      throw new Error(`The "${TEMPLATE_NAME}" email template is missing`)
    }

    for (const recipient of report.recipients) {
      // One message per recipient, exactly like MailService: the recipient list
      // is never shared across recipients.
      await this.mailQueue.add({
        queueName: 'MailQueue',
        data: {
          from: SMTP_FROM,
          to: recipient,
          subject: email.subject,
          html: email.html
        }
      })
    }
  }
}
