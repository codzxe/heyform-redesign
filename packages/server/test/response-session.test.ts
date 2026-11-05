import { FieldKindEnum } from '@myform/shared-types-enums'
import assert from 'assert'

import { ResponseSessionService, hashResumeToken } from '../src/service/response-session.service'
import { timestamp } from '@myform/utils'

const FORM_ID = 'form_1'
const DAY = 24 * 60 * 60

type StoredSession = Record<string, any>

function answerOf(id: string, value: any) {
  return { id, kind: FieldKindEnum.SHORT_TEXT, value, title: 'Question' }
}

// findOne() is awaited directly in save() but chained with .lean() in resume(),
// so the stand-in has to be awaitable and offer lean() as well.
function queryOf(session: StoredSession | null) {
  const promise = Promise.resolve(session)

  return {
    lean: () => promise,
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise)
  }
}

// Stand-in for the Mongoose model behind ResponseSessionService. It replays the
// few query shapes the service issues (equality matches plus the $lt/$exists
// operators of the purge) over the in-memory sessions.
function createFakeModel(sessions: StoredSession[]) {
  const matches = (session: StoredSession, where: Record<string, any>): boolean =>
    Object.entries(where).every(([key, condition]) => {
      if (condition !== null && typeof condition === 'object') {
        const value = session[key]

        if (condition.$exists === true && value === undefined) {
          return false
        }
        if (
          Number.isFinite(condition.$lt) &&
          !(typeof value === 'number' && value < condition.$lt)
        ) {
          return false
        }
        return true
      }

      return session[key] === condition
    })

  return {
    findOne: (where: Record<string, any>) =>
      queryOf(sessions.find(session => matches(session, where)) ?? null),
    updateOne: async (where: Record<string, any>, updates: Record<string, any>) => {
      const session = sessions.find(row => matches(row, where))

      if (session) {
        Object.assign(session, updates)
      }

      return { acknowledged: true, modifiedCount: session ? 1 : 0 }
    },
    create: async (data: StoredSession) => {
      const session = { _id: `session_${sessions.length + 1}`, ...data }
      sessions.push(session)
      return session
    },
    deleteMany: async (where: Record<string, any>) => {
      const before = sessions.length

      for (let i = sessions.length - 1; i >= 0; i--) {
        if (matches(sessions[i], where)) {
          sessions.splice(i, 1)
        }
      }

      return { acknowledged: true, deletedCount: before - sessions.length }
    }
  }
}

async function testSaveCreatesSessionAndReturnsToken() {
  const sessions: StoredSession[] = []
  const service = new ResponseSessionService(createFakeModel(sessions) as any)
  const before = timestamp()
  const answers = [answerOf('name', 'Ada')]

  const saved = await service.save({
    formId: FORM_ID,
    anonymousId: 'anonymous_1',
    answers,
    hiddenFields: [{ id: 'utm_source', name: 'utm_source', value: 'share' }],
    variables: [{ id: 'score', name: 'Score', kind: 'number' as const, value: 3, logics: [] }],
    currentFieldId: 'email'
  })

  // A new token is issued and only its hash is stored
  assert.ok(typeof saved.token === 'string' && saved.token.length >= 20)
  assert.strictEqual(sessions.length, 1)
  assert.strictEqual(sessions[0].tokenHash, hashResumeToken(saved.token))
  assert.strictEqual(sessions[0].token, undefined)
  assert.strictEqual(sessions[0].formId, FORM_ID)
  assert.strictEqual(sessions[0].anonymousId, 'anonymous_1')
  assert.deepStrictEqual(sessions[0].answers, answers)
  assert.strictEqual(sessions[0].currentFieldId, 'email')

  // The default expiry is 30 days out (with a little slack for the clock)
  assert.ok(saved.expiresAt > before)
  assert.ok(saved.expiresAt - before >= 30 * DAY)
  assert.ok(saved.expiresAt - before <= 30 * DAY + 5)
  assert.strictEqual(sessions[0].expiresAt, saved.expiresAt)
}

async function testSaveWithSameTokenUpdatesExistingSession() {
  const sessions: StoredSession[] = []
  const service = new ResponseSessionService(createFakeModel(sessions) as any)

  const first = await service.save({
    formId: FORM_ID,
    answers: [answerOf('name', 'Ada')],
    hiddenFields: [],
    variables: []
  })

  const updatedAnswers = [answerOf('name', 'Ada Lovelace'), answerOf('email', 'ada@example.com')]

  const second = await service.save({
    formId: FORM_ID,
    anonymousId: 'anonymous_1',
    sessionToken: first.token,
    answers: updatedAnswers,
    hiddenFields: [],
    variables: [],
    currentFieldId: 'email',
    startAt: timestamp() - 60
  })

  // The same token is kept and the existing record updated, not duplicated
  assert.strictEqual(second.token, first.token)
  assert.strictEqual(sessions.length, 1)
  assert.deepStrictEqual(sessions[0].answers, updatedAnswers)
  assert.strictEqual(sessions[0].currentFieldId, 'email')
  assert.strictEqual(sessions[0].anonymousId, 'anonymous_1')
  assert.ok(second.expiresAt >= first.expiresAt)
}

async function testSaveHonorsConfiguredExpiration() {
  const sessions: StoredSession[] = []
  const service = new ResponseSessionService(createFakeModel(sessions) as any)

  const day = await service.save({
    formId: FORM_ID,
    answers: [],
    hiddenFields: [],
    variables: [],
    expirationDays: 1
  })

  assert.ok(day.expiresAt - timestamp() > DAY - 10)
  assert.ok(day.expiresAt - timestamp() <= DAY)

  // Values beyond the maximum are clamped to a year
  const clamped = await service.save({
    formId: FORM_ID,
    answers: [],
    hiddenFields: [],
    variables: [],
    expirationDays: 500
  })

  assert.ok(clamped.expiresAt - timestamp() > 365 * DAY - 10)
  assert.ok(clamped.expiresAt - timestamp() <= 365 * DAY)
}

async function testResumeReturnsNullWhenNoUsableSession() {
  const sessions: StoredSession[] = []
  const service = new ResponseSessionService(createFakeModel(sessions) as any)

  // Unknown token
  assert.strictEqual(await service.resume(FORM_ID, 'missing-token'), null)
  // Blank token
  assert.strictEqual(await service.resume(FORM_ID, ''), null)

  // Expired session
  const expired = await service.save({
    formId: FORM_ID,
    answers: [answerOf('name', 'Ada')],
    hiddenFields: [],
    variables: []
  })
  sessions[0].expiresAt = timestamp() - 1
  assert.strictEqual(await service.resume(FORM_ID, expired.token), null)

  // Completed session
  const completed = await service.save({
    formId: FORM_ID,
    answers: [answerOf('name', 'Grace')],
    hiddenFields: [],
    variables: []
  })
  await service.complete(FORM_ID, completed.token)
  assert.strictEqual(await service.resume(FORM_ID, completed.token), null)
}

async function testResumeRestoresSavedState() {
  const sessions: StoredSession[] = []
  const service = new ResponseSessionService(createFakeModel(sessions) as any)

  const answers = [answerOf('name', 'Ada')]
  const hiddenFields = [{ id: 'utm_source', name: 'utm_source', value: 'share' }]
  const variables = [{ id: 'score', name: 'Score', kind: 'number' as const, value: 3, logics: [] }]

  const saved = await service.save({
    formId: FORM_ID,
    anonymousId: 'anonymous_1',
    answers,
    hiddenFields,
    variables,
    currentFieldId: 'email'
  })

  const session = await service.resume(FORM_ID, saved.token)

  assert.ok(session)
  assert.deepStrictEqual(session!.answers, answers)
  assert.deepStrictEqual(session!.hiddenFields, hiddenFields)
  assert.deepStrictEqual(session!.variables, variables)
  assert.strictEqual(session!.currentFieldId, 'email')
  assert.strictEqual(session!.expiresAt, saved.expiresAt)
}

async function testCompleteMarksSessionCompleted() {
  const sessions: StoredSession[] = []
  const service = new ResponseSessionService(createFakeModel(sessions) as any)

  const saved = await service.save({
    formId: FORM_ID,
    answers: [answerOf('name', 'Ada')],
    hiddenFields: [],
    variables: []
  })

  await service.complete(FORM_ID, saved.token)

  const completedAt = sessions[0].completedAt
  assert.ok(Number.isFinite(completedAt))

  // A completed session is never resumed, and saving again with its token
  // starts a fresh session instead
  assert.strictEqual(await service.resume(FORM_ID, saved.token), null)

  const reopened = await service.save({
    formId: FORM_ID,
    sessionToken: saved.token,
    answers: [answerOf('name', 'New session')],
    hiddenFields: [],
    variables: []
  })

  assert.strictEqual(sessions.length, 2)
  assert.notStrictEqual(reopened.token, saved.token)
  assert.strictEqual(sessions[0].completedAt, completedAt)

  // Completing without a token is a no-op
  await service.complete(FORM_ID, undefined)
}

async function testPurgeCompletedDeletesOnlyOldCompletedSessions() {
  const now = timestamp()
  const sessions: StoredSession[] = [
    // Completed 25 hours ago, past the one-day retention
    {
      _id: 'old_done',
      formId: FORM_ID,
      tokenHash: 'old',
      answers: [],
      expiresAt: now + DAY,
      completedAt: now - 25 * 60 * 60
    },
    // Completed a minute ago, still inside the retention window
    {
      _id: 'recent_done',
      formId: FORM_ID,
      tokenHash: 'recent',
      answers: [],
      expiresAt: now + DAY,
      completedAt: now - 60
    },
    // Never completed
    { _id: 'open', formId: FORM_ID, tokenHash: 'open', answers: [], expiresAt: now + DAY }
  ]
  const service = new ResponseSessionService(createFakeModel(sessions) as any)

  const deletedCount = await service.purgeCompleted()

  assert.strictEqual(deletedCount, 1)
  assert.deepStrictEqual(
    sessions.map(session => session._id),
    ['recent_done', 'open']
  )
}

async function run() {
  await testSaveCreatesSessionAndReturnsToken()
  await testSaveWithSameTokenUpdatesExistingSession()
  await testSaveHonorsConfiguredExpiration()
  await testResumeReturnsNullWhenNoUsableSession()
  await testResumeRestoresSavedState()
  await testCompleteMarksSessionCompleted()
  await testPurgeCompletedDeletesOnlyOldCompletedSessions()
}

run().catch(error => {
  console.error(error)
  process.exitCode = 1
})
