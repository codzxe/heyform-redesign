import { FieldKindEnum } from '@myform/shared-types-enums'
import assert from 'assert'

import { FormAnalyticRangeEnum, formAnalyticGenerationKey } from '../src/model/form-analytic.model'
import { DashboardShareService } from '../src/service/dashboard-share.service'

const FORM_ID = 'form_1'
const NOW = Math.floor(Date.now() / 1_000)
// Far enough back to sit before the public range's start (about a month ago)
const OUT_OF_RANGE = NOW - 45 * 24 * 60 * 60

const FORM: Record<string, any> = {
  id: FORM_ID,
  teamId: 'team_1',
  name: 'Workshop feedback',
  fields: [
    {
      id: 'role',
      title: 'Your role',
      kind: FieldKindEnum.MULTIPLE_CHOICE,
      properties: {
        allowOther: true,
        choices: [
          { id: 'dev', label: 'Developer' },
          { id: 'des', label: 'Designer' }
        ]
      }
    },
    {
      // Rich-text title, the way the builder stores them
      id: 'rating',
      title: ['How did it ', ['b', ['go?']]],
      kind: FieldKindEnum.RATING,
      properties: { total: 5 }
    },
    { id: 'name', title: 'Anything else?', kind: FieldKindEnum.LONG_TEXT },
    { id: 'skipped', title: 'Never answered', kind: FieldKindEnum.SHORT_TEXT },
    {
      id: 'group',
      title: 'The group',
      kind: FieldKindEnum.GROUP,
      properties: {
        fields: [
          {
            id: 'inside',
            title: 'Inside question',
            kind: FieldKindEnum.YES_NO,
            properties: {
              choices: [
                { id: 'yes', label: 'Yes' },
                { id: 'no', label: 'No' }
              ]
            }
          }
        ]
      }
    },
    { id: 'end', title: 'Thanks', kind: FieldKindEnum.THANK_YOU }
  ]
}

const OVERVIEW: Record<string, any> = {
  totalVisits: 21,
  totalResponses: 3,
  completionRate: 75,
  abandonmentRate: 25,
  avgCompletionTimeSeconds: 90,
  responseTrend: [{ date: '2025-11-01', count: 3 }],
  deviceBreakdown: [{ label: 'Desktop', count: 2 }],
  browserBreakdown: [{ label: 'Chrome', count: 2 }],
  mediaCounts: { voice: 0, video: 0, screen: 0 },
  quiz: null
}

const HEATMAP_ROWS: Array<Record<string, any>> = [
  {
    fieldId: 'role',
    visits: 5,
    avgTimeMs: 1250,
    answerChanges: 2,
    validationErrors: 0,
    abandonments: 1
  },
  {
    fieldId: 'inside',
    visits: 3,
    avgTimeMs: 0,
    answerChanges: 0,
    validationErrors: 1,
    abandonments: 0
  },
  {
    fieldId: 'ghost',
    visits: 1,
    avgTimeMs: 0,
    answerChanges: 0,
    validationErrors: 0,
    abandonments: 0
  }
]

function answerOf(id: string, kind: FieldKindEnum, value: unknown) {
  return { id, kind, value }
}

function submissionOf(answers: any[], endAt?: number) {
  return { formId: FORM_ID, endAt, answers }
}

const SUBMISSIONS: Array<Record<string, any>> = [
  submissionOf(
    [
      answerOf('role', FieldKindEnum.MULTIPLE_CHOICE, { value: ['dev'] }),
      answerOf('rating', FieldKindEnum.RATING, 4),
      answerOf('name', FieldKindEnum.LONG_TEXT, 'Loved every minute'),
      // Stored empty, as a skipped optional question is
      answerOf('skipped', FieldKindEnum.SHORT_TEXT, ''),
      answerOf('inside', FieldKindEnum.YES_NO, 'yes'),
      answerOf('end', FieldKindEnum.THANK_YOU, '')
    ],
    NOW
  ),
  submissionOf(
    [
      answerOf('role', FieldKindEnum.MULTIPLE_CHOICE, {
        value: ['dev'],
        other: 'Freelance developer'
      }),
      answerOf('rating', FieldKindEnum.RATING, '5'),
      answerOf('inside', FieldKindEnum.YES_NO, 'no')
    ],
    NOW
  ),
  submissionOf(
    [
      // A blank "Other" still counts as an answer, as in the report
      answerOf('role', FieldKindEnum.MULTIPLE_CHOICE, { value: [], other: '' }),
      answerOf('rating', FieldKindEnum.RATING, 4)
    ],
    NOW
  ),
  // Completed before the public range: not part of the payload
  submissionOf([answerOf('role', FieldKindEnum.MULTIPLE_CHOICE, { value: ['des'] })], OUT_OF_RANGE),
  // Never completed: not part of the payload
  submissionOf([answerOf('role', FieldKindEnum.MULTIPLE_CHOICE, { value: ['des'] })]),
  // Another form's responses never leak in
  {
    formId: 'form_2',
    endAt: NOW,
    answers: [answerOf('role', FieldKindEnum.MULTIPLE_CHOICE, { value: ['des'] })]
  }
]

// ---------------------------------------------------------------------------
// Stand-in for the Mongoose model: `aggregate` interprets the question
// pipeline's stages ($match, $unwind, $group, $count, $facet) over the
// in-memory submissions, so the tests exercise the pipeline's real semantics —
// which answers count, which submissions are in range, how the buckets form.
// ---------------------------------------------------------------------------

function getPath(doc: any, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => {
    if (value === null || value === undefined) {
      return undefined
    }
    return (value as Record<string, any>)[key]
  }, doc)
}

function setPath(target: any, path: string, value: unknown): void {
  const keys = path.split('.')
  let cursor = target

  for (const key of keys.slice(0, -1)) {
    cursor = cursor[key]
  }

  cursor[keys[keys.length - 1]] = value
}

// Mongo query semantics for the operators the pipeline uses; a missing field
// compares as null, like MongoDB's equality does.
function matchesOperators(
  value: unknown,
  operators: Record<string, any>,
  missing: boolean
): boolean {
  for (const [operator, expected] of Object.entries(operators)) {
    switch (operator) {
      case '$ne':
        if ((missing ? null : value) === expected) {
          return false
        }
        break
      case '$nin':
        if (expected.includes(missing ? null : value)) {
          return false
        }
        break
      case '$in':
        if (!expected.includes(value)) {
          return false
        }
        break
      case '$gte':
        if (!(typeof value === 'number' && value >= expected)) {
          return false
        }
        break
      case '$exists':
        if (expected !== !missing) {
          return false
        }
        break
      default:
        throw new Error(`Unsupported match operator in test double: ${operator}`)
    }
  }

  return true
}

function matchesCondition(doc: any, condition: Record<string, any>): boolean {
  for (const [key, constraint] of Object.entries(condition)) {
    if (key === '$or') {
      if (!constraint.some((sub: any) => matchesCondition(doc, sub))) {
        return false
      }
      continue
    }

    if (key.startsWith('$')) {
      throw new Error(`Unsupported match key in test double: ${key}`)
    }

    const value = getPath(doc, key)
    const missing = value === undefined

    if (constraint !== null && typeof constraint === 'object' && !Array.isArray(constraint)) {
      if (!matchesOperators(value, constraint, missing)) {
        return false
      }
    } else if (value !== constraint) {
      return false
    }
  }

  return true
}

function unwindStage(docs: any[], path: string): any[] {
  const key = path.replace(/^\$/, '')
  const result: any[] = []

  for (const doc of docs) {
    const value = getPath(doc, key)
    // $unwind drops missing or empty paths and treats a non-array as one element
    const items = Array.isArray(value)
      ? value
      : value === undefined || value === null
        ? []
        : [value]

    for (const item of items) {
      const copy = JSON.parse(JSON.stringify(doc))
      setPath(copy, key, item)
      result.push(copy)
    }
  }

  return result
}

function groupStage(docs: any[], stage: Record<string, any>): any[] {
  const sumField = Object.keys(stage).find(key => key !== '_id')!
  const groups = new Map<string, any>()

  for (const doc of docs) {
    const id =
      typeof stage._id === 'string'
        ? getPath(doc, stage._id.replace(/^\$/, ''))
        : Object.fromEntries(
            Object.entries(stage._id).map(([field, ref]) => [
              field,
              getPath(doc, String(ref).replace(/^\$/, ''))
            ])
          )

    const key = JSON.stringify(id)
    const row = groups.get(key) ?? { _id: id, [sumField]: 0 }
    row[sumField] += 1
    groups.set(key, row)
  }

  return Array.from(groups.values())
}

function runStages(docs: any[], stages: any[]): any[] {
  let current = docs

  for (const stage of stages) {
    const [name, arg] = Object.entries(stage)[0] as [string, any]

    if (name === '$match') {
      current = current.filter(doc => matchesCondition(doc, arg))
    } else if (name === '$unwind') {
      current = unwindStage(current, arg)
    } else if (name === '$group') {
      current = groupStage(current, arg)
    } else if (name === '$count') {
      current = current.length > 0 ? [{ [arg]: current.length }] : []
    } else {
      throw new Error(`Unsupported stage in test double: ${name}`)
    }
  }

  return current
}

function runAggregate(submissions: any[], pipeline: any[]): any[] {
  let docs = submissions

  for (const stage of pipeline) {
    const [name, arg] = Object.entries(stage)[0] as [string, any]

    if (name === '$match') {
      docs = docs.filter(doc => matchesCondition(doc, arg))
    } else if (name === '$facet') {
      const facet: Record<string, any[]> = {}

      for (const [facetName, stages] of Object.entries(arg)) {
        facet[facetName] = runStages(docs, stages as any[])
      }

      return [facet]
    } else {
      throw new Error(`Unsupported stage in test double: ${name}`)
    }
  }

  return docs
}

// A Redis that keeps values in memory, as in form-analytic-cache.test.ts
function memoryRedis() {
  const values = new Map<string, string>()

  return {
    values,
    get: async (key: string) => values.get(key) ?? null,
    set: async ({ key, value }: { key: string; value: string; duration?: string }) => {
      values.set(key, value)
      return 'OK'
    }
  }
}

function createService(submissions: any[] = SUBMISSIONS) {
  const aggregateCalls: any[][] = []
  const redis = memoryRedis()

  const service = new DashboardShareService(
    {} as any,
    {
      aggregate: async (pipeline: any[]) => {
        aggregateCalls.push(pipeline)
        return runAggregate(submissions, pipeline)
      }
    } as any,
    { findById: async () => FORM } as any,
    {
      overview: async () => structuredClone(OVERVIEW),
      heatmapCached: async () => structuredClone(HEATMAP_ROWS)
    } as any,
    redis as any
  )

  return { service, redis, aggregateCalls }
}

function shareOf(metrics: string[]) {
  return { id: 'share_1', formId: FORM_ID, teamId: 'team_1', metrics } as any
}

async function testQuestionsMetricGroup() {
  const { service } = createService()
  const data = await service.publicDashboardData(shareOf(['questions']))

  assert.ok(data)
  assert.deepStrictEqual(data.metrics, ['questions'])
  assert.deepStrictEqual(data.questions, [
    {
      title: 'Your role',
      responses: 3,
      completionRate: 100,
      distribution: [
        { label: 'Developer', count: 2 },
        { label: 'Designer', count: 0 },
        // Both typed and blank "Other" answers are counted, never quoted
        { label: 'Other', count: 2 }
      ]
    },
    {
      // Rich-text titles arrive as plain text
      title: 'How did it go?',
      responses: 3,
      completionRate: 100,
      distribution: [
        { label: '4', count: 2 },
        { label: '5', count: 1 }
      ]
    },
    {
      // Free-text questions carry counts only, no distribution
      title: 'Anything else?',
      responses: 1,
      completionRate: 33.33
    },
    {
      // A group's questions are reported like any other
      title: 'Inside question',
      responses: 2,
      completionRate: 66.67,
      distribution: [
        { label: 'Yes', count: 1 },
        { label: 'No', count: 1 }
      ]
    }
  ])
}

async function testHeatmapRowsCarryQuestionTitles() {
  const { service } = createService()
  const data = await service.publicDashboardData(shareOf(['heatmap']))

  assert.ok(data)
  assert.deepStrictEqual(data.heatmap, [
    {
      fieldId: 'role',
      visits: 5,
      avgTimeMs: 1250,
      answerChanges: 2,
      validationErrors: 0,
      abandonments: 1,
      title: 'Your role'
    },
    {
      fieldId: 'inside',
      visits: 3,
      avgTimeMs: 0,
      answerChanges: 0,
      validationErrors: 1,
      abandonments: 0,
      title: 'Inside question'
    },
    {
      // A field deleted since the events were recorded keeps its raw id
      fieldId: 'ghost',
      visits: 1,
      avgTimeMs: 0,
      answerChanges: 0,
      validationErrors: 0,
      abandonments: 0,
      title: 'ghost'
    }
  ])
}

async function testOnlyPermittedMetricGroupsAreExposed() {
  const { service } = createService()
  const data = await service.publicDashboardData(shareOf(['overview']))

  assert.ok(data)
  assert.strictEqual(data.formName, 'Workshop feedback')
  assert.strictEqual(data.range, FormAnalyticRangeEnum.MONTH)
  assert.strictEqual(data.totalResponses, OVERVIEW.totalResponses)
  assert.strictEqual(data.avgCompletionTimeSeconds, OVERVIEW.avgCompletionTimeSeconds)
  assert.strictEqual(data.responseTrend, undefined)
  assert.strictEqual(data.questions, undefined)
  assert.strictEqual(data.heatmap, undefined)
}

async function testMissingFormYieldsNull() {
  const service = new DashboardShareService(
    {} as any,
    {} as any,
    { findById: async () => null } as any,
    {} as any,
    memoryRedis() as any
  )

  assert.strictEqual(await service.publicDashboardData(shareOf(['questions'])), null)
}

async function testQuestionAggregationIsCached() {
  const { service, redis, aggregateCalls } = createService()

  const first = await service.publicDashboardData(shareOf(['questions']))
  const cached = await service.publicDashboardData(shareOf(['questions']))

  assert.strictEqual(aggregateCalls.length, 1)
  // The cached raw counts round-trip into the same payload
  assert.deepStrictEqual(cached, first)

  // The generation bump a new submission performs invalidates the cache
  await redis.set({
    key: formAnalyticGenerationKey(FORM_ID),
    value: 'next-generation',
    duration: '10m'
  })

  await service.publicDashboardData(shareOf(['questions']))
  assert.strictEqual(aggregateCalls.length, 2)
}

async function testPayloadNeverCarriesAnswerText() {
  const { service } = createService()
  const data = await service.publicDashboardData(
    shareOf(['overview', 'trends', 'questions', 'heatmap'])
  )

  assert.ok(data)
  const serialized = JSON.stringify(data)

  // Free-text answers and typed "Other" texts must never ride along
  assert.ok(!serialized.includes('Loved every minute'))
  assert.ok(!serialized.includes('Freelance developer'))
  // Question rows carry aggregate keys only (the full shape is asserted above)
  const allowedKeys = new Set(['title', 'responses', 'completionRate', 'distribution'])

  for (const question of data.questions!) {
    for (const key of Object.keys(question)) {
      assert.ok(allowedKeys.has(key), `unexpected key on a public question row: ${key}`)
    }
  }
}

async function run() {
  await testQuestionsMetricGroup()
  await testHeatmapRowsCarryQuestionTitles()
  await testOnlyPermittedMetricGroupsAreExposed()
  await testMissingFormYieldsNull()
  await testQuestionAggregationIsCached()
  await testPayloadNeverCarriesAnswerText()
}

if (require.main === module) {
  run().catch(error => {
    // eslint-disable-next-line no-console
    console.error(error)
    process.exitCode = 1
  })
}
