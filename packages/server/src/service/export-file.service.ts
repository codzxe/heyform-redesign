import {
  Answer,
  FieldKindEnum,
  FormField,
  HiddenField,
  STATEMENT_FIELD_KINDS
} from '@myform/shared-types-enums'
import { Injectable } from '@nestjs/common'
import { Workbook } from 'exceljs'
import { FieldInfo, parseAsync } from 'json2csv'
import PDFDocument from 'pdfkit'
import { Writable } from 'stream'

import { SubmissionModel } from '@model'
import { htmlUtils, parsePlainAnswer } from '@myform/answer-utils'
import { helper, unixDate } from '@myform/utils'

const FIELD_ID_KEY = '#'
const START_DATE_KEY = 'Start Date (UTC)'
const SUBMIT_DATE_KEY = 'Submit Date (UTC)'
const IP_ADDRESS_KEY = 'IP Address'
const SPREADSHEET_FORMULA_PREFIXES = new Set(['=', '+', '-', '@'])

function neutralizeSpreadsheetFormula(value: string): string {
  let index = 0

  while (index < value.length) {
    const character = value[index]
    const code = character.charCodeAt(0)
    const isControlCharacter = code <= 0x1f || (code >= 0x7f && code <= 0x9f)

    if (!isControlCharacter && character.trim() !== '') {
      break
    }

    index += 1
  }

  if (SPREADSHEET_FORMULA_PREFIXES.has(value[index])) {
    return `'${value}`
  }

  return value
}

// An answer as readable text, as in the CSV export: file uploads as their
// URL, other answers as in email notifications
export function answerToText(answer: Answer): string {
  const value = answer.value
  let result = ''

  if (helper.isEmpty(value)) {
    return result
  }

  switch (answer?.kind) {
    case FieldKindEnum.FILE_UPLOAD:
      if (helper.isString(value)) {
        result = value
      } else if (helper.isObject(value)) {
        if (helper.isString(value.url)) {
          result = value.url
        } else {
          const prefix = value.urlPrefix || value.cdnUrlPrefix
          const key = value.key || value.cdnKey

          if (helper.isString(prefix) && helper.isString(key)) {
            result = `${prefix.replace(/\/+$/, '')}/${key.replace(/^\/+/, '')}`
          }
        }
      }
      break

    default:
      try {
        result = parsePlainAnswer(answer)
      } catch {
        // Historical submissions may predate current validation. Treat a malformed answer as
        // an empty cell so one poisoned record cannot make the entire form unexportable.
        result = ''
      }
      break
  }

  return result
}

// The column headers and cell values shared by the CSV and XLSX exports, so
// both formats always agree on ordering, titles and formula neutralization.
function buildFields(
  formFields: FormField[],
  selectedHiddenFields: HiddenField[],
  withIp = false
): FieldInfo<SubmissionModel>[] {
  const selectedFormFields = formFields
    .filter(field => !STATEMENT_FIELD_KINDS.includes(field.kind))
    .map(field => ({
      ...field,
      title: neutralizeSpreadsheetFormula(
        helper.isArray(field.title) ? htmlUtils.serialize(field.title) : String(field.title || '')
      )
    }))

  return [
    {
      label: FIELD_ID_KEY,
      value: submission => submission.id
    },
    ...selectedFormFields.map(field => ({
      label: field.title,
      value: (submission: SubmissionModel) => {
        const answer = submission.answers.find(answer => answer.id === field.id)

        return helper.isEmpty(answer) ? '' : neutralizeSpreadsheetFormula(answerToText(answer))
      }
    })),
    ...selectedHiddenFields.map(hiddenField => ({
      label: neutralizeSpreadsheetFormula(hiddenField.name),
      value: (submission: SubmissionModel) => {
        const value = submission.hiddenFields.find(answer => answer.id === hiddenField.id)?.value

        return helper.isString(value) ? neutralizeSpreadsheetFormula(value) : value
      }
    })),
    {
      label: START_DATE_KEY,
      value: submission => (submission.startAt ? unixDate(submission.startAt).toISOString() : '')
    },
    {
      label: SUBMIT_DATE_KEY,
      value: submission => (submission.startAt ? unixDate(submission.endAt!).toISOString() : '')
    },
    ...(withIp
      ? [
          {
            label: IP_ADDRESS_KEY,
            value: (submission: SubmissionModel) => submission.ip || ''
          }
        ]
      : [])
  ]
}

function submissionFieldTitle(field: FormField): string {
  return neutralizeSpreadsheetFormula(
    helper.isArray(field.title) ? htmlUtils.serialize(field.title) : String(field.title || '')
  )
}

@Injectable()
export class ExportFileService {
  async csv(
    formFields: FormField[],
    selectedHiddenFields: HiddenField[],
    submissions: SubmissionModel[],
    withIp = false
  ): Promise<string> {
    return this.csvChunk(formFields, selectedHiddenFields, submissions, withIp, true)
  }

  // One streaming chunk of the CSV export: the first chunk carries the header
  // row, every following chunk only data rows, so concatenating the chunks in
  // order reproduces exactly what csv() returns for the whole set.
  async csvChunk(
    formFields: FormField[],
    selectedHiddenFields: HiddenField[],
    submissions: SubmissionModel[],
    withIp = false,
    withHeader = true
  ): Promise<string> {
    return parseAsync(submissions, {
      fields: buildFields(formFields, selectedHiddenFields, withIp),
      header: withHeader
    })
  }

  /**
   * Streams an XLSX workbook to `output`: one header row with the flattened
   * field titles (identical to the CSV columns), then one row per submission.
   * Submissions arrive in batches so large forms never sit fully in memory.
   */
  async xlsxStream(
    formFields: FormField[],
    selectedHiddenFields: HiddenField[],
    batches: AsyncIterable<SubmissionModel[]>,
    withIp = false,
    output: Writable
  ): Promise<void> {
    const fields = buildFields(formFields, selectedHiddenFields, withIp)

    const workbook = new Workbook()
    const sheet = workbook.addWorksheet('Submissions')

    const headerRow = sheet.addRow(fields.map(field => field.label))
    headerRow.font = { bold: true }

    for await (const batch of batches) {
      for (const submission of batch) {
        sheet.addRow(
          fields.map(field => {
            const accessor = field.value as
              | ((item: SubmissionModel) => unknown)
              | string
              | undefined
            const value = typeof accessor === 'function' ? accessor(submission) : accessor
            return String(value ?? '')
          })
        )
      }
    }

    await workbook.xlsx.write(output)
  }

  /**
   * Streams a PDF to `output` with one page per submission: the form name,
   * response number and date, then each question with its answer as plain
   * text, then the hidden fields and timestamps. Answers are rendered as
   * plain text with the built-in Helvetica font.
   */
  async pdfStream(
    formName: string,
    formFields: FormField[],
    selectedHiddenFields: HiddenField[],
    batches: AsyncIterable<SubmissionModel[]>,
    withIp = false,
    output: Writable
  ): Promise<void> {
    const fields = formFields.filter(field => !STATEMENT_FIELD_KINDS.includes(field.kind))

    const doc = new PDFDocument({
      margin: 36,
      size: 'A4'
    })

    doc.pipe(output)

    let index = 0

    for await (const batch of batches) {
      for (const submission of batch) {
        index += 1

        if (index > 1) {
          doc.addPage()
        }

        doc.font('Helvetica-Bold').fontSize(15).fillColor('#111827').text(formName)
        doc.font('Helvetica').fontSize(9).fillColor('#6b7280').text(`Response #${index}`)

        if (submission.endAt) {
          doc.text(`Submitted at ${unixDate(submission.endAt).toISOString()}`)
        }

        doc.moveDown(0.5)

        for (const field of fields) {
          const answer = submission.answers.find(answer => answer.id === field.id)
          const answerText = helper.isEmpty(answer)
            ? ''
            : neutralizeSpreadsheetFormula(answerToText(answer!))

          doc.font('Helvetica-Bold').fontSize(10).fillColor('#374151')
          doc.text(submissionFieldTitle(field), {
            width: doc.page.width - doc.page.margins.left - doc.page.margins.right
          })
          doc
            .font('Helvetica')
            .fontSize(10)
            .fillColor('#111827')
            .text(answerText || '—')
          doc.moveDown(0.4)
        }

        for (const hiddenField of selectedHiddenFields) {
          const value = submission.hiddenFields.find(row => row.id === hiddenField.id)?.value

          doc.font('Helvetica-Bold').fontSize(10).fillColor('#374151').text(hiddenField.name)
          doc
            .font('Helvetica')
            .fontSize(10)
            .fillColor('#111827')
            .text(
              helper.isString(value) ? neutralizeSpreadsheetFormula(value) : ((value as any) ?? '—')
            )
          doc.moveDown(0.4)
        }

        doc.moveDown(0.6)
        doc.font('Helvetica').fontSize(8).fillColor('#9ca3af')

        if (submission.startAt) {
          doc.text(`Start Date (UTC): ${unixDate(submission.startAt).toISOString()}`)
        }

        if (submission.endAt) {
          doc.text(`Submit Date (UTC): ${unixDate(submission.endAt).toISOString()}`)
        }

        if (withIp && submission.ip) {
          doc.text(`IP Address: ${submission.ip}`)
        }
      }
    }

    doc.end()

    // Resolve once every byte has been flushed into the output stream
    await new Promise<void>((resolve, reject) => {
      doc.on('end', resolve)
      doc.on('error', reject)
    })
  }
}
