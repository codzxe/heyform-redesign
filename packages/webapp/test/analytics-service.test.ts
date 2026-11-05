// @vitest-environment jsdom
import { getOperationName, print } from '@apollo/client/utilities'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { AnalyticsService } from '../src/services/analytics'

import {
  CREATE_DASHBOARD_SHARE_GQL,
  CREATE_SCHEDULED_REPORT_GQL,
  DASHBOARD_SHARES_GQL,
  DELETE_SCHEDULED_REPORT_GQL,
  FORM_ANALYTICS_OVERVIEW_GQL,
  FORM_HEATMAP_GQL,
  REVOKE_DASHBOARD_SHARE_GQL,
  SCHEDULED_REPORTS_GQL,
  UPDATE_SCHEDULED_REPORT_GQL
} from '../src/consts'

// Apollo and fetch are mocked at their boundary so the real AnalyticsService —
// its GQL documents, variables and response handling — stays under test.
const { apolloQuery, apolloMutate, fetchMock } = vi.hoisted(() => ({
  apolloQuery: vi.fn(),
  apolloMutate: vi.fn(),
  fetchMock: vi.fn()
}))

vi.mock('@/utils', () => ({
  apollo: { query: apolloQuery, mutate: apolloMutate }
}))

// publicDashboard only reads status/ok/json — a minimal Response stand-in
function jsonResponse(payload: Any, status: number) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => payload
  }
}

beforeEach(() => {
  apolloQuery.mockReset()
  apolloMutate.mockReset()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => vi.unstubAllGlobals())

test('overview queries the analytics overview with form and range', async () => {
  const payload = { totalVisits: 10, totalResponses: 4 }
  apolloQuery.mockResolvedValueOnce(payload)

  await expect(AnalyticsService.overview('form_1', '7d')).resolves.toBe(payload)

  expect(apolloQuery).toHaveBeenCalledTimes(1)
  const { query, variables } = apolloQuery.mock.calls[0][0]

  expect(query).toBe(FORM_ANALYTICS_OVERVIEW_GQL)
  expect(getOperationName(query)).toBe('formAnalyticsOverview')
  // The document selects the full overview fragment
  const document = print(query)
  expect(document).toContain('avgCompletionTimeSeconds')
  expect(document).toContain('responseTrend')
  expect(document).toContain('mediaCounts')
  expect(document).toContain('quiz')
  expect(variables).toEqual({ input: { formId: 'form_1', range: '7d' } })
})

test('heatmap queries the question heatmap with form and range', async () => {
  const payload = [{ fieldId: 'q1', visits: 5 }]
  apolloQuery.mockResolvedValueOnce(payload)

  await expect(AnalyticsService.heatmap('form_2', '30d')).resolves.toBe(payload)

  const { query, variables } = apolloQuery.mock.calls[0][0]

  expect(query).toBe(FORM_HEATMAP_GQL)
  expect(getOperationName(query)).toBe('formHeatmap')
  const document = print(query)
  expect(document).toContain('avgTimeMs')
  expect(document).toContain('answerChanges')
  expect(document).toContain('validationErrors')
  expect(document).toContain('abandonments')
  expect(variables).toEqual({ input: { formId: 'form_2', range: '30d' } })
})

test('dashboardShares lists the form dashboard shares', async () => {
  const payload = [{ id: 'share_1' }]
  apolloQuery.mockResolvedValueOnce(payload)

  await expect(AnalyticsService.dashboardShares('form_1')).resolves.toBe(payload)

  const { query, variables } = apolloQuery.mock.calls[0][0]

  expect(query).toBe(DASHBOARD_SHARES_GQL)
  expect(getOperationName(query)).toBe('dashboardShares')
  const document = print(query)
  expect(document).toContain('token')
  expect(document).toContain('metrics')
  expect(document).toContain('revokedAt')
  expect(variables).toEqual({ input: { formId: 'form_1' } })
})

test('createDashboardShare mutates with metrics and expiry', async () => {
  const payload = { id: 'share_1', url: 'https://myform.test/s/token' }
  apolloMutate.mockResolvedValueOnce(payload)

  await expect(
    AnalyticsService.createDashboardShare({
      formId: 'form_1',
      metrics: ['overview', 'trends'],
      expiresInDays: 30
    })
  ).resolves.toBe(payload)

  expect(apolloMutate).toHaveBeenCalledTimes(1)
  const { mutation, variables } = apolloMutate.mock.calls[0][0]

  expect(mutation).toBe(CREATE_DASHBOARD_SHARE_GQL)
  expect(getOperationName(mutation)).toBe('createDashboardShare')
  expect(variables).toEqual({
    input: { formId: 'form_1', metrics: ['overview', 'trends'], expiresInDays: 30 }
  })
})

test('createDashboardShare omits expiresInDays when the link never expires', async () => {
  apolloMutate.mockResolvedValueOnce({ id: 'share_2' })

  await AnalyticsService.createDashboardShare({ formId: 'form_1', metrics: ['heatmap'] })

  expect(apolloMutate.mock.calls[0][0].variables).toEqual({
    input: { formId: 'form_1', metrics: ['heatmap'] }
  })
})

test('revokeDashboardShare mutates with the share id', async () => {
  apolloMutate.mockResolvedValueOnce(true)

  await expect(AnalyticsService.revokeDashboardShare('share_1')).resolves.toBe(true)

  const { mutation, variables } = apolloMutate.mock.calls[0][0]

  expect(mutation).toBe(REVOKE_DASHBOARD_SHARE_GQL)
  expect(getOperationName(mutation)).toBe('revokeDashboardShare')
  expect(variables).toEqual({ input: { shareId: 'share_1' } })
})

test('scheduledReports lists the form scheduled reports', async () => {
  const payload = [{ id: 'r1' }]
  apolloQuery.mockResolvedValueOnce(payload)

  await expect(AnalyticsService.scheduledReports('form_1')).resolves.toBe(payload)

  const { query, variables } = apolloQuery.mock.calls[0][0]

  expect(query).toBe(SCHEDULED_REPORTS_GQL)
  expect(getOperationName(query)).toBe('scheduledReports')
  const document = print(query)
  expect(document).toContain('nextRunAt')
  expect(document).toContain('lastRunAt')
  expect(document).toContain('lastError')
  expect(variables).toEqual({ input: { formId: 'form_1' } })
})

test('createScheduledReport mutates with the full schedule', async () => {
  const payload = { id: 'r1', frequency: 'weekly' }
  apolloMutate.mockResolvedValueOnce(payload)

  await expect(
    AnalyticsService.createScheduledReport({
      formId: 'form_1',
      frequency: 'weekly',
      dayOfWeek: 1,
      timezone: 'UTC',
      recipients: ['owner@example.com'],
      enabled: true
    })
  ).resolves.toBe(payload)

  const { mutation, variables } = apolloMutate.mock.calls[0][0]

  expect(mutation).toBe(CREATE_SCHEDULED_REPORT_GQL)
  expect(getOperationName(mutation)).toBe('createScheduledReport')
  expect(variables).toEqual({
    input: {
      formId: 'form_1',
      frequency: 'weekly',
      dayOfWeek: 1,
      timezone: 'UTC',
      recipients: ['owner@example.com'],
      enabled: true
    }
  })
})

test('updateScheduledReport mutates with the report id and changes', async () => {
  const payload = { id: 'r2', enabled: false }
  apolloMutate.mockResolvedValueOnce(payload)

  await expect(
    AnalyticsService.updateScheduledReport({
      id: 'r2',
      formId: 'form_1',
      frequency: 'monthly',
      dayOfMonth: 15,
      timezone: 'UTC',
      recipients: ['reader@example.com'],
      enabled: false
    })
  ).resolves.toBe(payload)

  const { mutation, variables } = apolloMutate.mock.calls[0][0]

  expect(mutation).toBe(UPDATE_SCHEDULED_REPORT_GQL)
  expect(getOperationName(mutation)).toBe('updateScheduledReport')
  expect(variables).toEqual({
    input: {
      id: 'r2',
      formId: 'form_1',
      frequency: 'monthly',
      dayOfMonth: 15,
      timezone: 'UTC',
      recipients: ['reader@example.com'],
      enabled: false
    }
  })
})

test('deleteScheduledReport mutates with form and report ids', async () => {
  apolloMutate.mockResolvedValueOnce(true)

  await expect(AnalyticsService.deleteScheduledReport('form_1', 'r2')).resolves.toBe(true)

  const { mutation, variables } = apolloMutate.mock.calls[0][0]

  expect(mutation).toBe(DELETE_SCHEDULED_REPORT_GQL)
  expect(getOperationName(mutation)).toBe('deleteScheduledReport')
  expect(variables).toEqual({ input: { formId: 'form_1', id: 'r2' } })
})

test('publicDashboard returns null for a 404 and encodes the token into a relative URL', async () => {
  fetchMock.mockResolvedValueOnce(jsonResponse({}, 404))

  await expect(AnalyticsService.publicDashboard('tok en/1')).resolves.toBeNull()

  expect(fetchMock).toHaveBeenCalledTimes(1)
  const [url, init] = fetchMock.mock.calls[0]

  // Relative, deployment-independent URL with the token encoded
  expect(url).toBe('/api/public/dashboard/tok%20en%2F1')
  expect(String(url).startsWith('/')).toBe(true)
  expect(init).toEqual({ headers: { Accept: 'application/json' } })
})

test('publicDashboard throws for other failed responses', async () => {
  fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'boom' }, 500))

  await expect(AnalyticsService.publicDashboard('token-1')).rejects.toThrow(
    'Failed to load shared dashboard (500)'
  )
})

test('publicDashboard parses the JSON payload of a valid share', async () => {
  const payload = {
    formName: 'Customer Feedback',
    range: '7d',
    metrics: ['overview'],
    totalVisits: 12
  }
  fetchMock.mockResolvedValueOnce(jsonResponse(payload, 200))

  await expect(AnalyticsService.publicDashboard('token-1')).resolves.toEqual(payload)

  expect(fetchMock.mock.calls[0][0]).toBe('/api/public/dashboard/token-1')
})
