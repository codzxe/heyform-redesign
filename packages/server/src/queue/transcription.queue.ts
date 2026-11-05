import { OnQueueFailed, Process, Processor } from '@nestjs/bull'
import { Job } from 'bull'

import { TranscriptionService } from '../service/transcription.service'

import { BaseQueue } from './base.queue'

interface TranscriptionQueueJob {
  mediaAssetId: string
}

@Processor('TranscriptionQueue')
export class TranscriptionQueue extends BaseQueue {
  constructor(private readonly transcriptionService: TranscriptionService) {
    super()
  }

  @Process()
  async process(job: Job<TranscriptionQueueJob>): Promise<any> {
    const { mediaAssetId } = job.data

    try {
      await this.transcriptionService.transcribe(mediaAssetId)
    } catch (err) {
      // Bull owns the retry/backoff schedule (attempts come from the queue's
      // default job options, BULL_JOB_ATTEMPTS). Only a final, exhausted attempt
      // persists the failure, so earlier attempts leave the transcript claimable
      // for the next retry.
      if (this.isFinalAttempt(job)) {
        await this.markTranscriptionFailed(mediaAssetId, err)
      }

      throw err
    }
  }

  @OnQueueFailed()
  async onFailed(job: Job<TranscriptionQueueJob>): Promise<void> {
    await super.onFailed(job)

    // Covers failures the processor never sees, such as BULL_JOB_TIMEOUT kills.
    if (job.attemptsMade >= (job.opts.attempts ?? 1)) {
      await this.markTranscriptionFailed(
        job.data.mediaAssetId,
        job.failedReason || 'Transcription failed'
      )
    }
  }

  private isFinalAttempt(job: Job): boolean {
    // While a processor runs, attemptsMade counts only the previously failed
    // attempts, so the running attempt is the final one at attemptsMade + 1.
    return job.attemptsMade + 1 >= (job.opts.attempts ?? 1)
  }

  private async markTranscriptionFailed(mediaAssetId: string, err: unknown): Promise<void> {
    const message = err instanceof Error ? err.message : String(err)

    try {
      await this.transcriptionService.markFailed(mediaAssetId, message)
    } catch (err) {
      this.logger.error(
        `Failed to record the transcription error for media asset ${mediaAssetId}`,
        err instanceof Error ? err.stack : undefined
      )
    }
  }
}
