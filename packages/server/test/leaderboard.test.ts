import { FieldKindEnum } from '@myform/shared-types-enums'
import * as assert from 'assert'

import { LeaderboardEntryType } from '../src/common/graphql/leaderboard.graphql'
import { PublicLeaderboardResolver } from '../src/resolver/endpoint/public-leaderboard.resolver'
import { FormLeaderboardResolver } from '../src/resolver/form/leaderboard.resolver'
import { LeaderboardService, clampLeaderboardLimit } from '../src/service/leaderboard.service'
import { assertOpenToken } from '../src/utils/endpoint'

type StoredSubmission = Record<string, any>

function submissionOf(partial: StoredSubmission): StoredSubmission {
  return {
    formId: 'form_1',
    answers: [],
    endAt: 1,
    ...partial
  }
}

// Stand-in for the Mongoose model: find() replays what the leaderboard query
// asks for — one form, only scored and completed submissions — and the
// chainable sort/limit/lean mimics the real query helpers.
function createFakeModel(submissions: StoredSubmission[]) {
  return {
    find: (conditions: Record<string, any>) => {
      const rows = submissions.filter(
        row =>
          row.formId === conditions.formId &&
          row.score !== undefined &&
          row.score !== null &&
          typeof row.endAt === 'number' &&
          row.endAt > 0
      )

      let sorted = rows
      let taken = rows.length

      const query = {
        sort: (spec: Record<string, number>) => {
          if (spec.score === -1) {
            // score descending, then earlier completion first
            sorted = [...rows].sort((a, b) => b.score - a.score || a.endAt - b.endAt)
          }
          return query
        },
        limit: (count: number) => {
          taken = count
          return query
        },
        lean: async () => sorted.slice(0, taken)
      }

      return query
    }
  }
}

function createService(submissions: StoredSubmission[]): LeaderboardService {
  return new LeaderboardService(createFakeModel(submissions) as any)
}

async function testCompetitionRankingOnTies() {
  const submissions = [
    submissionOf({ _id: 'aaaa0001', score: 10, totalScore: 10, scorePercentage: 100, endAt: 100 }),
    submissionOf({ _id: 'aaaa0002', score: 9, totalScore: 10, scorePercentage: 90, endAt: 102 }),
    submissionOf({ _id: 'aaaa0003', score: 9, totalScore: 10, scorePercentage: 90, endAt: 101 }),
    submissionOf({ _id: 'aaaa0004', score: 8, totalScore: 10, scorePercentage: 80, endAt: 103 })
  ]
  const service = createService(submissions)

  const entries = await service.top({ id: 'form_1' } as any, 10)

  // Standard competition ranking 1-2-2-4: the tie shares rank 2, rank 3 is skipped
  assert.deepStrictEqual(
    entries.map(entry => entry.rank),
    [1, 2, 2, 4]
  )
  // Best score first; among ties the earlier completion comes first
  assert.deepStrictEqual(
    entries.map(entry => entry.score),
    [10, 9, 9, 8]
  )
  assert.deepStrictEqual(
    entries.map(entry => entry.completedAt),
    [100, 101, 102, 103]
  )
  assert.deepStrictEqual(
    entries.map(entry => entry.percentage),
    [100, 90, 90, 80]
  )
}

async function testDisplayNameDerivation() {
  const submissions = [
    submissionOf({
      _id: 'bbbb0001',
      score: 9,
      answers: [
        { kind: FieldKindEnum.FULL_NAME, value: { firstName: '  Ada', lastName: 'Lovelace\n' } },
        { kind: FieldKindEnum.EMAIL, value: 'ada@example.com' }
      ]
    }),
    submissionOf({
      _id: 'bbbb0002',
      score: 8,
      answers: [{ kind: FieldKindEnum.EMAIL, value: 'grace@example.com' }]
    }),
    submissionOf({
      _id: 'bbbb0003',
      score: 7,
      answers: [{ kind: FieldKindEnum.SHORT_TEXT, value: 'not a leaderboard name' }]
    })
  ]
  const service = createService(submissions)

  const entries = await service.top({ id: 'form_1' } as any)

  // Full name beats email, whitespace collapses, anonymous is the last resort
  assert.strictEqual(entries[0].displayName, 'Ada Lovelace')
  assert.strictEqual(entries[1].displayName, 'grace@example.com')
  assert.strictEqual(entries[2].displayName, 'Anonymous 0003')
}

async function testAnonymousLeaderboardSetting() {
  const submissions = [
    submissionOf({
      _id: 'cccc0001',
      score: 9,
      answers: [
        { kind: FieldKindEnum.FULL_NAME, value: { firstName: 'Ada', lastName: 'Lovelace' } }
      ]
    }),
    submissionOf({
      _id: 'cccc0002',
      score: 8,
      answers: [{ kind: FieldKindEnum.EMAIL, value: 'ada@example.com' }]
    })
  ]
  const service = createService(submissions)

  // The form setting always anonymizes, even when a name or email was given
  const anonymous = await service.top({
    id: 'form_1',
    settings: { anonymousLeaderboard: true }
  } as any)
  assert.deepStrictEqual(
    anonymous.map(entry => entry.displayName),
    ['Anonymous 0001', 'Anonymous 0002']
  )

  // The caller can force anonymization on top of the form settings
  const forced = await service.top({ id: 'form_1' } as any, 10, { anonymousNames: true })
  assert.deepStrictEqual(
    forced.map(entry => entry.displayName),
    ['Anonymous 0001', 'Anonymous 0002']
  )
}

async function testPercentageFallback() {
  const submissions = [
    // No stored percentage: computed from score/totalScore
    submissionOf({ _id: 'dddd0001', score: 3, totalScore: 4, endAt: 1 }),
    // Zero total score: guarded, never divided by
    submissionOf({ _id: 'dddd0002', score: 2, totalScore: 0, endAt: 2 }),
    // Stored percentage wins over the computed one (1/8 would be 12.5)
    submissionOf({ _id: 'dddd0003', score: 1, totalScore: 8, scorePercentage: 50, endAt: 3 })
  ]
  const service = createService(submissions)

  const entries = await service.top({ id: 'form_1' } as any)

  assert.deepStrictEqual(
    entries.map(entry => entry.percentage),
    [75, 0, 50]
  )
}

async function testRankLookup() {
  const submissions = [
    submissionOf({ _id: 'eeee0001', score: 10, endAt: 100 }),
    submissionOf({ _id: 'eeee0002', score: 9, endAt: 102 }),
    submissionOf({ _id: 'eeee0003', score: 9, endAt: 101 }),
    submissionOf({ _id: 'eeee0004', score: 8, endAt: 103 }),
    // Stored, but never scored: not part of the leaderboard
    submissionOf({ _id: 'eeee0005', endAt: 104 })
  ]
  const service = createService(submissions)
  const form = { id: 'form_1' } as any

  assert.strictEqual(await service.rank(form, 'eeee0001'), 1)
  // Both tied entries share rank 2, the next score skips to 4
  assert.strictEqual(await service.rank(form, 'eeee0003'), 2)
  assert.strictEqual(await service.rank(form, 'eeee0002'), 2)
  assert.strictEqual(await service.rank(form, 'eeee0004'), 4)
  assert.strictEqual(await service.rank(form, 'eeee0005'), null)
  assert.strictEqual(await service.rank(form, 'missing9999'), null)
  assert.strictEqual(await service.rank(form, ''), null)
}

async function testLimitClampingAndFormIsolation() {
  const submissions = [
    ...Array.from({ length: 80 }, (_, index) =>
      submissionOf({
        _id: `ffff${String(index).padStart(4, '0')}`,
        score: 100 - index,
        endAt: index + 1
      })
    ),
    // Another form's rows must never leak into this form's board
    submissionOf({
      formId: 'form_2',
      _id: 'other0001',
      score: 999,
      endAt: 1,
      answers: [{ kind: FieldKindEnum.EMAIL, value: 'other@example.com' }]
    })
  ]
  const service = createService(submissions)

  // 10 by default, 50 at most, never less than 1
  assert.strictEqual((await service.top({ id: 'form_1' } as any)).length, 10)
  assert.strictEqual((await service.top({ id: 'form_1' } as any, 200)).length, 50)
  assert.strictEqual((await service.top({ id: 'form_1' } as any, 0)).length, 1)

  const entries = await service.top({ id: 'form_1' } as any, 50)
  assert.ok(entries.every(entry => entry.score <= 100))
  assert.ok(entries.every(entry => entry.displayName.startsWith('Anonymous')))

  assert.strictEqual(clampLeaderboardLimit(undefined), 10)
  assert.strictEqual(clampLeaderboardLimit(3.9), 3)
  assert.strictEqual(clampLeaderboardLimit(-5), 1)
  assert.strictEqual(clampLeaderboardLimit(1000), 50)
}

const SHOWCASE_FORM = {
  id: 'form_1',
  suspended: false,
  settings: { active: true, showLeaderboard: true }
}

function createPublicResolver(
  form: any,
  entries: LeaderboardEntryType[],
  token: Record<string, any> = {}
) {
  const calls: Array<{ formId: string; limit: number }> = []
  const defaults = { formId: 'form_1', timestamp: Math.floor(Date.now() / 1000) }

  const resolver = new PublicLeaderboardResolver(
    {
      decryptToken: () => ({ ...defaults, ...token }),
      // The real check, so the token validation path is the production one
      assertOpenToken
    } as any,
    { findById: async () => form } as any,
    {
      top: async (target: any, limit: number) => {
        calls.push({ formId: target.id, limit })
        return entries
      }
    } as any
  )

  return { resolver, calls }
}

async function testPublicLeaderboardRequiresTheSetting() {
  const forms = [
    undefined,
    { ...SHOWCASE_FORM, suspended: true },
    { ...SHOWCASE_FORM, settings: { active: false, showLeaderboard: true } },
    { ...SHOWCASE_FORM, settings: { active: true, showLeaderboard: false } }
  ]

  for (const form of forms) {
    const { resolver, calls } = createPublicResolver(form, [])

    // One message for every reason: the board is simply not available
    await assert.rejects(
      () => resolver.publicLeaderboard('form_1', 'open-token', 10),
      /Leaderboard is not available/
    )
    assert.deepStrictEqual(calls, [])
  }
}

async function testPublicLeaderboardValidatesTheOpenToken() {
  const now = Math.floor(Date.now() / 1000)

  // A token issued for another form is rejected
  const foreign = createPublicResolver(SHOWCASE_FORM, [], { formId: 'form_2' })
  await assert.rejects(
    () => foreign.resolver.publicLeaderboard('form_1', 'open-token', 10),
    /Invalid form token/
  )
  assert.deepStrictEqual(foreign.calls, [])

  // A token older than the open-token lifetime (24h) is rejected
  const stale = createPublicResolver(SHOWCASE_FORM, [], { timestamp: now - 25 * 60 * 60 })
  await assert.rejects(
    () => stale.resolver.publicLeaderboard('form_1', 'open-token', 10),
    /Invalid form token/
  )
  assert.deepStrictEqual(stale.calls, [])

  // An undecryptable token is surfaced, not swallowed
  const broken = new PublicLeaderboardResolver(
    {
      decryptToken: () => {
        throw new Error('Invalid form token')
      },
      assertOpenToken
    } as any,
    { findById: async () => SHOWCASE_FORM } as any,
    { top: async () => [] } as any
  )
  await assert.rejects(
    () => broken.publicLeaderboard('form_1', 'open-token', 10),
    /Invalid form token/
  )
}

async function testPublicLeaderboardHappyPath() {
  const entries: LeaderboardEntryType[] = [
    { rank: 1, displayName: 'Ada Lovelace', score: 9, percentage: 90, completedAt: 100 }
  ]
  const { resolver, calls } = createPublicResolver(SHOWCASE_FORM, entries)

  const result = await resolver.publicLeaderboard('form_1', 'open-token', 25)
  assert.deepStrictEqual(result, entries)
  assert.deepStrictEqual(calls, [{ formId: 'form_1', limit: 25 }])

  // The size is clamped server-side, never taken as-is
  await resolver.publicLeaderboard('form_1', 'open-token', 500)
  assert.strictEqual(calls[calls.length - 1].limit, 50)

  await resolver.publicLeaderboard('form_1', 'open-token', undefined)
  assert.strictEqual(calls[calls.length - 1].limit, 10)

  // Entries expose display fields only — no answer content rides along
  assert.deepStrictEqual(Object.keys(result[0]).sort(), [
    'completedAt',
    'displayName',
    'percentage',
    'rank',
    'score'
  ])
}

async function testFormLeaderboardDelegatesWithTheGuardedForm() {
  const calls: Array<{ formId: string; limit: number; settings: any }> = []
  const resolver = new FormLeaderboardResolver({
    top: async (form: any, limit: number) => {
      calls.push({ formId: form.id, limit, settings: form.settings })
      return []
    }
  } as any)

  // The form (and its settings) the guard resolved for the caller
  const form = { id: 'form_1', settings: { anonymousLeaderboard: true } }
  const entries = await resolver.formLeaderboard(form as any, { formId: 'form_1', limit: 500 })

  assert.deepStrictEqual(entries, [])
  assert.deepStrictEqual(calls, [
    { formId: 'form_1', limit: 50, settings: { anonymousLeaderboard: true } }
  ])

  await resolver.formLeaderboard(form as any, { formId: 'form_1' })
  assert.strictEqual(calls[calls.length - 1].limit, 10)
}

async function run() {
  await testCompetitionRankingOnTies()
  await testDisplayNameDerivation()
  await testAnonymousLeaderboardSetting()
  await testPercentageFallback()
  await testRankLookup()
  await testLimitClampingAndFormIsolation()
  await testPublicLeaderboardRequiresTheSetting()
  await testPublicLeaderboardValidatesTheOpenToken()
  await testPublicLeaderboardHappyPath()
  await testFormLeaderboardDelegatesWithTheGuardedForm()
}

if (require.main === module) {
  run().catch(error => {
    // eslint-disable-next-line no-console
    console.error(error)
    process.exitCode = 1
  })
}
