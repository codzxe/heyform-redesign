import { FC } from 'react'

import { toFixed } from '@myform/utils'

interface DistributionBarsProps {
  items: Array<{ label: string; count: number }>
}

/**
 * Horizontal label + count + share bars, rendered with plain divs so the
 * shared (public) dashboard stays light and accessible.
 */
const DistributionBars: FC<DistributionBarsProps> = ({ items }) => {
  const total = items.reduce((sum, item) => sum + item.count, 0)

  return (
    <div className="space-y-3.5">
      {items.map(item => {
        const pct = total > 0 ? (item.count / total) * 100 : 0
        // Keep a visible sliver for non-zero counts on heavily skewed data.
        const width = item.count > 0 ? Math.max(pct, 2) : 0

        return (
          <div key={item.label}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate">{item.label}</span>
              <span className="text-secondary shrink-0 tabular-nums">
                {item.count} · {toFixed(pct, 1)}%
              </span>
            </div>
            <div
              className="bg-secondary-light mt-1.5 h-1.5 overflow-hidden rounded-full"
              role="presentation"
            >
              <div
                className="h-full rounded-full"
                style={{ width: `${width}%`, background: 'rgba(var(--hf-brand), 0.8)' }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default DistributionBars
