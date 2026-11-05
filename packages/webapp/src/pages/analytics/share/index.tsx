import { IconAlertTriangle, IconLinkOff, IconLock } from '@tabler/icons-react'
import { useRequest } from 'ahooks'
import { FC, ReactNode, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'

import { AnalyticsService } from '@/services'

import Logo from '@/assets/logo.svg?react'
import { Button, Loader } from '@/components'

import HeatmapSection from './Heatmap'
import OverviewSection from './Overview'
import QuestionsSection from './Questions'
import TrendSection from './Trend'

const RANGE_LABELS: Record<string, string> = {
  '7d': 'form.analytics.7d',
  '1m': 'form.analytics.1m',
  '3m': 'form.analytics.3m',
  '6m': 'form.analytics.6m',
  '1y': 'form.analytics.1y'
}

/**
 * Standalone page chrome for the public dashboard: MyForm wordmark, content
 * area and a "Powered by MyForm" footer that sticks to the bottom of the
 * viewport. No navigation back into the workspace.
 */
const PageShell: FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <div className="bg-background flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center gap-2.5 px-4 pt-6 sm:px-6 lg:pt-10">
        <Logo className="h-7 w-auto" aria-hidden="true" />
        <span className="text-lg font-semibold tracking-tight">MyForm</span>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-12 sm:px-6">{children}</main>

      <footer className="text-secondary pb-8 pt-6 text-center text-xs">Powered by MyForm</footer>
    </div>
  )
}

function isValidArray<T>(value: T[] | undefined): value is T[] {
  return Array.isArray(value) && value.length > 0
}

/**
 * Public, read-only analytics dashboard served at /analytics/share/:token.
 * The token resolves via GET /api/public/dashboard/:token; a null payload
 * means the link is invalid, expired or revoked. Only aggregate data is ever
 * rendered — nothing that could identify a respondent.
 */
const PublicDashboardShare: FC = () => {
  const { t } = useTranslation()
  const { token } = useParams<{ token: string }>()

  const { loading, error, data, refresh } = useRequest(
    () => AnalyticsService.publicDashboard(token ?? ''),
    {
      refreshDeps: [token]
    }
  )

  useEffect(() => {
    document.title = data ? `${data.formName} - MyForm` : `${t('form.analytics.title')} - MyForm`
  }, [data, t])

  if (loading) {
    return (
      <PageShell>
        <div className="flex min-h-[50vh] items-center justify-center" role="status">
          <Loader className="text-secondary h-8 w-8" />
          <span className="sr-only">{t('form.analytics.title')}</span>
        </div>
      </PageShell>
    )
  }

  if (error) {
    return (
      <PageShell>
        <div className="flex min-h-[50vh] flex-col items-center justify-center py-16 text-center">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-full"
            style={{ background: 'rgba(var(--hf-error), 0.08)' }}
          >
            <IconAlertTriangle className="h-7 w-7" style={{ color: 'rgb(var(--hf-error))' }} />
          </div>
          <h1 className="mt-6 text-xl font-semibold">{t('components.error.title')}</h1>
          <p className="text-secondary mt-2 max-w-md text-sm/6">{t('components.error.message')}</p>
          <Button className="mt-6" size="md" onClick={() => refresh()}>
            {t('components.error.retry')}
          </Button>
        </div>
      </PageShell>
    )
  }

  if (!data) {
    return (
      <PageShell>
        <div className="flex min-h-[50vh] flex-col items-center justify-center py-16 text-center">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-full"
            style={{ background: 'rgba(var(--hf-brand), 0.08)' }}
          >
            <IconLinkOff className="text-secondary h-7 w-7" />
          </div>
          <h1 className="mt-6 max-w-md text-balance text-xl font-semibold">
            {t('form.analytics.share.invalidOrExpired')}
          </h1>
        </div>
      </PageShell>
    )
  }

  const rangeKey = RANGE_LABELS[data.range]
  const hasMetric = (metric: string) => (data.metrics ?? []).includes(metric)

  return (
    <PageShell>
      <div className="mt-8 lg:mt-12">
        <h1 className="text-balance font-serif text-3xl/9 font-semibold tracking-tight sm:text-4xl/10">
          {data.formName}
        </h1>
        <p className="text-secondary mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span>{t('form.analytics.title')}</span>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1.5">
            <IconLock className="h-3.5 w-3.5" aria-hidden="true" />
            Shared read-only dashboard
          </span>
          {rangeKey && (
            <>
              <span aria-hidden="true">·</span>
              <span>{t(rangeKey)}</span>
            </>
          )}
        </p>
      </div>

      {hasMetric('overview') && <OverviewSection data={data} />}

      {hasMetric('trends') && isValidArray(data.responseTrend) && (
        <TrendSection points={data.responseTrend} />
      )}

      {hasMetric('questions') && isValidArray(data.questions) && (
        <QuestionsSection questions={data.questions} />
      )}

      {hasMetric('heatmap') && <HeatmapSection items={data.heatmap ?? []} />}
    </PageShell>
  )
}

export default PublicDashboardShare
