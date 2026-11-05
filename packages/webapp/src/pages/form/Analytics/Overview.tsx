import {
  IconChartArea,
  IconCircleCheck,
  IconCircleX,
  IconClock,
  IconEye,
  IconInbox,
  IconMicrophone,
  IconScreenShare,
  IconVideo
} from '@tabler/icons-react'
import { useRequest } from 'ahooks'
import dayjs from 'dayjs'
import { FC, ReactNode, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  TooltipContentProps,
  XAxis,
  YAxis
} from 'recharts'

import {
  AnalyticsService,
  type BreakdownItem,
  type FormAnalyticsOverview,
  type MediaCounts
} from '@/services'
import { useParam } from '@/utils'
import { toDuration, toFixed } from '@myform/utils'

import { EmptyState, Select, Skeleton } from '@/components'

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

/**
 * Warm editorial chart palette — consistent with the dashboard stat chips
 * (forest green brand, terracotta, emerald, plum) extended with gold and sage.
 */
const CHART_COLORS = [
  '#26352B', // forest green — brand
  '#B4653F', // terracotta
  '#167A56', // emerald
  '#5F4567', // plum
  '#C9A227', // warm gold
  '#6B8F71' // sage
]

const TREND_GRADIENT_ID = 'hf-analytics-trend-gradient'

/* Pastel icon chips — one accent per metric */
const STAT_CHIPS: AnyMap = {
  visits: {
    icon: <IconEye className="h-4.5 w-4.5" style={{ color: 'rgb(38 53 43)' }} />,
    background: 'rgb(38 53 43 / 0.08)'
  },
  responses: {
    icon: <IconInbox className="h-4.5 w-4.5" style={{ color: 'rgb(180 101 63)' }} />,
    background: 'rgb(180 101 63 / 0.1)'
  },
  completionRate: {
    icon: <IconCircleCheck className="h-4.5 w-4.5" style={{ color: 'rgb(22 122 86)' }} />,
    background: 'rgb(22 122 86 / 0.1)'
  },
  abandonmentRate: {
    icon: <IconCircleX className="h-4.5 w-4.5" style={{ color: 'rgb(200 53 52)' }} />,
    background: 'rgb(200 53 52 / 0.1)'
  },
  avgCompletionTime: {
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

interface MediaChip {
  kind: keyof MediaCounts
  label: string
  icon: ReactNode
  background: string
}

const MEDIA_CHIPS: MediaChip[] = [
  {
    kind: 'voice',
    label: 'form.analytics.mediaCounts.voice',
    icon: <IconMicrophone className="h-4.5 w-4.5" style={{ color: 'rgb(180 101 63)' }} />,
    background: 'rgb(180 101 63 / 0.1)'
  },
  {
    kind: 'video',
    label: 'form.analytics.mediaCounts.video',
    icon: <IconVideo className="h-4.5 w-4.5" style={{ color: 'rgb(95 69 103)' }} />,
    background: 'rgb(95 69 103 / 0.1)'
  },
  {
    kind: 'screen',
    label: 'form.analytics.mediaCounts.screen',
    icon: <IconScreenShare className="h-4.5 w-4.5" style={{ color: 'rgb(22 122 86)' }} />,
    background: 'rgb(22 122 86 / 0.1)'
  }
]

/* Theme-aware tooltip — colors come from Tailwind CSS variables */
const TrendTooltip: FC<Partial<TooltipContentProps>> = ({ active, payload, label }) => {
  const { t, i18n } = useTranslation()

  if (!active || !payload?.length) {
    return null
  }

  return (
    <div className="bg-foreground border-input rounded-xl border px-3 py-2 shadow-md">
      <div className="text-secondary text-xs/5">
        {dayjs(String(label)).locale(i18n.language.toLowerCase()).format('MMM D, YYYY')}
      </div>
      <div className="mt-1 text-sm/6 font-medium tabular-nums">
        {payload[0]?.value} · {t('form.analytics.responses')}
      </div>
    </div>
  )
}

interface BreakdownCardProps {
  title: string
  items?: BreakdownItem[]
  loading?: boolean
}

const BreakdownCard: FC<BreakdownCardProps> = ({ title, items, loading }) => {
  const list = useMemo(() => (items || []).filter(row => row.count > 0), [items])
  const total = useMemo(() => list.reduce((prev, next) => prev + next.count, 0), [list])

  return (
    <div className="hf-card p-5">
      <h3 className="text-sm/6 font-semibold">{title}</h3>

      <Skeleton
        className="mt-4 h-40 w-full [&_[data-slot=skeleton]]:h-40 [&_[data-slot=skeleton]]:w-full"
        loading={loading}
      >
        {list.length === 0 || total === 0 ? (
          <div className="text-secondary flex h-40 items-center justify-center text-sm/6">—</div>
        ) : (
          <div className="mt-4 flex items-center gap-6">
            <div className="h-40 w-40 shrink-0" role="img" aria-label={title}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={list}
                    dataKey="count"
                    nameKey="label"
                    innerRadius="60%"
                    outerRadius="92%"
                    paddingAngle={2}
                    strokeWidth={0}
                  >
                    {list.map((row, index) => (
                      <Cell key={row.label} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>

            <ul className="min-w-0 flex-1 space-y-2">
              {list.map((row, index) => (
                <li key={row.label} className="flex items-center gap-2 text-sm/5">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: CHART_COLORS[index % CHART_COLORS.length] }}
                  />
                  <span className="text-secondary min-w-0 flex-1 truncate">{row.label}</span>
                  <span className="font-medium tabular-nums">{row.count}</span>
                  <span className="text-secondary w-12 text-right text-xs/5 tabular-nums">
                    {toFixed((row.count * 100) / total, 1)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Skeleton>
    </div>
  )
}

export default function FormAnalyticsOverview() {
  const { t, i18n } = useTranslation()

  const { formId } = useParam()
  const [range, setRange] = useState('7d')

  const { loading, data } = useRequest(
    async () => {
      // The shared apollo client resolves a query to the first field of its
      // payload (see utils/apollo responseInterceptor), so the awaited value
      // is the FormAnalyticsOverview itself.
      return (await AnalyticsService.overview(formId, range)) as unknown as FormAnalyticsOverview
    },
    {
      refreshDeps: [formId, range]
    }
  )

  const stats = useMemo(
    () => [
      {
        kind: 'visits',
        label: t('form.analytics.visits'),
        value: data?.totalVisits ?? 0
      },
      {
        kind: 'responses',
        label: t('form.analytics.responses'),
        value: data?.totalResponses ?? 0
      },
      {
        kind: 'completionRate',
        label: t('form.analytics.completionRate'),
        value: `${toFixed(data?.completionRate ?? 0)}%`
      },
      {
        kind: 'abandonmentRate',
        label: t('form.analytics.abandonmentRate'),
        value: `${toFixed(data?.abandonmentRate ?? 0)}%`
      },
      {
        kind: 'avgCompletionTime',
        label: t('form.analytics.avgCompletionTime'),
        value: toDuration(Math.round(data?.avgCompletionTimeSeconds ?? 0))
      }
    ],
    [data, t]
  )

  const isEmpty = useMemo(
    () => !loading && (data?.totalVisits ?? 0) === 0 && (data?.totalResponses ?? 0) === 0,
    [data?.totalVisits, data?.totalResponses, loading]
  )

  const formatTrendDate = (date: string) =>
    dayjs(date).locale(i18n.language.toLowerCase()).format('MMM D')

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

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {stats.map(stat => (
          <div key={stat.kind} className="hf-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="text-secondary text-sm/6 font-medium">{stat.label}</div>
              <StatChip kind={stat.kind} />
            </div>

            <Skeleton
              className="mt-3 h-9 [&_[data-slot=skeleton]]:h-8 [&_[data-slot=skeleton]]:w-16"
              loading={loading}
            >
              <div className="mt-3 font-serif text-3xl/9 font-semibold tabular-nums tracking-tight">
                {stat.value}
              </div>
            </Skeleton>
          </div>
        ))}
      </div>

      {isEmpty ? (
        <EmptyState
          className="mt-4"
          icon={<IconChartArea className="h-10 w-10" />}
          headline={t('form.analytics.report.submission_zero')}
        />
      ) : (
        <>
          {/* Response trend */}
          <div className="hf-card mt-4 p-5">
            <h3 className="text-sm/6 font-semibold">{t('form.analytics.responseTrend')}</h3>

            <Skeleton
              className="mt-4 h-64 w-full [&_[data-slot=skeleton]]:h-60 [&_[data-slot=skeleton]]:w-full"
              loading={loading}
            >
              <div
                className="mt-4 h-64 w-full"
                role="img"
                aria-label={t('form.analytics.responseTrend')}
                style={{ color: 'rgb(var(--hf-brand))' }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={data?.responseTrend || []}
                    margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
                  >
                    <defs>
                      <linearGradient id={TREND_GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="currentColor" stopOpacity={0.22} />
                        <stop offset="100%" stopColor="currentColor" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>

                    <CartesianGrid
                      stroke="#9C988E"
                      strokeOpacity={0.3}
                      strokeDasharray="4 4"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatTrendDate}
                      tick={{ fill: '#9C988E', fontSize: 12 }}
                      tickLine={false}
                      axisLine={{ stroke: '#9C988E', strokeOpacity: 0.3 }}
                      tickMargin={8}
                      minTickGap={32}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fill: '#9C988E', fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                      width={32}
                    />
                    <Tooltip
                      cursor={{ stroke: '#9C988E', strokeOpacity: 0.4 }}
                      content={<TrendTooltip />}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="currentColor"
                      strokeWidth={2}
                      fill={`url(#${TREND_GRADIENT_ID})`}
                      activeDot={{ r: 4, strokeWidth: 0 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Skeleton>
          </div>

          {/* Device + browser breakdown */}
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <BreakdownCard
              title={t('form.analytics.deviceBreakdown')}
              items={data?.deviceBreakdown}
              loading={loading}
            />
            <BreakdownCard
              title={t('form.analytics.browserBreakdown')}
              items={data?.browserBreakdown}
              loading={loading}
            />
          </div>

          {/* Media responses */}
          <div className="hf-card mt-4 p-5">
            <h3 className="text-sm/6 font-semibold">{t('form.analytics.mediaCounts.label')}</h3>

            <Skeleton
              className="mt-4 w-full [&_[data-slot=skeleton]]:h-16 [&_[data-slot=skeleton]]:w-full"
              loading={loading}
            >
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {MEDIA_CHIPS.map(chip => (
                  <div key={chip.kind} className="hf-card-muted flex items-center gap-3 p-3.5">
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl [&_svg]:h-[1.125rem] [&_svg]:w-[1.125rem]"
                      style={{ background: chip.background }}
                    >
                      {chip.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="text-secondary text-sm/5">{t(chip.label)}</div>
                      <div className="text-lg/7 font-semibold tabular-nums">
                        {data?.mediaCounts?.[chip.kind] ?? 0}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Skeleton>
          </div>

          {/* Quiz performance — quiz forms only */}
          {data?.quiz != null && (
            <div className="hf-card mt-4 p-5">
              <h3 className="text-sm/6 font-semibold">
                {t('form.analytics.quizPerformance.label')}
              </h3>

              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div className="hf-card-muted p-4">
                  <div className="text-secondary text-sm/5 font-medium">
                    {t('form.analytics.quizPerformance.avgScore')}
                  </div>
                  <div className="mt-2 font-serif text-2xl/8 font-semibold tabular-nums tracking-tight">
                    {toFixed(data.quiz.averageScore ?? 0)} / {toFixed(data.quiz.highestScore ?? 0)}
                  </div>
                  <div className="text-secondary mt-1 text-xs/5 tabular-nums">
                    {toFixed(data.quiz.averagePercentage ?? 0)}%
                  </div>
                </div>

                <div className="hf-card-muted p-4">
                  <div className="text-secondary text-sm/5 font-medium">
                    {t('form.analytics.quizPerformance.passingRate')}
                  </div>
                  <div className="mt-2 font-serif text-2xl/8 font-semibold tabular-nums tracking-tight">
                    {toFixed(data.quiz.passingRate ?? 0)}%
                  </div>
                </div>

                <div className="hf-card-muted p-4">
                  <div className="text-secondary text-sm/5 font-medium">
                    {t('form.analytics.responses')}
                  </div>
                  <div className="mt-2 font-serif text-2xl/8 font-semibold tabular-nums tracking-tight">
                    {data.quiz.responseCount ?? 0}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </>
  )
}
