import { FC } from 'react'
import { useTranslation } from 'react-i18next'

import { BreakdownItem, PublicDashboardData } from '@/services'
import { helper, toDuration, toFixed } from '@myform/utils'

import DistributionBars from './DistributionBars'

interface OverviewSectionProps {
  data: PublicDashboardData
}

interface BreakdownCardProps {
  title: string
  items: BreakdownItem[]
}

function isNonEmpty(value: BreakdownItem[] | undefined): value is BreakdownItem[] {
  return Array.isArray(value) && value.length > 0
}

const BreakdownCard: FC<BreakdownCardProps> = ({ title, items }) => {
  return (
    <div className="hf-card p-5">
      <h3 className="text-secondary text-sm/6 font-medium">{title}</h3>
      <div className="mt-4">
        <DistributionBars items={items} />
      </div>
    </div>
  )
}

/**
 * The "overview" metric group of a shared dashboard: headline stat cards,
 * device/browser breakdowns, media response counts and quiz performance.
 * Every block is defensive about optional payload fields — only the data the
 * share permits (and the server actually has) is rendered.
 */
const OverviewSection: FC<OverviewSectionProps> = ({ data }) => {
  const { t } = useTranslation()

  const stats: Array<{ kind: string; label: string; value: string }> = []

  if (helper.isValid(data.totalVisits)) {
    stats.push({
      kind: 'visits',
      label: t('form.analytics.visits'),
      value: `${data.totalVisits}`
    })
  }

  if (helper.isValid(data.totalResponses)) {
    stats.push({
      kind: 'responses',
      label: t('form.analytics.responses'),
      value: `${data.totalResponses}`
    })
  }

  if (helper.isValid(data.completionRate)) {
    stats.push({
      kind: 'completionRate',
      label: t('form.analytics.completionRate'),
      value: `${toFixed(data.completionRate!)}%`
    })
  }

  if (helper.isValid(data.abandonmentRate)) {
    stats.push({
      kind: 'abandonmentRate',
      label: t('form.analytics.abandonmentRate'),
      value: `${toFixed(data.abandonmentRate!)}%`
    })
  }

  if (helper.isValid(data.avgCompletionTimeSeconds)) {
    stats.push({
      kind: 'avgCompletionTime',
      label: t('form.analytics.avgCompletionTime'),
      value: toDuration(Math.round(data.avgCompletionTimeSeconds!))
    })
  }

  const mediaChips = data.mediaCounts
    ? [
        { label: t('form.analytics.mediaCounts.voice'), count: data.mediaCounts.voice },
        { label: t('form.analytics.mediaCounts.video'), count: data.mediaCounts.video },
        { label: t('form.analytics.mediaCounts.screen'), count: data.mediaCounts.screen }
      ]
    : []

  return (
    <section aria-label={t('form.analytics.title')}>
      {stats.length > 0 && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {stats.map(stat => (
            <div key={stat.kind} className="hf-card p-5">
              <div className="text-secondary text-sm/6 font-medium">{stat.label}</div>
              <div className="mt-3 font-serif text-3xl/9 font-semibold tabular-nums tracking-tight">
                {stat.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {(isNonEmpty(data.deviceBreakdown) || isNonEmpty(data.browserBreakdown)) && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {isNonEmpty(data.deviceBreakdown) && (
            <BreakdownCard
              title={t('form.analytics.deviceBreakdown')}
              items={data.deviceBreakdown}
            />
          )}
          {isNonEmpty(data.browserBreakdown) && (
            <BreakdownCard
              title={t('form.analytics.browserBreakdown')}
              items={data.browserBreakdown}
            />
          )}
        </div>
      )}

      {(mediaChips.length > 0 || data.quiz) && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {mediaChips.length > 0 && (
            <div className="hf-card p-5">
              <h3 className="text-secondary text-sm/6 font-medium">
                {t('form.analytics.mediaCounts.label')}
              </h3>
              <div className="mt-4 flex flex-wrap gap-2">
                {mediaChips.map(chip => (
                  <span
                    key={chip.label}
                    className="bg-secondary-light inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm"
                  >
                    {chip.label}
                    <span className="font-semibold tabular-nums">{chip.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {data.quiz && (
            <div className="hf-card p-5">
              <h3 className="text-secondary text-sm/6 font-medium">
                {t('form.analytics.quizPerformance.label')}
              </h3>
              <dl className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
                <div>
                  <dt className="hf-label-muted">{t('form.analytics.quizPerformance.avgScore')}</dt>
                  <dd className="mt-1 text-xl font-semibold tabular-nums">
                    {toFixed(data.quiz.averageScore)}
                    <span className="text-secondary ml-1 text-sm font-normal">
                      ({toFixed(data.quiz.averagePercentage)}%)
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="hf-label-muted">
                    {t('form.analytics.quizPerformance.passingRate')}
                  </dt>
                  <dd className="mt-1 text-xl font-semibold tabular-nums">
                    {toFixed(data.quiz.passingRate)}%
                  </dd>
                </div>
                <div>
                  <dt className="hf-label-muted">{t('form.analytics.responses')}</dt>
                  <dd className="mt-1 text-xl font-semibold tabular-nums">
                    {data.quiz.responseCount}
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

export default OverviewSection
