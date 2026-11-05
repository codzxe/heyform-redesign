import { Injectable } from '@nestjs/common'

import { RetentionService, RetentionSummary } from '../service/retention.service'
import { Cron } from '@nestjs/schedule'
import { Logger } from '@utils'

/**
 * GDPR data retention purge, daily at 04:00 server time. The summary of what
 * was deleted is logged so operators can trace purge volume.
 */
@Injectable()
export class RetentionSchedule {
  private readonly logger = new Logger('RetentionSchedule')

  constructor(private readonly retentionService: RetentionService) {}

  @Cron('0 4 * * *')
  async applyRetention(): Promise<RetentionSummary> {
    const summary = await this.retentionService.applyRetention()

    this.logger.info(
      `Retention purge: ${summary.formsPurged}/${summary.formsScanned} form(s) purged — ` +
        `${summary.submissions} submissions, ${summary.mediaAssets} media assets, ` +
        `${summary.consentRecords} consent records, ${summary.responseSessions} response sessions, ` +
        `${summary.analyticsEvents} analytics events deleted`
    )

    return summary
  }
}
