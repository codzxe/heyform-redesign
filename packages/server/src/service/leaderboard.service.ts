import { Answer, FieldKindEnum, FormSettings } from '@myform/shared-types-enums'
import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'

import { LeaderboardEntryType } from '../common/graphql/leaderboard.graphql'
import { SubmissionModel } from '@model'
import { helper } from '@myform/utils'

// Scored submissions fetched and ranked per request. The window rides the
// formId+score index and stays small; ranks and ties are computed in code.
const RANKING_WINDOW_SIZE = 500

// Leaderboard length is a server-side display rule, never client-controlled
export const DEFAULT_LEADERBOARD_LIMIT = 10
export const MIN_LEADERBOARD_LIMIT = 1
export const MAX_LEADERBOARD_LIMIT = 50

// Longest respondent label shown on a leaderboard, matching notification names
const MAX_DISPLAY_NAME_LENGTH = 60

export interface LeaderboardFormLike {
  id: string
  settings?: FormSettings
}

export interface LeaderboardOptions {
  // Force anonymized names regardless of the form settings
  anonymousNames?: boolean
}

// Shape of a scored, completed submission read through .lean()
interface LeaderboardSubmission {
  _id: any
  answers?: Answer[]
  score?: number
  totalScore?: number
  scorePercentage?: number
  endAt?: number
}

/**
 * Leaderboard size rule: 10 rows by default, never below 1, never above 50.
 * Every caller's limit is clamped here, so an untrusted value can neither
 * empty the board nor dump the whole form.
 */
export function clampLeaderboardLimit(limit: number | undefined | null): number {
  if (typeof limit !== 'number' || Number.isNaN(limit)) {
    return DEFAULT_LEADERBOARD_LIMIT
  }

  return Math.floor(Math.min(MAX_LEADERBOARD_LIMIT, Math.max(MIN_LEADERBOARD_LIMIT, limit)))
}

// Control characters (CR/LF included) become spaces and whitespace collapses,
// so a leaderboard label is always a short single-line string
function cleanDisplayName(value: string): string {
  const printable = Array.from(value, char => {
    const code = char.charCodeAt(0)
    return code < 32 || code === 127 ? ' ' : char
  }).join('')

  const collapsed = printable.replace(/\s+/g, ' ').trim()

  return Array.from(collapsed).slice(0, MAX_DISPLAY_NAME_LENGTH).join('').trim()
}

function fullNameAnswer(answers?: Answer[]): string | undefined {
  for (const answer of answers ?? []) {
    if (answer?.kind !== FieldKindEnum.FULL_NAME) {
      continue
    }

    const value: any = answer.value
    const first = helper.isString(value?.firstName) ? value.firstName : ''
    const last = helper.isString(value?.lastName) ? value.lastName : ''
    const name = cleanDisplayName(`${first} ${last}`)

    if (helper.isValid(name)) {
      return name
    }
  }
}

function emailAnswer(answers?: Answer[]): string | undefined {
  for (const answer of answers ?? []) {
    if (answer?.kind !== FieldKindEnum.EMAIL || !helper.isString(answer.value)) {
      continue
    }

    const email = cleanDisplayName(answer.value)

    if (helper.isValid(email)) {
      return email
    }
  }
}

function anonymousName(id: unknown): string {
  const shortId = helper.isValid(id) ? String(id).slice(-4) : '0000'
  return `Anonymous ${shortId}`
}

function displayNameOf(submission: LeaderboardSubmission, anonymous: boolean): string {
  if (anonymous) {
    return anonymousName(submission._id)
  }

  return (
    fullNameAnswer(submission.answers) ??
    emailAnswer(submission.answers) ??
    anonymousName(submission._id)
  )
}

function toFinite(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

// Stored percentage wins; older or partial rows fall back to the server-side
// computation from score and totalScore (guarded against a zero total)
function percentageOf(submission: LeaderboardSubmission): number {
  if (Number.isFinite(submission.scorePercentage)) {
    return submission.scorePercentage as number
  }

  const score = toFinite(submission.score, 0)
  const totalScore = toFinite(submission.totalScore, 0)

  return totalScore > 0 ? Math.round((score / totalScore) * 10000) / 100 : 0
}

/**
 * Standard competition ranking (1, 2, 2, 4) over the score-sorted window:
 * an entry tied with the previous score shares its rank, and the next lower
 * score skips forward by the number of tied places.
 */
function competitionRanks(submissions: LeaderboardSubmission[]): number[] {
  const ranks: number[] = []
  let previousScore: number | null = null
  let previousRank = 0

  for (let index = 0; index < submissions.length; index += 1) {
    const score = toFinite(submissions[index].score, 0)
    const rank = previousScore !== null && previousScore === score ? previousRank : index + 1

    ranks.push(rank)
    previousScore = score
    previousRank = rank
  }

  return ranks
}

/**
 * Quiz leaderboards computed from stored submissions only: the score, the
 * completion time and the answers a respondent actually gave. Nothing is
 * taken from the client.
 */
@Injectable()
export class LeaderboardService {
  constructor(
    @InjectModel(SubmissionModel.name)
    private readonly submissionModel: Model<SubmissionModel>
  ) {}

  /**
   * Top respondents of a form. The form setting `anonymousLeaderboard` always
   * anonymizes names; `options.anonymousNames` can force it on top. Entries
   * carry display fields only, never answer content.
   */
  async top(
    form: LeaderboardFormLike,
    limit = DEFAULT_LEADERBOARD_LIMIT,
    options?: LeaderboardOptions
  ): Promise<LeaderboardEntryType[]> {
    const size = clampLeaderboardLimit(limit)
    const submissions = await this.fetchRankingWindow(form.id)
    const anonymous =
      form.settings?.anonymousLeaderboard === true || options?.anonymousNames === true

    if (submissions.length < 1) {
      return []
    }

    const ranks = competitionRanks(submissions)

    return submissions.slice(0, size).map((submission, index) => ({
      rank: ranks[index],
      displayName: displayNameOf(submission, anonymous),
      score: toFinite(submission.score, 0),
      percentage: percentageOf(submission),
      completedAt: toFinite(submission.endAt, 0)
    }))
  }

  /**
   * Competition rank (1-based) of a single submission within the same window,
   * or null when the submission is unscored, deleted or outside the top window.
   */
  async rank(form: LeaderboardFormLike, submissionId: string): Promise<number | null> {
    if (helper.isEmpty(submissionId)) {
      return null
    }

    const submissions = await this.fetchRankingWindow(form.id)
    const index = submissions.findIndex(submission => String(submission._id ?? '') === submissionId)

    return index < 0 ? null : competitionRanks(submissions)[index]
  }

  // Completed, server-scored submissions, best score first; earlier
  // completions first among ties. Ranks and tie handling happen in code.
  private async fetchRankingWindow(formId: string): Promise<LeaderboardSubmission[]> {
    return this.submissionModel
      .find({
        formId,
        score: { $exists: true, $ne: null },
        endAt: { $gt: 0 }
      })
      .sort({ score: -1, endAt: 1 })
      .limit(RANKING_WINDOW_SIZE)
      .lean()
  }
}
