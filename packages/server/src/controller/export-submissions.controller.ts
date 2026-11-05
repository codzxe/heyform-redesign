import { BadRequestException, Controller, Get, Query, Res } from '@nestjs/common'
import type { Response } from 'express'

import { Auth, FormGuard } from '@decorator'
import { ExportSubmissionsDto } from '@dto'
import type { SubmissionModel } from '@model'
import { flattenFields } from '@myform/answer-utils'
import { date, helper } from '@myform/utils'
import { ExportFileService, FormService, SubmissionService } from '@service'
import { isSubmissionIpVisible, resolveExportDateRange } from '@utils'

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/**
 * Streams submissions of a form in batches, cursor-paginated by _id, so
 * exports of any size never load the whole result set into memory. The
 * optional [from, to] window (unix seconds) is applied by the database query.
 */
async function* batchSubmissions(
  submissionService: SubmissionService,
  formId: string,
  withIp: boolean,
  from?: number,
  to?: number
): AsyncGenerator<SubmissionModel[]> {
  const batchSize = 500
  let lastId: string | undefined

  while (true) {
    const batch: SubmissionModel[] = await submissionService.findAllByFormBatched(
      formId,
      withIp,
      from,
      to,
      batchSize,
      lastId
    )

    if (!helper.isValidArray(batch)) {
      return
    }

    yield batch

    if (batch.length < batchSize) {
      return
    }

    lastId = batch[batch.length - 1].id
  }
}

@Controller()
@Auth()
export class ExportSubmissionsController {
  constructor(
    private readonly submissionService: SubmissionService,
    private readonly formService: FormService,
    private readonly exportFileService: ExportFileService
  ) {}

  @Get('/api/export/submissions')
  @FormGuard()
  async exportSubmissions(
    @Query() input: ExportSubmissionsDto,
    @Res() res: Response
  ): Promise<void> {
    const form = await this.formService.findById(input.formId)
    if (!form) {
      throw new BadRequestException('The form does not exist')
    }

    const withIp = isSubmissionIpVisible(form as any)
    const formFields = flattenFields(form.fields)

    // Date-only ISO strings anchor to UTC days (inclusive bounds); see
    // resolveExportDateRange for the exact semantics.
    const { from, to } = resolveExportDateRange(input.from, input.to)

    // Pull the first batch before any headers are sent so an empty result
    // (or a window that matches nothing) still answers as a validation error.
    const batches = batchSubmissions(this.submissionService, input.formId, withIp, from, to)
    const iterator = batches[Symbol.asyncIterator]()
    const first = await iterator.next()

    if (first.done || !helper.isValidArray(first.value)) {
      throw new BadRequestException('The submissions does not exist')
    }

    // Replays the already-fetched first batch, then streams the rest.
    async function* replayFirst(): AsyncGenerator<SubmissionModel[]> {
      yield first.value

      while (true) {
        const next = await iterator.next()

        if (next.done) {
          return
        }

        yield next.value
      }
    }

    const dateStr = date().format('YYYY-MM-DD')
    const baseName = `${encodeURIComponent(form.name)}-${dateStr}`

    if (input.format === 'xlsx') {
      res.header('Content-Type', XLSX_MIME)
      res.header('Content-Disposition', `attachment; filename="${baseName}.xlsx"`)
      await this.exportFileService.xlsxStream(
        formFields,
        form.hiddenFields,
        replayFirst(),
        withIp,
        res
      )
      return
    }

    if (input.format === 'pdf') {
      res.header('Content-Type', 'application/pdf')
      res.header('Content-Disposition', `attachment; filename="${baseName}.pdf"`)
      await this.exportFileService.pdfStream(
        form.name,
        formFields,
        form.hiddenFields,
        replayFirst(),
        withIp,
        res
      )
      return
    }

    // csv (default): json2csv works on the full array, so batches are
    // collected first. The first batch is already in hand.
    const submissions: SubmissionModel[] = [...first.value]

    for await (const batch of replayFirst()) {
      submissions.push(...batch)
    }

    const data = await this.exportFileService.csv(
      formFields,
      form.hiddenFields,
      submissions,
      withIp
    )

    res.header('Content-Type', 'text/csv; charset=utf-8')
    res.header('Content-Disposition', `attachment; filename="${baseName}.csv"`)
    res.send(data)
  }
}
