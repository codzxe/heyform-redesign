import { BullModule } from '@nestjs/bull'

import { ScheduledReportQueue } from './scheduled-report.queue'
import { BullOptionsFactory } from '@config'

import { DeletionRequestQueue } from './deletion-request.queue'
import { FormReportQueue } from './form-report.queue'
import { IntegrationQueue } from './integration-queue'
import { MailQueue } from './mail.queue'
import { SubmissionNotificationQueue } from './submission-notification.queue'
import { TranscriptionQueue } from './transcription.queue'
import { TranslateFormQueue } from './translate-form.queue'

export const QueueProviders = {
  FormReportQueue,
  MailQueue,
  TranslateFormQueue,
  IntegrationQueue,
  SubmissionNotificationQueue,
  TranscriptionQueue,
  ScheduledReportQueue,
  DeletionRequestQueue
}

export const QueueModules = Object.keys(QueueProviders).map(queueName => {
  return BullModule.registerQueueAsync({
    name: queueName,
    useFactory: BullOptionsFactory
  })
})
