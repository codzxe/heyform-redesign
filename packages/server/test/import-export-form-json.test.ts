/**
 * Unit tests for the form JSON export/import resolvers.
 *
 * - exportFormToJSON must return exactly the whitelisted form-definition keys
 *   (structure, logic, variables, settings, theme) and must never leak
 *   submissions or any respondent data.
 * - importFormFromJSON must validate the payload structurally (a name and a
 *   non-empty fields array), normalize it into a form document whose ownership
 *   comes from the guards (team/project/member) and whose status is NORMAL,
 *   and forward only known top-level keys to FormService.create so a crafted
 *   export cannot inject arbitrary document fields.
 *
 * Guards are bypassed by calling the resolver methods directly (house pattern
 * from update-form.resolver.test.ts): the @Team/@Project/@User/@Form parameter
 * values are provided as plain objects.
 */
import {
  CaptchaKindEnum,
  FormKindEnum,
  FormStatusEnum,
  InteractiveModeEnum
} from '@myform/shared-types-enums'
import { BadRequestException } from '@nestjs/common'
import assert from 'assert'

import { ExportFormJsonResolver } from '../src/resolver/form/export-form-json.resolver'
import { ImportFormJsonResolver } from '../src/resolver/form/import-form-json.resolver'

// Exactly the keys exportFormToJSON is allowed to return (sorted).
const EXPORTED_KEYS = [
  'fields',
  'hiddenFields',
  'interactiveMode',
  'kind',
  'logics',
  'name',
  'settings',
  'themeSettings',
  'variables'
]

// Exactly the keys importFormFromJSON may forward to FormService.create (sorted).
const IMPORT_DOC_KEYS = [
  'fields',
  'hiddenFields',
  'interactiveMode',
  'kind',
  'logics',
  'memberId',
  'name',
  'projectId',
  'settings',
  'status',
  'teamId',
  'themeSettings',
  'variables'
]

// Guard-verified context injected as the @Team/@Project/@User parameters.
const team = { id: 'team_1' }
const project = { id: 'project_1', teamId: 'team_1' }
const user = { id: 'user_1' }

function createImportResolver() {
  let created: Record<string, any> | undefined

  const formService = {
    create: async (form: Record<string, any>) => {
      created = form
      return 'form_new_1'
    }
  }
  const resolver = new ImportFormJsonResolver(formService as any)

  return { resolver, getCreated: () => created }
}

function importForm(resolver: ImportFormJsonResolver, formJson: string): Promise<string> {
  return resolver.importFormFromJSON(
    team as any,
    project as any,
    user as any,
    {
      projectId: 'project_1',
      formJson
    } as any
  )
}

async function rejectsBadRequest(promise: Promise<unknown>, message: string) {
  await assert.rejects(promise, (error: any) => {
    assert.ok(error instanceof BadRequestException)
    assert.strictEqual(error.message, message)
    return true
  })
}

// ------------------------------------------------------------------- export

async function testExportReturnsExactlyTheWhitelistedKeys() {
  const resolver = new ExportFormJsonResolver()
  const form = {
    id: 'form_1',
    name: 'Exportable survey',
    fields: [{ id: 'q1', kind: 'short_text', title: 'Question 1' }],
    hiddenFields: [{ id: 'utm_source' }],
    logics: [{ fieldId: 'q1', payloads: [] }],
    variables: [{ name: 'score', value: 0 }],
    settings: { locale: 'en', active: true },
    themeSettings: { questionColor: '#26352B' },
    interactiveMode: InteractiveModeEnum.INTERACTIVE,
    kind: FormKindEnum.QUIZ
  }

  const result = await resolver.exportFormToJSON(form as any, { formId: 'form_1' } as any)

  assert.deepStrictEqual(Object.keys(result).sort(), EXPORTED_KEYS)
  assert.strictEqual(result.name, 'Exportable survey')
  assert.deepStrictEqual(result.fields, form.fields)
  assert.deepStrictEqual(result.hiddenFields, form.hiddenFields)
  assert.deepStrictEqual(result.logics, form.logics)
  assert.deepStrictEqual(result.variables, form.variables)
  assert.deepStrictEqual(result.settings, form.settings)
  assert.deepStrictEqual(result.themeSettings, form.themeSettings)
  assert.strictEqual(result.interactiveMode, InteractiveModeEnum.INTERACTIVE)
  assert.strictEqual(result.kind, FormKindEnum.QUIZ)
}

async function testExportDefaultsUndefinedCollectionsToEmptyValues() {
  const resolver = new ExportFormJsonResolver()

  // A sparse form: every optional collection is undefined.
  const result = await resolver.exportFormToJSON(
    { id: 'form_2', name: 'Sparse form' } as any,
    { formId: 'form_2' } as any
  )

  assert.deepStrictEqual(result.fields, [])
  assert.deepStrictEqual(result.hiddenFields, [])
  assert.deepStrictEqual(result.logics, [])
  assert.deepStrictEqual(result.variables, [])
  assert.deepStrictEqual(result.settings, {})
  assert.deepStrictEqual(result.themeSettings, {})
}

async function testExportNeverIncludesSubmissionsOrRespondentData() {
  const resolver = new ExportFormJsonResolver()
  const form = {
    id: 'form_3',
    name: 'Form holding answers',
    fields: [{ id: 'q1', kind: 'short_text' }],
    interactiveMode: InteractiveModeEnum.GENERAL,
    kind: FormKindEnum.SURVEY,
    // Internal / sensitive properties that must never be exported.
    teamId: 'team_1',
    projectId: 'project_1',
    memberId: 'user_1',
    status: FormStatusEnum.NORMAL,
    submissions: [{ q1: 'someone answered this' }],
    respondents: [{ email: 'respondent@example.com' }],
    stripeAccount: { accountId: 'acct_secret' },
    retentionAt: 1893456000,
    suspended: false,
    draftLogics: [],
    translations: { fr: { name: 'traduit' } }
  }

  const result = await resolver.exportFormToJSON(form as any, { formId: 'form_3' } as any)

  assert.deepStrictEqual(Object.keys(result).sort(), EXPORTED_KEYS)
  assert.strictEqual(Object.prototype.hasOwnProperty.call(result, 'submissions'), false)
  assert.strictEqual(Object.prototype.hasOwnProperty.call(result, 'respondents'), false)
  assert.strictEqual(JSON.stringify(result).includes('someone answered this'), false)
  assert.strictEqual(JSON.stringify(result).includes('respondent@example.com'), false)
  assert.strictEqual(JSON.stringify(result).includes('acct_secret'), false)
}

// ------------------------------------------------------------------- import

async function testImportCreatesNormalizedFormFromValidPayload() {
  const { resolver, getCreated } = createImportResolver()
  const payload = {
    name: 'Imported survey',
    fields: [{ id: 'q1', kind: 'short_text', title: 'Question 1' }],
    hiddenFields: [{ id: 'utm_source' }],
    logics: [{ fieldId: 'q1', payloads: [] }],
    variables: [{ name: 'score', value: 0 }],
    settings: { locale: 'fr', active: true },
    themeSettings: { questionColor: '#26352B' },
    interactiveMode: InteractiveModeEnum.POPUP,
    kind: FormKindEnum.QUIZ
  }

  const formId = await importForm(resolver, JSON.stringify(payload))

  // The id of the form created by FormService is returned to the caller.
  assert.strictEqual(formId, 'form_new_1')

  const doc = getCreated()
  assert.ok(doc)
  // Payload values are carried over.
  assert.strictEqual(doc.name, 'Imported survey')
  assert.deepStrictEqual(doc.fields, payload.fields)
  assert.deepStrictEqual(doc.hiddenFields, payload.hiddenFields)
  assert.deepStrictEqual(doc.logics, payload.logics)
  assert.deepStrictEqual(doc.variables, payload.variables)
  assert.deepStrictEqual(doc.settings, payload.settings)
  assert.deepStrictEqual(doc.themeSettings, payload.themeSettings)
  assert.strictEqual(doc.interactiveMode, InteractiveModeEnum.POPUP)
  assert.strictEqual(doc.kind, FormKindEnum.QUIZ)
  // Ownership comes from the guards, never from the payload.
  assert.strictEqual(doc.teamId, 'team_1')
  assert.strictEqual(doc.projectId, 'project_1')
  assert.strictEqual(doc.memberId, 'user_1')
  // Imported forms are created as normal (non-trash) forms.
  assert.strictEqual(doc.status, FormStatusEnum.NORMAL)
}

async function testImportAppliesDefaultsForMissingOptionalParts() {
  const { resolver, getCreated } = createImportResolver()

  await importForm(resolver, JSON.stringify({ name: 'Bare form', fields: [{ id: 'q1' }] }))

  const doc = getCreated()
  assert.ok(doc)
  assert.deepStrictEqual(doc.hiddenFields, [])
  assert.deepStrictEqual(doc.logics, [])
  assert.deepStrictEqual(doc.variables, [])
  assert.deepStrictEqual(doc.settings, {
    active: false,
    captchaKind: CaptchaKindEnum.NONE,
    filterSpam: false,
    allowArchive: true,
    requirePassword: false,
    locale: 'en',
    enableQuestionList: true,
    enableNavigationArrows: true
  })
  assert.deepStrictEqual(doc.themeSettings, {})
  assert.strictEqual(doc.interactiveMode, InteractiveModeEnum.GENERAL)
  assert.strictEqual(doc.status, FormStatusEnum.NORMAL)
}

async function testImportPreservesInteractiveModeFromPayload() {
  const { resolver, getCreated } = createImportResolver()
  const fields = [{ id: 'q1', kind: 'short_text' }]

  await importForm(
    resolver,
    JSON.stringify({
      name: 'Interactive form',
      fields,
      interactiveMode: InteractiveModeEnum.INTERACTIVE
    })
  )
  assert.strictEqual(getCreated()?.interactiveMode, InteractiveModeEnum.INTERACTIVE)

  await importForm(
    resolver,
    JSON.stringify({ name: 'Popup form', fields, interactiveMode: InteractiveModeEnum.POPUP })
  )
  assert.strictEqual(getCreated()?.interactiveMode, InteractiveModeEnum.POPUP)
}

async function testImportRejectsInvalidJson() {
  const { resolver, getCreated } = createImportResolver()

  await rejectsBadRequest(importForm(resolver, '{"name": "Unbalanced", '), 'Invalid JSON format')
  await rejectsBadRequest(importForm(resolver, 'not json at all'), 'Invalid JSON format')

  assert.strictEqual(getCreated(), undefined, 'nothing may be persisted for invalid JSON')
}

async function testImportRejectsJsonWithoutAName() {
  const { resolver, getCreated } = createImportResolver()

  await rejectsBadRequest(
    importForm(resolver, JSON.stringify({ fields: [{ id: 'q1' }] })),
    'Invalid form JSON: missing required fields'
  )
  // An empty name is just as invalid as a missing one.
  await rejectsBadRequest(
    importForm(resolver, JSON.stringify({ name: '', fields: [{ id: 'q1' }] })),
    'Invalid form JSON: missing required fields'
  )
  // JSON that parses to null has neither a name nor fields.
  await rejectsBadRequest(
    importForm(resolver, 'null'),
    'Invalid form JSON: missing required fields'
  )

  assert.strictEqual(getCreated(), undefined)
}

async function testImportRejectsJsonWithoutFields() {
  const { resolver, getCreated } = createImportResolver()

  // A name alone is not a form: the fields array is required.
  await rejectsBadRequest(
    importForm(resolver, JSON.stringify({ name: 'No questions' })),
    'Invalid form JSON: missing required fields'
  )
  // ... and so is an empty fields array.
  await rejectsBadRequest(
    importForm(resolver, JSON.stringify({ name: 'Empty questions', fields: [] })),
    'Invalid form JSON: missing required fields'
  )
  // fields must be an array, not a single field or a string.
  await rejectsBadRequest(
    importForm(resolver, JSON.stringify({ name: 'Not an array', fields: 'q1' })),
    'Invalid form JSON: missing required fields'
  )

  assert.strictEqual(getCreated(), undefined)
}

async function testImportTruncatesNamesLongerThan120Characters() {
  const { resolver, getCreated } = createImportResolver()
  const longName = 'L'.repeat(200)

  await importForm(resolver, JSON.stringify({ name: longName, fields: [{ id: 'q1' }] }))
  let doc = getCreated()
  assert.ok(doc)
  assert.strictEqual(doc.name.length, 120)
  assert.strictEqual(doc.name, longName.slice(0, 120))

  // A name of exactly 120 characters is kept as is.
  const exactName = 'E'.repeat(120)
  await importForm(resolver, JSON.stringify({ name: exactName, fields: [{ id: 'q1' }] }))
  doc = getCreated()
  assert.ok(doc)
  assert.strictEqual(doc.name, exactName)
}

async function testImportForwardsOnlyKnownKeysToFormService() {
  const { resolver, getCreated } = createImportResolver()

  await importForm(
    resolver,
    JSON.stringify({
      name: 'Crafted payload',
      fields: [{ id: 'q1' }],
      // Known document keys that must be overridden by the guard context.
      teamId: 'team_attacker',
      projectId: 'project_attacker',
      memberId: 'user_attacker',
      status: FormStatusEnum.TRASH,
      // Unknown keys that must not reach the created document.
      _id: 'form_hijack',
      submissions: [{ q1: 'leaked answer' }],
      respondents: [{ email: 'leak@example.com' }],
      stripeAccount: { accountId: 'acct_evil' },
      draftLogics: [{ fieldId: 'q1' }],
      translations: { fr: { name: 'traduit' } },
      publishedAt: 1700000000,
      retentionAt: 1893456000,
      suspended: true,
      version: 42
    })
  )

  const doc = getCreated()
  assert.ok(doc)

  // Every forwarded key belongs to the import allowlist.
  for (const key of Object.keys(doc)) {
    assert.strictEqual(
      IMPORT_DOC_KEYS.includes(key),
      true,
      `unexpected key "${key}" forwarded to FormService.create`
    )
  }

  // Ownership and status come from the guards/resolver, never from the payload.
  assert.strictEqual(doc.teamId, 'team_1')
  assert.strictEqual(doc.projectId, 'project_1')
  assert.strictEqual(doc.memberId, 'user_1')
  assert.strictEqual(doc.status, FormStatusEnum.NORMAL)

  // None of the unknown payload values leaked into the document.
  assert.strictEqual(JSON.stringify(doc).includes('form_hijack'), false)
  assert.strictEqual(JSON.stringify(doc).includes('leaked answer'), false)
  assert.strictEqual(JSON.stringify(doc).includes('leak@example.com'), false)
  assert.strictEqual(JSON.stringify(doc).includes('acct_evil'), false)
}

async function run() {
  await testExportReturnsExactlyTheWhitelistedKeys()
  await testExportDefaultsUndefinedCollectionsToEmptyValues()
  await testExportNeverIncludesSubmissionsOrRespondentData()
  await testImportCreatesNormalizedFormFromValidPayload()
  await testImportAppliesDefaultsForMissingOptionalParts()
  await testImportPreservesInteractiveModeFromPayload()
  await testImportRejectsInvalidJson()
  await testImportRejectsJsonWithoutAName()
  await testImportRejectsJsonWithoutFields()
  await testImportTruncatesNamesLongerThan120Characters()
  await testImportForwardsOnlyKnownKeysToFormService()

  // eslint-disable-next-line no-console
  console.log('import/export form JSON resolver tests passed')
}

if (require.main === module) {
  run().catch(error => {
    // eslint-disable-next-line no-console
    console.error(error)
    process.exitCode = 1
  })
}
