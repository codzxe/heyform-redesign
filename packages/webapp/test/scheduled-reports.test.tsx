// @vitest-environment jsdom
import { getOperationName } from '@apollo/client/utilities'
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import type { ScheduledReport } from '../src/services'
import { unixToDayjs } from '../src/utils'

import {
  CREATE_SCHEDULED_REPORT_GQL,
  DELETE_SCHEDULED_REPORT_GQL,
  SCHEDULED_REPORTS_GQL,
  TIMEZONES,
  UPDATE_SCHEDULED_REPORT_GQL
} from '../src/consts'
import i18n from '../src/i18n'
import FormAnalyticsScheduledReports from '../src/pages/form/Analytics/ScheduledReports'

// Apollo is mocked at the client boundary so the real AnalyticsService GQL
// wiring stays under test while the component renders with mocked payloads.
const { apolloQuery, apolloMutate } = vi.hoisted(() => ({
  apolloQuery: vi.fn(),
  apolloMutate: vi.fn()
}))

vi.mock('@/utils', async importOriginal => {
  const original = await importOriginal<typeof import('../src/utils')>()

  return { ...original, apollo: { query: apolloQuery, mutate: apolloMutate } }
})

let root: Root
let container: HTMLDivElement

const NOW = 1_700_000_000
const DAY = 86_400

const weeklyReport: ScheduledReport = {
  id: 'r1',
  formId: 'form_1',
  frequency: 'weekly',
  dayOfWeek: 1,
  dayOfMonth: null,
  timezone: 'UTC',
  recipients: ['owner@example.com', 'reader@example.com'],
  enabled: true,
  nextRunAt: NOW + DAY,
  lastRunAt: null,
  status: 'active',
  lastError: null,
  createdAt: NOW
}

const monthlyReport: ScheduledReport = {
  id: 'r2',
  formId: 'form_1',
  frequency: 'monthly',
  dayOfWeek: null,
  dayOfMonth: 15,
  timezone: 'UTC',
  recipients: ['owner@example.com'],
  enabled: false,
  nextRunAt: NOW + 2 * DAY,
  lastRunAt: NOW - DAY,
  status: 'paused',
  lastError: 'SMTP refused delivery',
  createdAt: NOW
}

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  await i18n.changeLanguage('en')
  apolloQuery.mockReset()
  apolloMutate.mockReset()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  // Close any alert dialog portal left open on document.body
  document.body.querySelectorAll(':scope > div').forEach(node => node.remove())
  vi.restoreAllMocks()
})

// The form ancestor makes Radix render its hidden native <select>, which is
// how tests drive the themed Select (see next-question-select.test.tsx)
async function renderReports() {
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={['/form/form_1/analytics']}>
        <Routes>
          <Route
            path="/form/:formId/analytics"
            element={
              <form>
                <FormAnalyticsScheduledReports />
              </form>
            }
          />
        </Routes>
      </MemoryRouter>
    )
  )
}

async function click(button: HTMLButtonElement) {
  await act(async () => button.click())
}

function buttonByText(text: string, scope: ParentNode = container) {
  return [...scope.querySelectorAll<HTMLButtonElement>('button')].find(
    row => row.textContent?.trim() === text
  )!
}

function nativeSelectWithOption(label: string): HTMLSelectElement {
  const select = [...document.querySelectorAll<HTMLSelectElement>('select')].find(row =>
    [...row.options].some(option => option.textContent === label)
  )

  expect(select).toBeTruthy()
  return select!
}

// Types like a user: the browser reports the new value, then fires an input event
async function type(input: HTMLInputElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!

  await act(async () => {
    setValue.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function panel(): HTMLElement {
  const card = document.getElementById('report-recipients')!.closest('.hf-card')

  expect(card).toBeTruthy()
  return card!
}

test('an empty report list shows the empty state and asks for the form reports', async () => {
  apolloQuery.mockResolvedValueOnce([])

  await renderReports()

  expect(apolloQuery).toHaveBeenCalledTimes(1)
  expect(apolloQuery.mock.calls[0][0].query).toBe(SCHEDULED_REPORTS_GQL)
  expect(apolloQuery.mock.calls[0][0].variables).toEqual({ input: { formId: 'form_1' } })

  expect(container.textContent).toContain(i18n.t('form.analytics.scheduledReports.empty'))
  expect(container.querySelector('ul')).toBeNull()
  expect(buttonByText(i18n.t('form.analytics.scheduledReports.create'))).toBeTruthy()
})

test('rows show frequency, next run, recipients and enabled status', async () => {
  apolloQuery.mockResolvedValueOnce([weeklyReport, monthlyReport])

  await renderReports()

  const rows = [...container.querySelectorAll('ul > li')]
  expect(rows).toHaveLength(2)

  const [weekly, monthly] = rows

  // Frequency with its day (2023-01-02 was a Monday)
  expect(weekly.querySelector('h4')?.textContent).toBe(
    `${i18n.t('form.analytics.scheduledReports.schedule.weekly')} · Monday`
  )
  expect(monthly.querySelector('h4')?.textContent).toBe(
    `${i18n.t('form.analytics.scheduledReports.schedule.monthly')} · 15`
  )

  // Next run and last sent dates, in the report's own timezone
  expect(weekly.textContent).toContain(
    unixToDayjs(weeklyReport.nextRunAt, 'UTC').locale('en').format('MMM DD, YYYY')
  )
  expect(weekly.textContent).toContain(i18n.t('form.analytics.scheduledReports.neverSent'))
  expect(monthly.textContent).toContain(
    unixToDayjs(monthlyReport.lastRunAt!, 'UTC').locale('en').format('MMM DD, YYYY')
  )

  // Timezone and recipients
  expect(weekly.textContent).toContain(i18n.t('timezones.coordinateduniversal'))
  expect(weekly.textContent).toContain('owner@example.com, reader@example.com')
  expect(monthly.textContent).toContain('owner@example.com')

  // Enabled status: switch state plus a badge on disabled reports
  expect(weekly.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('true')
  expect(weekly.textContent).not.toContain(i18n.t('components.disabled'))
  expect(monthly.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('false')
  expect(monthly.textContent).toContain(i18n.t('components.disabled'))

  // The last delivery error is surfaced
  expect(monthly.textContent).toContain('SMTP refused delivery')
})

test('toggling a report updates it with the new enabled value', async () => {
  apolloQuery.mockResolvedValueOnce([weeklyReport])
  apolloQuery.mockResolvedValueOnce([weeklyReport])
  apolloMutate.mockResolvedValueOnce({ ...weeklyReport, enabled: false })

  await renderReports()

  await click(container.querySelector<HTMLElement>('[role="switch"]')!)

  expect(apolloMutate).toHaveBeenCalledTimes(1)
  const { mutation, variables } = apolloMutate.mock.calls[0][0]

  expect(mutation).toBe(UPDATE_SCHEDULED_REPORT_GQL)
  expect(getOperationName(mutation)).toBe('updateScheduledReport')
  expect(variables).toEqual({
    input: {
      id: 'r1',
      formId: 'form_1',
      frequency: 'weekly',
      timezone: 'UTC',
      recipients: weeklyReport.recipients,
      enabled: false
    }
  })
  // The list refreshes after the update
  expect(apolloQuery).toHaveBeenCalledTimes(2)
})

test('deleting asks for confirmation, calls the mutation and refreshes the list', async () => {
  apolloQuery.mockResolvedValueOnce([monthlyReport])
  apolloQuery.mockResolvedValueOnce([])
  apolloMutate.mockResolvedValueOnce(true)

  await renderReports()

  // The row's delete button (icon-only, labelled for screen readers)
  await click(buttonByText(i18n.t('form.analytics.scheduledReports.delete')))

  // The component confirms through its alert dialog (not window.confirm)
  const dialog = document.querySelector('[role="dialog"]')!
  expect(dialog.textContent).toContain('owner@example.com')

  await click(buttonByText(i18n.t('form.analytics.scheduledReports.delete'), dialog))

  expect(apolloMutate).toHaveBeenCalledTimes(1)
  const { mutation, variables } = apolloMutate.mock.calls[0][0]

  expect(mutation).toBe(DELETE_SCHEDULED_REPORT_GQL)
  expect(getOperationName(mutation)).toBe('deleteScheduledReport')
  expect(variables).toEqual({ input: { formId: 'form_1', id: 'r2' } })

  // The dialog closes and the refreshed list is empty again
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(apolloQuery).toHaveBeenCalledTimes(2)
  expect(container.textContent).toContain(i18n.t('form.analytics.scheduledReports.empty'))
})

test('the create form validates recipients and the monthly day of month', async () => {
  apolloQuery.mockResolvedValueOnce([])

  await renderReports()

  // Open the create form from the empty state
  await click(buttonByText(i18n.t('form.analytics.scheduledReports.create')))

  async function submit() {
    await click(buttonByText(i18n.t('form.analytics.scheduledReports.create'), panel()))
  }

  // Weekly is the default frequency, with a day of week preselected
  expect(container.querySelector('#report-day-of-week')).toBeTruthy()

  // Empty recipients are rejected
  await submit()
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    i18n.t('form.ai.topic.required')
  )
  expect(apolloMutate).not.toHaveBeenCalled()

  // Invalid email addresses are rejected with the offending address
  const recipients = document.querySelector<HTMLInputElement>('#report-recipients')!
  await type(recipients, 'not-an-email')
  await submit()
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    i18n.t('form.settings.emailNotification.recipients.invalid', { email: 'not-an-email' })
  )
  expect(apolloMutate).not.toHaveBeenCalled()

  // Monthly reports need a day of month
  await type(recipients, 'owner@example.com')
  const frequencySelect = nativeSelectWithOption(
    i18n.t('form.analytics.scheduledReports.schedule.monthly')
  )
  await act(async () => {
    frequencySelect.value = 'monthly'
    frequencySelect.dispatchEvent(new Event('change', { bubbles: true }))
  })
  expect(container.querySelector('#report-day-of-month')).toBeTruthy()

  const dayOfMonth = document.querySelector<HTMLInputElement>('#report-day-of-month')!
  await type(dayOfMonth, '')
  await submit()

  expect(container.querySelector('[role="alert"]')).toBeNull() // recipients are valid now
  expect(dayOfMonth.getAttribute('aria-invalid')).toBe('true')
  expect(container.textContent).toContain(i18n.t('form.ai.topic.required'))
  expect(apolloMutate).not.toHaveBeenCalled()
})

test('submitting a monthly report sends its day of month and parsed recipients', async () => {
  apolloQuery.mockResolvedValueOnce([])
  apolloQuery.mockResolvedValueOnce([monthlyReport])
  apolloMutate.mockResolvedValueOnce(monthlyReport)

  await renderReports()

  await click(buttonByText(i18n.t('form.analytics.scheduledReports.create')))

  // Monthly, on the 15th
  const frequencySelect = nativeSelectWithOption(
    i18n.t('form.analytics.scheduledReports.schedule.monthly')
  )
  await act(async () => {
    frequencySelect.value = 'monthly'
    frequencySelect.dispatchEvent(new Event('change', { bubbles: true }))
  })
  const dayOfMonth = document.querySelector<HTMLInputElement>('#report-day-of-month')!
  await type(dayOfMonth, '15')

  // Recipients are split, trimmed, lowercased and de-duplicated
  const recipients = document.querySelector<HTMLInputElement>('#report-recipients')!
  await type(recipients, 'Owner@Example.com, reader@example.com; owner@example.com')

  await click(buttonByText(i18n.t('form.analytics.scheduledReports.create'), panel()))

  expect(apolloMutate).toHaveBeenCalledTimes(1)
  const { mutation, variables } = apolloMutate.mock.calls[0][0]

  expect(mutation).toBe(CREATE_SCHEDULED_REPORT_GQL)
  expect(getOperationName(mutation)).toBe('createScheduledReport')
  expect(variables.input).toMatchObject({
    formId: 'form_1',
    frequency: 'monthly',
    dayOfMonth: 15,
    recipients: ['owner@example.com', 'reader@example.com']
  })
  expect(variables.input.dayOfWeek).toBeUndefined()
  expect(TIMEZONES.some(row => row.value === variables.input.timezone)).toBe(true)

  // The form closes and the refreshed list shows the saved report
  expect(container.querySelector('#report-recipients')).toBeNull()
  expect(container.querySelectorAll('ul > li')).toHaveLength(1)
})

test('submitting a weekly report sends the chosen day of week', async () => {
  apolloQuery.mockResolvedValueOnce([])
  apolloQuery.mockResolvedValueOnce([weeklyReport])
  apolloMutate.mockResolvedValueOnce(weeklyReport)

  await renderReports()

  await click(buttonByText(i18n.t('form.analytics.scheduledReports.create')))

  // Weekly is the default; pick Monday
  const dayOfWeek = nativeSelectWithOption('Monday')
  await act(async () => {
    dayOfWeek.value = '1'
    dayOfWeek.dispatchEvent(new Event('change', { bubbles: true }))
  })

  const recipients = document.querySelector<HTMLInputElement>('#report-recipients')!
  await type(recipients, 'owner@example.com')

  await click(buttonByText(i18n.t('form.analytics.scheduledReports.create'), panel()))

  expect(apolloMutate).toHaveBeenCalledTimes(1)
  const { mutation, variables } = apolloMutate.mock.calls[0][0]

  expect(mutation).toBe(CREATE_SCHEDULED_REPORT_GQL)
  expect(getOperationName(mutation)).toBe('createScheduledReport')
  expect(variables.input).toMatchObject({
    formId: 'form_1',
    frequency: 'weekly',
    dayOfWeek: 1,
    recipients: ['owner@example.com']
  })
  expect(variables.input.dayOfMonth).toBeUndefined()
  expect(container.querySelectorAll('ul > li')).toHaveLength(1)
})
