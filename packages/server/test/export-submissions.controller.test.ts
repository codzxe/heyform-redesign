import { BadRequestException } from '@nestjs/common'
import assert from 'assert'
import type { Response } from 'express'

import { ExportSubmissionsController } from '../src/controller/export-submissions.controller'

/* eslint-disable @typescript-eslint/no-explicit-any */

const FORM = {
  id: 'form_1',
  name: 'Survey',
  fields: [{ id: 'f1', kind: 'ShortText', title: 'Name' }],
  hiddenFields: []
}

function buildSubmission(id: string, endAt: number): any {
  return { id, endAt, answers: [], hiddenFields: [] }
}

interface ControllerCalls {
  batched: any[][]
  csv?: any[]
  xlsxStream?: any[]
  pdfStream?: any[]
}

function createController(options: { firstBatch: any[] }) {
  const calls: ControllerCalls = { batched: [] }

  const submissionService: any = {
    findAllByFormBatched: async (...args: any[]) => {
      calls.batched.push(args)
      return options.firstBatch
    }
  }

  const exportFileService: any = {
    csv: async (...args: any[]) => {
      calls.csv = args
      return 'csv-output'
    },
    xlsxStream: async (...args: any[]) => {
      calls.xlsxStream = args
    },
    pdfStream: async (...args: any[]) => {
      calls.pdfStream = args
    }
  }

  const controller = new ExportSubmissionsController(
    submissionService,
    { findById: async () => FORM } as any,
    exportFileService
  )

  return { controller, calls }
}

function createResponse(): { res: Response; headers: Record<string, string>; sent: string[] } {
  const headers: Record<string, string> = {}
  const sent: string[] = []

  const res = {
    header: (name: string, value: string) => {
      headers[name] = value
    },
    send: (data: string) => {
      sent.push(data)
    }
  } as unknown as Response

  return { res, headers, sent }
}

async function testRoutesCsvByDefault() {
  const { controller, calls } = createController({ firstBatch: [buildSubmission('s1', 100)] })
  const { res, headers, sent } = createResponse()

  await controller.exportSubmissions({ formId: 'form_1' } as any, res)

  assert.ok(calls.csv, 'csv export runs by default')
  assert.ok(headers['Content-Type'].includes('text/csv'))
  assert.ok(headers['Content-Disposition'].endsWith('.csv"'))
  assert.strictEqual(sent[0], 'csv-output')
}

async function testRoutesXlsxWithStreaming() {
  const { controller, calls } = createController({ firstBatch: [buildSubmission('s1', 100)] })
  const { res, headers } = createResponse()

  await controller.exportSubmissions({ formId: 'form_1', format: 'xlsx' } as any, res)

  assert.ok(calls.xlsxStream, 'xlsx export streams')
  assert.strictEqual(
    headers['Content-Type'],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  )
  assert.ok(headers['Content-Disposition'].endsWith('.xlsx"'))
}

async function testRoutesPdfWithStreaming() {
  const { controller, calls } = createController({ firstBatch: [buildSubmission('s1', 100)] })
  const { res, headers } = createResponse()

  await controller.exportSubmissions({ formId: 'form_1', format: 'pdf' } as any, res)

  assert.ok(calls.pdfStream, 'pdf export streams')
  assert.strictEqual(headers['Content-Type'], 'application/pdf')
  assert.ok(headers['Content-Disposition'].endsWith('.pdf"'))
}

async function testPassesDateWindowToQuery() {
  const { controller, calls } = createController({ firstBatch: [buildSubmission('s1', 100)] })
  const { res } = createResponse()

  await controller.exportSubmissions(
    { formId: 'form_1', from: '2025-01-01', to: '2025-01-31' } as any,
    res
  )

  const args = calls.batched[0]
  // [formId, withIp, from, to, batchSize, lastId]
  assert.strictEqual(args[0], 'form_1')
  assert.strictEqual(args[2], Date.parse('2025-01-01T00:00:00.000Z') / 1000)
  // date-only `to` expands to the inclusive end of the UTC day (…T23:59:59.999Z)
  assert.strictEqual(args[3], Date.parse('2025-01-31T00:00:00.000Z') / 1000 + 86399.999)
}

async function testEmptyResultRejectsBeforeHeaders() {
  const { controller } = createController({ firstBatch: [] })
  const { res, headers } = createResponse()

  await assert.rejects(
    controller.exportSubmissions({ formId: 'form_1' } as any, res),
    (error: unknown) => error instanceof BadRequestException
  )
  assert.strictEqual(Object.keys(headers).length, 0, 'no headers on empty result')
}

async function run() {
  await testRoutesCsvByDefault()
  await testRoutesXlsxWithStreaming()
  await testRoutesPdfWithStreaming()
  await testPassesDateWindowToQuery()
  await testEmptyResultRejectsBeforeHeaders()
}

if (require.main === module) {
  run().catch(error => {
    // eslint-disable-next-line no-console
    console.error(error)
    process.exitCode = 1
  })
}
