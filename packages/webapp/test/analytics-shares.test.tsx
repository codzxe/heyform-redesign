// @vitest-environment jsdom
import { getOperationName } from '@apollo/client/utilities'
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import type { DashboardShare } from '../src/services'
import { unixToDayjs } from '../src/utils'

import {
  CREATE_DASHBOARD_SHARE_GQL,
  DASHBOARD_SHARES_GQL,
  REVOKE_DASHBOARD_SHARE_GQL
} from '../src/consts'
import i18n from '../src/i18n'
import FormAnalyticsShares from '../src/pages/form/Analytics/Shares'

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

const activeShare: DashboardShare = {
  id: 'share_1',
  token: 'token-1',
  url: 'https://myform.test/share/token-1',
  metrics: ['overview', 'trends', 'questions'],
  expiresAt: NOW + 30 * 86_400,
  revokedAt: null,
  createdAt: NOW
}

const revokedShare: DashboardShare = {
  id: 'share_2',
  token: 'token-2',
  url: 'https://myform.test/share/token-2',
  metrics: ['heatmap'],
  expiresAt: null,
  revokedAt: NOW + 120,
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
async function renderShares() {
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={['/form/form_1/analytics']}>
        <Routes>
          <Route
            path="/form/:formId/analytics"
            element={
              <form>
                <FormAnalyticsShares />
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

test('an empty share list shows the empty state and asks for the form shares', async () => {
  apolloQuery.mockResolvedValueOnce([])

  await renderShares()

  expect(apolloQuery).toHaveBeenCalledTimes(1)
  expect(apolloQuery.mock.calls[0][0].query).toBe(DASHBOARD_SHARES_GQL)
  expect(apolloQuery.mock.calls[0][0].variables).toEqual({ input: { formId: 'form_1' } })

  expect(container.textContent).toContain(i18n.t('form.analytics.share.empty'))
  expect(container.querySelector('ul')).toBeNull()
  // The empty state offers to create the first share link
  expect(buttonByText(i18n.t('form.analytics.share.create'))).toBeTruthy()
})

test('rows show metric chips, expiry dates and a disabled revoke for revoked links', async () => {
  apolloQuery.mockResolvedValueOnce([activeShare, revokedShare])

  await renderShares()

  const rows = [...container.querySelectorAll('ul > li')]
  expect(rows).toHaveLength(2)

  const [active, revoked] = rows

  // Metric chips are the translated labels of the shared metrics
  expect(active.textContent).toContain(i18n.t('dashboard.overview'))
  expect(active.textContent).toContain(i18n.t('form.analytics.responseTrend'))
  expect(active.textContent).toContain(i18n.t('form.builder.sidebar.questions'))
  expect(active.textContent).not.toContain(i18n.t('form.analytics.share.revoked'))
  // The expiry date uses the shared date format
  expect(active.textContent).toContain(
    unixToDayjs(activeShare.expiresAt!).locale('en').format('MMM DD, YYYY')
  )

  expect(revoked.textContent).toContain(i18n.t('form.analytics.heatmap.title'))
  expect(revoked.textContent).toContain(i18n.t('form.analytics.share.revoked'))
  expect(revoked.textContent).toContain(i18n.t('form.analytics.share.neverExpires'))

  const revokeButtons = rows.map(row => buttonByText(i18n.t('form.analytics.share.revoke'), row))
  expect(revokeButtons[0].disabled).toBe(false)
  expect(revokeButtons[1].disabled).toBe(true)
})

test('creating a share sends the chosen metrics and expiry, then reveals the one-time URL', async () => {
  const created: DashboardShare = {
    id: 'share_3',
    token: 'token-3',
    url: 'https://myform.test/share/token-3',
    metrics: ['overview', 'trends', 'heatmap'],
    expiresAt: null,
    revokedAt: null,
    createdAt: NOW
  }

  apolloQuery.mockResolvedValueOnce([activeShare])
  apolloQuery.mockResolvedValueOnce([activeShare, created])
  apolloMutate.mockResolvedValueOnce(created)

  await renderShares()

  // Open the create panel from the section header
  await click(buttonByText(i18n.t('form.analytics.share.create')))

  // Every metric starts checked
  const checkboxes = () => [...container.querySelectorAll('[role="checkbox"]')]
  expect(checkboxes().map(row => row.getAttribute('aria-checked'))).toEqual([
    'true',
    'true',
    'true',
    'true'
  ])

  // Deselect "Questions" so only the other three metrics are shared
  const questions = checkboxes().find(row =>
    row.closest('label')?.textContent?.includes(i18n.t('form.builder.sidebar.questions'))
  )!
  await act(async () => questions.click())
  expect(questions.getAttribute('aria-checked')).toBe('false')

  // Expire the link after 30 days through the themed select's native twin
  const thirtyDays = `30 ${i18n.t('form.settings.access.countdown.days')}`
  const expirySelect = nativeSelectWithOption(thirtyDays)

  await act(async () => {
    expirySelect.value = '30'
    expirySelect.dispatchEvent(new Event('change', { bubbles: true }))
  })
  expect(container.querySelector('#share-expiry')?.textContent).toContain(thirtyDays)

  // Submit the create panel
  const panel = container.querySelector('fieldset')!.closest('.hf-card')!
  await click(buttonByText(i18n.t('form.analytics.share.create'), panel))

  expect(apolloMutate).toHaveBeenCalledTimes(1)
  const { mutation, variables } = apolloMutate.mock.calls[0][0]

  expect(mutation).toBe(CREATE_DASHBOARD_SHARE_GQL)
  expect(getOperationName(mutation)).toBe('createDashboardShare')
  expect(variables).toEqual({
    input: {
      formId: 'form_1',
      metrics: ['overview', 'trends', 'heatmap'],
      expiresInDays: 30
    }
  })

  // The one-time URL is revealed and the list refreshes with the new link
  expect(container.querySelector('code')?.textContent).toBe(created.url)
  expect(container.querySelector('[role="status"]')?.textContent).toContain(
    i18n.t('form.analytics.share.created')
  )
  expect(apolloQuery).toHaveBeenCalledTimes(2)
  expect(container.querySelectorAll('ul > li')).toHaveLength(2)
})

test('revoking asks for confirmation, calls the mutation and refreshes the list', async () => {
  apolloQuery.mockResolvedValueOnce([activeShare])
  apolloQuery.mockResolvedValueOnce([{ ...activeShare, revokedAt: NOW + 500 }])
  apolloMutate.mockResolvedValueOnce(true)

  await renderShares()

  await click(buttonByText(i18n.t('form.analytics.share.revoke')))

  // The component confirms through its alert dialog (not window.confirm)
  const dialog = document.querySelector('[role="dialog"]')!
  expect(dialog.textContent).toContain(i18n.t('dashboard.overview'))

  await act(async () => buttonByText(i18n.t('form.analytics.share.revoke'), dialog).click())

  expect(apolloMutate).toHaveBeenCalledTimes(1)
  const { mutation, variables } = apolloMutate.mock.calls[0][0]

  expect(mutation).toBe(REVOKE_DASHBOARD_SHARE_GQL)
  expect(getOperationName(mutation)).toBe('revokeDashboardShare')
  expect(variables).toEqual({ input: { shareId: 'share_1' } })

  // The dialog closes and the refreshed list marks the link as revoked
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(apolloQuery).toHaveBeenCalledTimes(2)
  expect(container.textContent).toContain(i18n.t('form.analytics.share.revoked'))
  expect(buttonByText(i18n.t('form.analytics.share.revoke')).disabled).toBe(true)
})

test('a failing list request surfaces the error state with a retry', async () => {
  apolloQuery.mockRejectedValueOnce(new Error('offline'))

  await renderShares()

  expect(container.textContent).toContain(i18n.t('components.error.title'))

  apolloQuery.mockResolvedValueOnce([activeShare])
  await click(buttonByText(i18n.t('components.error.retry')))

  expect(apolloQuery).toHaveBeenCalledTimes(2)
  expect(container.querySelectorAll('ul > li')).toHaveLength(1)
})
