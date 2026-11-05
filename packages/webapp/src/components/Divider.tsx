import { FC } from 'react'

import { cn } from '@/utils'

export const Divider: FC<ComponentProps> = ({ className, children, ...restProps }) => {
  return (
    <div className={cn('relative', className)} {...restProps}>
      <div className="absolute inset-0 flex items-center">
        <span className="border-input w-full border-t"></span>
      </div>
      <div className="relative flex justify-center text-xs uppercase" data-slot="content">
        <span className="bg-foreground text-secondary dark:text-[rgb(201_198_187)] px-2" data-slot="text">
          {children}
        </span>
      </div>
    </div>
  )
}
