import { IconCalendarTime, IconTrash } from '@tabler/icons-react'
import { useRequest } from 'ahooks'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AnalyticsService, SCHEDULED_REPORT_FREQUENCY_OPTIONS, ScheduledReport } from '@/services'
import { getTimeZone, unixToDayjs, useParam } from '@/utils'
import { helper } from '@myform/utils'

import {
  Badge,
  Button,
  EmptyState,
  Input,
  Select,
  Switch,
  Tooltip,
  useAlert,
  useToast
} from '@/components'
import { DATE_FORMATS, TIMEZONES } from '@/consts'

// Keep in sync with the server's CreateScheduledReportInput (ArrayMaxSize(20))
const MAX_RECIPIENTS = 20
const MIN_DAY_OF_MONTH = 1
const MAX_DAY_OF_MONTH = 28

const RECIPIENTS_SEPARATOR = /[\s,;]/

// 2023-01-01 was a Sunday, so indexes 0 (Sunday) - 6 (Saturday) map onto it
function weekdayName(dayIndex: number, locale: string) {
  return new Date(2023, 0, 1 + dayIndex).toLocaleDateString(locale, { weekday: 'long' })
}

function formatDateTime(timestamp: number, locale: string, timezone?: string) {
  const lowerLocale = locale.toLowerCase()
  const formats = DATE_FORMATS[lowerLocale as keyof typeof DATE_FORMATS] ?? DATE_FORMATS.en

  return unixToDayjs(timestamp, timezone).locale(lowerLocale).format(formats.date)
}

/** Splits free text into trimmed, lowercased, de-duplicated email entries */
function parseRecipients(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(RECIPIENTS_SEPARATOR)
        .map(row => row.trim().toLowerCase())
        .filter(Boolean)
    )
  )
}

/** The browser's timezone when supported, UTC otherwise */
function getDefaultTimezone() {
  const guessed = getTimeZone()

  return TIMEZONES.some(row => row.value === guessed) ? guessed : 'UTC'
}

const ReportsSkeleton = () => (
  <div className="mt-4 space-y-4">
    {[0, 1].map(index => (
      <div className="hf-card space-y-3 p-5" key={index}>
        <div className="skeleton h-5 w-44 rounded-md" />
        <div className="skeleton h-3.5 w-72 rounded-md" />
        <div className="skeleton h-3.5 w-56 rounded-md" />
      </div>
    ))}
  </div>
)

export default function FormAnalyticsScheduledReports() {
  const { t, i18n } = useTranslation()

  const toast = useToast()
  const alert = useAlert()
  const { formId } = useParam()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ScheduledReport>()
  const [frequency, setFrequency] = useState<string>(SCHEDULED_REPORT_FREQUENCY_OPTIONS[0])
  const [dayOfWeek, setDayOfWeek] = useState<number>(new Date().getDay())
  const [dayOfMonth, setDayOfMonth] = useState<number | ''>(MIN_DAY_OF_MONTH)
  const [timezone, setTimezone] = useState<string>(getDefaultTimezone)
  const [recipients, setRecipients] = useState('')
  const [recipientsError, setRecipientsError] = useState<string>()
  const [dayOfMonthError, setDayOfMonthError] = useState<string>()
  const [submitting, setSubmitting] = useState(false)
  const [togglingId, setTogglingId] = useState<string>()

  const {
    loading,
    error: listError,
    data,
    refresh
  } = useRequest(
    async () => {
      // The shared apollo client resolves a query to the first field of its
      // payload (see utils/apollo responseInterceptor), so the awaited value
      // is the ScheduledReport[] itself.
      return (await AnalyticsService.scheduledReports(formId)) as unknown as ScheduledReport[]
    },
    {
      refreshDeps: [formId],
      onError(err) {
        toast({ title: t('components.error.title'), message: err.message })
      }
    }
  )

  const reports = data ?? []

  const frequencyOptions = useMemo(
    () =>
      SCHEDULED_REPORT_FREQUENCY_OPTIONS.map(value => ({
        value,
        label: t(`form.analytics.scheduledReports.schedule.${value}`)
      })),
    [t]
  )

  const dayOfWeekOptions = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => ({
        value: String(index),
        label: weekdayName(index, i18n.language)
      })),
    [i18n.language]
  )

  const timezoneOptions = useMemo(
    () => TIMEZONES.map(row => ({ label: `(GMT${row.gmt}) ${t(row.label)}`, value: row.value })),
    [t]
  )

  function describeSchedule(report: ScheduledReport) {
    const frequencyLabel = t(`form.analytics.scheduledReports.schedule.${report.frequency}`)

    if (report.frequency === 'weekly' && report.dayOfWeek != null) {
      return `${frequencyLabel} · ${weekdayName(report.dayOfWeek, i18n.language)}`
    }

    if (report.frequency === 'monthly' && report.dayOfMonth != null) {
      return `${frequencyLabel} · ${report.dayOfMonth}`
    }

    return frequencyLabel
  }

  function describeTimezone(value: string) {
    const match = TIMEZONES.find(row => row.value === value)

    return match ? `(GMT${match.gmt}) ${t(match.label)}` : value
  }

  function openCreateForm() {
    setEditing(undefined)
    setFrequency(SCHEDULED_REPORT_FREQUENCY_OPTIONS[0])
    setDayOfWeek(new Date().getDay())
    setDayOfMonth(MIN_DAY_OF_MONTH)
    setTimezone(getDefaultTimezone())
    setRecipients('')
    setRecipientsError(undefined)
    setDayOfMonthError(undefined)
    setFormOpen(true)
  }

  function openEditForm(report: ScheduledReport) {
    setEditing(report)
    setFrequency(report.frequency)
    setDayOfWeek(report.dayOfWeek ?? new Date().getDay())
    setDayOfMonth(report.dayOfMonth ?? MIN_DAY_OF_MONTH)
    setTimezone(report.timezone)
    setRecipients(report.recipients.join(', '))
    setRecipientsError(undefined)
    setDayOfMonthError(undefined)
    setFormOpen(true)
  }

  function closeForm() {
    setFormOpen(false)
    setEditing(undefined)
  }

  function validateForm() {
    let nextRecipientsError: string | undefined
    let nextDayOfMonthError: string | undefined

    if (
      frequency === 'monthly' &&
      (typeof dayOfMonth !== 'number' ||
        dayOfMonth < MIN_DAY_OF_MONTH ||
        dayOfMonth > MAX_DAY_OF_MONTH)
    ) {
      nextDayOfMonthError = t('form.ai.topic.required')
    }

    const parsed = parseRecipients(recipients)

    if (parsed.length < 1) {
      nextRecipientsError = t('form.ai.topic.required')
    } else {
      const invalid = parsed.find(email => !helper.isEmail(email))

      if (invalid) {
        nextRecipientsError = t('form.settings.emailNotification.recipients.invalid', {
          email: invalid
        })
      } else if (parsed.length > MAX_RECIPIENTS) {
        nextRecipientsError = t('form.settings.emailNotification.recipients.tooMany', {
          max: MAX_RECIPIENTS
        })
      }
    }

    setRecipientsError(nextRecipientsError)
    setDayOfMonthError(nextDayOfMonthError)

    return !nextRecipientsError && !nextDayOfMonthError
  }

  async function handleSubmit() {
    if (!validateForm()) {
      return
    }

    setSubmitting(true)

    try {
      const parsed = parseRecipients(recipients)
      const schedule =
        frequency === 'weekly'
          ? { dayOfWeek, dayOfMonth: undefined }
          : { dayOfWeek: undefined, dayOfMonth: dayOfMonth as number }

      if (editing) {
        await AnalyticsService.updateScheduledReport({
          id: editing.id,
          formId,
          frequency,
          ...schedule,
          timezone,
          recipients: parsed,
          enabled: editing.enabled
        })
      } else {
        await AnalyticsService.createScheduledReport({
          formId,
          frequency,
          ...schedule,
          timezone,
          recipients: parsed
        })
      }

      toast({ title: t('form.analytics.scheduledReports.saved') })
      closeForm()
      await refresh()
    } catch (err: Any) {
      toast({ title: t('components.error.title'), message: err.message })
    }

    setSubmitting(false)
  }

  async function handleToggle(report: ScheduledReport, next: boolean) {
    setTogglingId(report.id)

    try {
      await AnalyticsService.updateScheduledReport({
        id: report.id,
        formId,
        frequency: report.frequency,
        timezone: report.timezone,
        recipients: report.recipients,
        enabled: next
      })
      await refresh()
    } catch (err: Any) {
      toast({ title: t('components.error.title'), message: err.message })
    }

    setTogglingId(undefined)
  }

  function handleDelete(report: ScheduledReport) {
    alert({
      title: t('form.analytics.scheduledReports.delete'),
      description: `${describeSchedule(report)} · ${report.recipients.join(', ')}`,
      cancelProps: {
        label: t('components.cancel')
      },
      confirmProps: {
        label: t('form.analytics.scheduledReports.delete'),
        className: 'bg-error hover:bg-error text-primary-light dark:text-primary'
      },
      showFetchError: false,
      fetch: async () => {
        try {
          await AnalyticsService.deleteScheduledReport(formId, report.id)
        } catch (err: Any) {
          toast({ title: t('components.error.title'), message: err.message })
          throw err
        }

        await refresh()
      }
    })
  }

  const isLoading = loading && !data

  return (
    <section aria-labelledby="form-analytics-scheduled-reports-title" className="mt-14">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h2 className="hf-section-title font-serif" id="form-analytics-scheduled-reports-title">
            {t('form.analytics.scheduledReports.title')}
          </h2>
          <p className="text-secondary mt-1.5 max-w-xl text-sm/5">
            {t('form.analytics.scheduledReports.description')}
          </p>
        </div>

        {!formOpen && (
          <Button className="shrink-0" size="md" onClick={openCreateForm}>
            {t('form.analytics.scheduledReports.create')}
          </Button>
        )}
      </div>

      {formOpen && (
        <div className="hf-card mt-4 p-5">
          <h3 className="text-base/6 font-semibold">
            {editing ? t('components.edit') : t('form.analytics.scheduledReports.create')}
          </h3>

          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            <div>
              <label
                className="mb-1.5 block text-base/6 font-medium sm:text-sm/6"
                htmlFor="report-frequency"
              >
                {t('form.analytics.scheduledReports.schedule.label')}
              </label>
              <Select
                className="w-full"
                id="report-frequency"
                options={frequencyOptions}
                value={frequency}
                onChange={setFrequency}
              />
            </div>

            {frequency === 'weekly' ? (
              <div>
                <label
                  className="mb-1.5 block text-base/6 font-medium sm:text-sm/6"
                  htmlFor="report-day-of-week"
                >
                  {t('form.analytics.scheduledReports.dayOfWeek')}
                </label>
                <Select
                  className="w-full"
                  id="report-day-of-week"
                  options={dayOfWeekOptions}
                  value={String(dayOfWeek)}
                  onChange={value => setDayOfWeek(Number(value))}
                />
              </div>
            ) : (
              <div>
                <label
                  className="mb-1.5 block text-base/6 font-medium sm:text-sm/6"
                  htmlFor="report-day-of-month"
                >
                  {t('form.analytics.scheduledReports.dayOfMonth')}
                </label>
                <Input
                  aria-invalid={!!dayOfMonthError}
                  className="w-full sm:w-32"
                  hasError={!!dayOfMonthError}
                  id="report-day-of-month"
                  max={MAX_DAY_OF_MONTH}
                  min={MIN_DAY_OF_MONTH}
                  type="number"
                  value={dayOfMonth}
                  onChange={(value: number | '') => {
                    setDayOfMonth(value)
                    if (dayOfMonthError) {
                      setDayOfMonthError(undefined)
                    }
                  }}
                />
                {dayOfMonthError && <p className="text-error mt-1 text-sm/6">{dayOfMonthError}</p>}
              </div>
            )}

            <div className="sm:col-span-2">
              <label
                className="mb-1.5 block text-base/6 font-medium sm:text-sm/6"
                htmlFor="report-timezone"
              >
                {t('form.analytics.scheduledReports.timezone')}
              </label>
              <Select.Native
                className="w-full"
                id="report-timezone"
                options={timezoneOptions}
                value={timezone}
                onChange={setTimezone}
              />
            </div>

            <div className="sm:col-span-2">
              <label
                className="mb-1.5 block text-base/6 font-medium sm:text-sm/6"
                htmlFor="report-recipients"
              >
                {t('form.analytics.scheduledReports.recipients')}
              </label>
              <Input
                aria-invalid={!!recipientsError}
                autoComplete="off"
                className="w-full"
                hasError={!!recipientsError}
                id="report-recipients"
                placeholder={t('form.settings.emailNotification.recipients.placeholder')}
                value={recipients}
                onChange={(value: string) => {
                  setRecipients(value)
                  if (recipientsError) {
                    setRecipientsError(undefined)
                  }
                }}
              />
              {recipientsError ? (
                <p className="text-error mt-1 text-sm/6" role="alert">
                  {recipientsError}
                </p>
              ) : (
                <p className="text-secondary mt-1 text-sm/5">
                  {t('form.analytics.scheduledReports.recipientsHint')}
                </p>
              )}
            </div>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <Button loading={submitting} size="md" onClick={handleSubmit}>
              {editing ? t('components.saveChanges') : t('form.analytics.scheduledReports.create')}
            </Button>
            <Button.Ghost size="md" onClick={closeForm}>
              {t('components.cancel')}
            </Button.Ghost>
          </div>
        </div>
      )}

      {isLoading ? (
        <ReportsSkeleton />
      ) : listError && !data ? (
        <div className="hf-empty-state mt-4 flex flex-col items-center p-10 text-center">
          <p className="text-sm/6 font-medium">{t('components.error.title')}</p>
          <p className="text-secondary mt-1 text-sm/5">{t('components.error.message')}</p>
          <Button.Ghost className="mt-5" size="md" onClick={() => refresh()}>
            {t('components.error.retry')}
          </Button.Ghost>
        </div>
      ) : reports.length < 1 ? (
        <EmptyState
          buttonTitle={t('form.analytics.scheduledReports.create')}
          className="mt-4"
          headline={t('form.analytics.scheduledReports.empty')}
          icon={<IconCalendarTime className="h-10 w-10" />}
          onClick={openCreateForm}
        />
      ) : (
        <ul className="mt-4 space-y-4">
          {reports.map(report => (
            <li className="hf-card p-5" key={report.id}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-base/6 font-semibold">{describeSchedule(report)}</h4>

                    {!report.enabled && <Badge color="zinc">{t('components.disabled')}</Badge>}
                  </div>

                  <dl className="text-secondary mt-2.5 grid grid-cols-1 gap-x-6 gap-y-1 text-sm/5 sm:grid-cols-2">
                    <div className="flex min-w-0 gap-x-2">
                      <dt className="shrink-0">{t('form.analytics.scheduledReports.time')}</dt>
                      <dd className="text-primary truncate">
                        {formatDateTime(report.nextRunAt, i18n.language, report.timezone)}
                      </dd>
                    </div>

                    <div className="flex min-w-0 gap-x-2">
                      <dt className="shrink-0">
                        {t('form.analytics.scheduledReports.lastSentAt')}
                      </dt>
                      <dd className="text-primary truncate">
                        {report.lastRunAt
                          ? formatDateTime(report.lastRunAt, i18n.language, report.timezone)
                          : t('form.analytics.scheduledReports.neverSent')}
                      </dd>
                    </div>

                    <div className="flex min-w-0 gap-x-2">
                      <dt className="shrink-0">{t('form.analytics.scheduledReports.timezone')}</dt>
                      <dd className="text-primary truncate">{describeTimezone(report.timezone)}</dd>
                    </div>

                    <div className="flex min-w-0 gap-x-2">
                      <dt className="shrink-0">
                        {t('form.analytics.scheduledReports.recipients')}
                      </dt>
                      <dd className="text-primary truncate" title={report.recipients.join(', ')}>
                        {report.recipients.join(', ')}
                      </dd>
                    </div>
                  </dl>

                  {report.lastError && (
                    <p className="text-error mt-2.5 text-sm/5" role="alert">
                      {report.lastError}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="flex items-center gap-2">
                    <Switch
                      value={report.enabled}
                      loading={togglingId === report.id}
                      onChange={next => handleToggle(report, next)}
                    />
                    <span className="text-secondary text-sm/5">
                      {t('form.analytics.scheduledReports.enabled')}
                    </span>
                  </div>

                  <Button.Ghost size="sm" onClick={() => openEditForm(report)}>
                    {t('components.edit')}
                  </Button.Ghost>

                  <Tooltip label={t('form.analytics.scheduledReports.delete')}>
                    <Button.Link
                      className="text-error hover:text-error"
                      iconOnly
                      size="sm"
                      onClick={() => handleDelete(report)}
                    >
                      <span className="sr-only">{t('form.analytics.scheduledReports.delete')}</span>
                      <IconTrash className="h-5 w-5" />
                    </Button.Link>
                  </Tooltip>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
