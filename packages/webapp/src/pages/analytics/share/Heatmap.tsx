import { FC } from 'react'
import { useTranslation } from 'react-i18next'

import { PublicDashboardData } from '@/services'
import { toDuration } from '@myform/utils'

import { EmptyState } from '@/components'

// Heatmap rows of the public payload: FormHeatmapItem enriched with the
// question title resolved server-side (PublicHeatmapItemType on the server).
export type PublicHeatmapItem = NonNullable<PublicDashboardData['heatmap']>[number]

interface HeatmapSectionProps {
  items: PublicHeatmapItem[]
}

type NumericColumn = 'visits' | 'avgTimeMs' | 'answerChanges' | 'validationErrors' | 'abandonments'

/** Columns tinted with the error color (friction / drop-off); the rest use the brand color. */
const ERROR_COLUMNS: NumericColumn[] = ['answerChanges', 'validationErrors', 'abandonments']

/**
 * The "heatmap" metric group of a shared dashboard. Each numeric cell is
 * tinted in proportion to its value relative to the maximum of its own
 * column, so hot spots stand out without exposing any respondent data.
 */
const HeatmapSection: FC<HeatmapSectionProps> = ({ items }) => {
  const { t } = useTranslation()

  if (items.length === 0) {
    return (
      <section className="mt-10">
        <h2 className="hf-section-title">{t('form.analytics.heatmap.title')}</h2>
        <div className="mt-4">
          <EmptyState headline={t('form.analytics.heatmap.empty')} />
        </div>
      </section>
    )
  }

  const columnMax = (column: NumericColumn): number =>
    items.reduce((max, item) => Math.max(max, item[column]), 0)

  const tint = (column: NumericColumn, value: number): string => {
    const max = columnMax(column)
    const ratio = max > 0 ? value / max : 0
    const alpha = 0.05 + 0.3 * ratio
    const channels = ERROR_COLUMNS.includes(column) ? 'var(--hf-error)' : 'var(--hf-brand)'

    return `rgba(${channels}, ${alpha.toFixed(3)})`
  }

  const columns: Array<{ key: NumericColumn; label: string; format: (value: number) => string }> = [
    {
      key: 'visits',
      label: t('form.analytics.heatmap.visits'),
      format: value => `${value}`
    },
    {
      key: 'avgTimeMs',
      label: t('form.analytics.heatmap.avgTime'),
      format: value => toDuration(Math.round(value / 1000))
    },
    {
      key: 'answerChanges',
      label: t('form.analytics.heatmap.answerChanges'),
      format: value => `${value}`
    },
    {
      key: 'validationErrors',
      label: t('form.analytics.heatmap.validationErrors'),
      format: value => `${value}`
    },
    {
      key: 'abandonments',
      label: t('form.analytics.heatmap.abandonments'),
      format: value => `${value}`
    }
  ]

  return (
    <section className="mt-10" aria-label={t('form.analytics.heatmap.title')}>
      <h2 className="hf-section-title">{t('form.analytics.heatmap.title')}</h2>
      <p className="text-secondary mt-1 max-w-2xl text-sm/6">
        {t('form.analytics.heatmap.description')}
      </p>

      <div className="hf-table-shell mt-4">
        <table className="hf-table w-full min-w-[680px]">
          <thead>
            <tr>
              <th>{t('form.analytics.heatmap.question')}</th>
              {columns.map(column => (
                <th key={column.key} className="text-right">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.fieldId}>
                <td className="max-w-56 truncate font-medium" title={item.title}>
                  {item.title}
                </td>
                {columns.map(column => (
                  <td key={column.key} className="text-right">
                    <span
                      className="inline-flex min-w-12 justify-center rounded-md px-2 py-1 text-sm tabular-nums"
                      style={{ background: tint(column.key, item[column.key]) }}
                    >
                      {column.format(item[column.key])}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-secondary mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: 'rgba(var(--hf-brand), 0.35)' }}
            aria-hidden="true"
          />
          {t('form.analytics.heatmap.legend.moreTime')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: 'rgba(var(--hf-error), 0.35)' }}
            aria-hidden="true"
          />
          {t('form.analytics.heatmap.legend.moreIssues')}
        </span>
      </div>
    </section>
  )
}

export default HeatmapSection
