import { Injectable } from '@nestjs/common'

import { Cron } from '@nestjs/schedule'
import { ResponseSessionService } from '@service'
import { Logger } from '@utils'

/**
 * A finished session is kept for a day after its submission completed, so a
 * form submitted twice in quick succession stays deduplicated, and then purged
 * nightly so saved answers do not linger in the database.
 */
@Injectable()
export class CleanResponseSessionsSchedule {
  private readonly logger = new Logger('CleanResponseSessionsSchedule')

  constructor(private readonly responseSessionService: ResponseSessionService) {}

  @Cron('0 3 * * *')
  async cleanResponseSessions(): Promise<void> {
    const deletedCount = await this.responseSessionService.purgeCompleted()

    this.logger.info(`Deleted ${deletedCount} completed response session(s)`)
  }
}
