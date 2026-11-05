import { IconFlame } from '@tabler/icons-react'
import { useRequest } from 'ahooks'
import { CSSProperties, FC, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AnalyticsService, type FormHeatmapItem } from '@/services'
import { useParam } from '@/utils'
import { helper, toDuration } from '@myform/utils'

import { EmptyState, Select } from '@/components'
import { useFormStore } from '@/store'

const ANALYTIC_RANGES = [
  {
    label: 'form.analytics.7d',
    value: '7d'
  },
  {
    label: 'form.analytics.1m',
    value: '1m'
  },
  {
    label: 'form.analytics.3m',
    value: '3m'
  },
  {
    label: 'form.analytics.6m',
    value: '6m'
  },
  {
    label: 'form.analytics.1y',
    value: '1y'
  }
]

const NUMERIC_KEYS = [
  'visits',
  'avgTimeMs',
  'answerChanges',
  'validationErrors',
  'abandonments'
] as const

type NumericKey = (typeof NUMERIC_KEYS)[number]

/** Background tint per column — warm editorial palette (rgb channels) */
const HEAT_TINTS: Record<NumericKey, string> = {
  visits: '38, 53, 43', // forest green — neutral traffic
  avgTimeMs: '201, 162, 39', // warm gold — time spent
  answerChanges: '38, 53, 43', // forest green — neutral edits
  validationErrors: '180, 101, 63', // terracotta — issues
  abandonments: '180, 101, 63' // terracotta — drop-off
}

/** Opacity scales with value / column max — no tint for zero values */
function heatStyle(value: number, max: number, rgb: string): CSSProperties {
  if (!(value > 0) || max <= 0) {
    return {}
  }

  const ratio = Math.min(value / max, 1)

  return {
    backgroundColor: `rgba(${rgb}, ${(0.08 + ratio * 0.4).toFixed(3)})`
  }
}

interface LegendChipProps {
  color: string
  label: string
}

const LegendChip: FC<LegendChipProps> = ({ color, label }) => (
  <span className="inline-flex items-center gap-1.5">
    <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color }} />
    {label}
  </span>
)

export default function FormAnalyticsHeatmap() {
  const { t } = useTranslation()

  const { formId } = useParam()
  const [range, setRange] = useState('7d')

  const formFields = useFormStore(state => state.formFields)

  const { loading, data } = useRequest(
    async () => {
      // The shared apollo client resolves a query to the first field of its
      // payload (see utils/apollo responseInterceptor), so the awaited value
      // is the FormHeatmapItem[] itself.
      return (await AnalyticsService.heatmap(formId, range)) as unknown as FormHeatmapItem[]
    },
    {
      refreshDeps: [formId, range]
    }
  )

  const rows = useMemo(() => data || [], [data])

  const fieldTitles = useMemo(() => {
    const titles = new Map<string, string>()

    formFields.forEach(field => {
      if (field?.id && helper.isValid(field.title)) {
        titles.set(String(field.id), String(field.title))
      }
    })

    return titles
  }, [formFields])

  const columns = useMemo<Array<{ key: NumericKey; label: string }>>(
    () => [
      { key: 'visits', label: t('form.analytics.heatmap.visits') },
      { key: 'avgTimeMs', label: t('form.analytics.heatmap.avgTime') },
      { key: 'answerChanges', label: t('form.analytics.heatmap.answerChanges') },
      { key: 'validationErrors', label: t('form.analytics.heatmap.validationErrors') },
      { key: 'abandonments', label: t('form.analytics.heatmap.abandonments') }
    ],
    [t]
  )

  const columnMax = useMemo(() => {
    const max = {} as Record<NumericKey, number>

    NUMERIC_KEYS.forEach(key => {
      max[key] = rows.reduce((prev, next) => Math.max(prev, next[key] || 0), 0)
    })

    return max
  }, [rows])

  const showSkeleton = loading && !data
  const isEmpty = !showSkeleton && rows.length === 0

  function questionTitle(fieldId: string) {
    const title = fieldTitles.get(fieldId)

    if (title) {
      return title
    }

    return fieldId.length > 12 ? `${fieldId.slice(0, 12)}…` : fieldId
  }

  function formatCell(column: NumericKey, row: FormHeatmapItem) {
    if (column === 'avgTimeMs') {
      return toDuration(Math.round((row.avgTimeMs || 0) / 1000))
    }

    return row[column] ?? 0
  }

  return (
    <section className="mt-10" aria-label={t('form.analytics.heatmap.title')}>
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <h2 className="hf-section-title font-serif">{t('form.analytics.heatmap.title')}</h2>
          <p className="text-secondary mt-1.5 text-sm/6">
            {t('form.analytics.heatmap.description')}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
          <div className="text-secondary flex items-center gap-4 text-xs/5">
            <LegendChip
              color="rgb(201 162 39)"
              label={t('form.analytics.heatmap.legend.moreTime')}
            />
            <LegendChip
              color="rgb(180 101 63)"
              label={t('form.analytics.heatmap.legend.moreIssues')}
            />
          </div>

          <Select
            className="w-full sm:w-40"
            value={range}
            options={ANALYTIC_RANGES}
            placeholder={t('form.analytics.7d')}
            disabled={loading}
            multiLanguage
            onChange={setRange}
          />
        </div>
      </div>

      {isEmpty ? (
        <EmptyState
          className="mt-4"
          icon={<IconFlame className="h-10 w-10" />}
          headline={t('form.analytics.heatmap.empty')}
        />
      ) : (
        <div className="hf-table-shell scrollbar mt-4">
          <table className="hf-table w-full min-w-[44rem] text-left">
            <thead>
              <tr>
                <th scope="col">{t('form.analytics.heatmap.question')}</th>
                {columns.map(column => (
                  <th key={column.key} scope="col" className="text-right">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {showSkeleton
                ? Array.from({ length: 5 }).map((_, index) => (
                    <tr key={`skeleton-${index}`}>
                      <td colSpan={columns.length + 1}>
                        <div
                          className="skeleton h-4 rounded-sm"
                          style={{ width: `${90 - index * 6}%` }}
                        />
                      </td>
                    </tr>
                  ))
                : rows.map(row => (
                    <tr key={row.fieldId}>
                      <td className="max-w-80">
                        <div className="truncate" title={questionTitle(row.fieldId)}>
                          {questionTitle(row.fieldId)}
                        </div>
                      </td>

                      {columns.map(column => (
                        <td
                          key={column.key}
                          className="text-right tabular-nums"
                          style={heatStyle(
                            row[column.key] || 0,
                            columnMax[column.key],
                            HEAT_TINTS[column.key]
                          )}
                        >
                          {formatCell(column.key, row)}
                        </td>
                      ))}
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
