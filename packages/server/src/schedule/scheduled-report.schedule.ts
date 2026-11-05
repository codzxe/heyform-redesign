import { InjectQueue } from '@nestjs/bull'
import { Injectable } from '@nestjs/common'
import { Queue } from 'bull'

import { timestamp } from '@myform/utils'
import { Cron } from '@nestjs/schedule'
import { ScheduledReportService } from '@service'
import { Logger } from '@utils'

/**
 * Every 5 minutes, dispatches due scheduled reports to the
 * ScheduledReportQueue. Each report is claimed atomically before it is
 * enqueued: claimNextRun advances nextRunAt under the condition
 * `nextRunAt <= now`, so overlapping cron runs and multiple app instances can
 * never enqueue the same report twice.
 */
@Injectable()
export class ScheduledReportSchedule {
  private readonly logger = new Logger('ScheduledReportSchedule')

  constructor(
    private readonly scheduledReportService: ScheduledReportService,
    @InjectQueue('ScheduledReportQueue')
    private readonly scheduledReportQueue: Queue
  ) {}

  @Cron('*/5 * * * *')
  async dispatchDueReports(): Promise<void> {
    const now = timestamp()
    const reports = await this.scheduledReportService.findDue(now)

    for (const report of reports) {
      try {
        // Returns the due timestamp when this dispatcher won the claim, null
        // when another dispatcher already took this run.
        const triggeredAt = await this.scheduledReportService.claimNextRun(report, now)

        if (triggeredAt !== null) {
          await this.scheduledReportQueue.add({
            reportId: report.id,
            triggeredAt
          })
        }
      } catch (error) {
        // One broken report must never stop the others from being dispatched
        this.logger.error(
          `Failed to dispatch scheduled report ${report.id}: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
      }
    }
  }
}
