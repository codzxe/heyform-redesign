import { Process, Processor } from '@nestjs/bull'
import { Job } from 'bull'

import { ScheduledReportService } from '@service'

import { BaseQueue } from './base.queue'

export interface ScheduledReportQueueJob {
  reportId: string
  // Due timestamp that scheduled this run; keeps retries idempotent
  triggeredAt?: number
}

@Processor('ScheduledReportQueue')
export class ScheduledReportQueue extends BaseQueue {
  constructor(private readonly scheduledReportService: ScheduledReportService) {
    super()
  }

  @Process()
  async process(job: Job<ScheduledReportQueueJob>): Promise<any> {
    const { reportId, triggeredAt } = job.data

    // Errors are rethrown so Bull retries with the queue's configured
    // attempts/backoff; the service records the failure on the report itself.
    await this.scheduledReportService.generateAndSend(reportId, triggeredAt)
  }
}
