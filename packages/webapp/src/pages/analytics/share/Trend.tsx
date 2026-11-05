import dayjs from 'dayjs'
import { FC } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'

import { TrendPoint } from '@/services'

interface TrendSectionProps {
  points: TrendPoint[]
}

/**
 * The "trends" metric group of a shared dashboard: responses over time as an
 * area chart. The chart colors come from the app's theme via `currentColor`
 * (the wrapper sets `color` to the brand color) and CSS overrides on Recharts'
 * stable class names, so it follows light/dark mode without JS.
 */
const TrendSection: FC<TrendSectionProps> = ({ points }) => {
  const { t } = useTranslation()

  return (
    <section className="mt-10" aria-label={t('form.analytics.responseTrend')}>
      <h2 className="hf-section-title">{t('form.analytics.responseTrend')}</h2>

      <div className="hf-card mt-4 p-5">
        <div className="text-brand [&_.recharts-cartesian-axis-tick-value]:fill-secondary [&_.recharts-cartesian-grid-horizontal_line]:stroke-accent-light [&_.recharts-tooltip-cursor]:stroke-accent h-64 w-full sm:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
              <CartesianGrid vertical={false} strokeDasharray="4 4" />
              <XAxis
                dataKey="date"
                tickFormatter={(value: string) => dayjs(value).format('MMM D')}
                axisLine={false}
                tickLine={false}
                tickMargin={8}
                minTickGap={24}
              />
              <YAxis axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                cursor={{ strokeDasharray: '4 4' }}
                contentStyle={{
                  borderRadius: 12,
                  border: '1px solid rgba(var(--hf-dashboard-border))',
                  background: 'rgba(var(--hf-foreground))',
                  boxShadow: 'var(--hf-dashboard-shadow)',
                  fontSize: '0.75rem'
                }}
                labelStyle={{ color: 'rgba(var(--hf-secondary))', marginBottom: 4 }}
                itemStyle={{ color: 'rgba(var(--hf-primary))' }}
                labelFormatter={value => dayjs(String(value)).format('MMM D, YYYY')}
              />
              <Area
                dataKey="count"
                name={t('form.analytics.responses')}
                type="monotone"
                stroke="currentColor"
                strokeWidth={2}
                fill="currentColor"
                fillOpacity={0.12}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  )
}

export default TrendSection
