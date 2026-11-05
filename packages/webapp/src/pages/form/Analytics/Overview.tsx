import {
  IconCircleCheck,
  IconClock,
  IconEye,
  IconInbox,
  IconTrendingDown,
  IconTrendingUp
} from '@tabler/icons-react'
import { useRequest } from 'ahooks'
import { FC, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { FormService } from '@/services'
import { useParam } from '@/utils'
import { helper, toDuration, toFixed } from '@myform/utils'

import { Select, Skeleton } from '@/components'

interface TrendIndicatorProps {
  change: number | null
  label: string
}

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

const TrendIndicator: FC<TrendIndicatorProps> = ({ change, label }) => {
  const { t } = useTranslation()

  if (helper.isNull(change)) {
    return null
  }

  return (
    <div className="mt-2 flex items-center gap-1.5 text-xs/5">
      {change! > 0 ? (
        <IconTrendingUp className="h-3.5 w-3.5 text-green-700" />
      ) : (
        <IconTrendingDown className="h-3.5 w-3.5 text-red-700" />
      )}
      <span className="text-secondary">
        {t(label, {
          change: (change! > 0 ? '+' : '') + toFixed(change!)
        })}
      </span>
    </div>
  )
}

/* Pastel icon chips — one accent per metric */
const STAT_CHIPS: AnyMap = {
  views: {
    icon: <IconEye className="h-4.5 w-4.5" style={{ color: 'rgb(38 53 43)' }} />,
    background: 'rgb(38 53 43 / 0.08)'
  },
  submissions: {
    icon: <IconInbox className="h-4.5 w-4.5" style={{ color: 'rgb(180 101 63)' }} />,
    background: 'rgb(180 101 63 / 0.1)'
  },
  completeRate: {
    icon: <IconCircleCheck className="h-4.5 w-4.5" style={{ color: 'rgb(22 122 86)' }} />,
    background: 'rgb(22 122 86 / 0.1)'
  },
  averageTime: {
    icon: <IconClock className="h-4.5 w-4.5" style={{ color: 'rgb(95 69 103)' }} />,
    background: 'rgb(95 69 103 / 0.1)'
  }
}

function StatChip({ kind }: { kind: string }) {
  const chip = STAT_CHIPS[kind]

  if (!chip) {
    return null
  }

  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl [&_svg]:h-[1.125rem] [&_svg]:w-[1.125rem]"
      style={{ background: chip.background }}
    >
      {chip.icon}
    </div>
  )
}

export default function FormAnalyticsOverview() {
  const { t } = useTranslation()

  const { formId } = useParam()
  const [range, setRange] = useState('7d')

  const { loading, data } = useRequest(
    async () => {
      return FormService.analytic(formId, range)
    },
    {
      refreshDeps: [formId, range]
    }
  )

  const stats = useMemo(
    () => [
      {
        kind: 'views',
        label: t('form.analytics.views'),
        value: data?.totalVisits.value,
        change: data?.totalVisits.change,
        skeletonWidth: 'w-16'
      },
      {
        kind: 'submissions',
        label: t('form.submissions.title'),
        value: data?.submissionCount.value,
        change: data?.submissionCount.change,
        skeletonWidth: 'w-20'
      },
      {
        kind: 'completeRate',
        label: t('form.analytics.completeRate'),
        value: `${toFixed(data?.completeRate.value || 0)}%`,
        change: data?.completeRate.change,
        skeletonWidth: 'w-14'
      },
      {
        kind: 'averageTime',
        label: t('form.analytics.averageDuration'),
        value: toDuration(Math.round(data?.averageTime.value || 0)),
        change: data?.averageTime.change,
        skeletonWidth: 'w-24'
      }
    ],
    [data, t]
  )

  return (
    <>
      <div className="mt-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <h2 className="hf-section-title font-serif">{t('dashboard.overview')}</h2>
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

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(stat => (
          <div key={stat.kind} className="hf-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="text-sm/6 font-medium text-secondary">{stat.label}</div>
              <StatChip kind={stat.kind} />
            </div>

            <Skeleton
              className="mt-3 h-9 [&_[data-slot=skeleton]]:h-8 [&_[data-slot=skeleton]]:w-16"
              loading={loading}
            >
              <div className="font-serif mt-3 text-3xl/9 font-semibold tracking-tight">
                {stat.value}
              </div>
            </Skeleton>

            <Skeleton
              className="mt-1 h-5 [&_[data-slot=skeleton]]:h-[0.875rem] [&_[data-slot=skeleton]]:w-40"
              loading={loading}
            >
              <TrendIndicator change={stat.change} label={`form.analytics.${range}Trend`} />
            </Skeleton>
          </div>
        ))}
      </div>
    </>
  )
}
