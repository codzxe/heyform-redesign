import { BullModule } from '@nestjs/bull'

import { CleanResponseSessionsSchedule } from './clean-response-sessions.schedule'
import { DeleteFormInTrashSchedule } from './delete-form-in-trash.schedule'
import { DeleteUserAccountSchedule } from './delete-user-account.schedule'
import { ResetInviteCodeSchedule } from './reset-invite-code.schedule'
import { RetentionSchedule } from './retention.schedule'
import { ScheduledReportSchedule } from './scheduled-report.schedule'
import { BullOptionsFactory } from '@config'

export const ScheduleProviders = {
  DeleteFormInTrashSchedule,
  ResetInviteCodeSchedule,
  DeleteUserAccountSchedule,
  CleanResponseSessionsSchedule,
  RetentionSchedule,
  ScheduledReportSchedule
}

export const ScheduleModules = Object.keys(ScheduleProviders).map(scheduleName => {
  return BullModule.registerQueueAsync({
    name: scheduleName,
    useFactory: BullOptionsFactory
  })
})
