import { Process, Processor } from '@nestjs/bull'
import { Job } from 'bull'

import { DeletionRequestService } from '../service/deletion-request.service'

import { BaseQueue } from './base.queue'

interface DeletionRequestQueueJob {
  requestId: string
}

/**
 * Executes approved GDPR deletion requests. Failures propagate so Bull
 * retries the job with the queue's backoff settings; the worker itself is
 * idempotent, so a retried job never double-deletes or double-audits.
 */
@Processor('DeletionRequestQueue')
export class DeletionRequestQueue extends BaseQueue {
  constructor(private readonly deletionRequestService: DeletionRequestService) {
    super()
  }

  @Process()
  async process(job: Job<DeletionRequestQueueJob>): Promise<any> {
    await this.deletionRequestService.execute(job.data.requestId)
  }
}
