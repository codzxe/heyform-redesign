import type { FC } from 'react'

import { IComponentProps } from '../../typings'

export const LogoIcon: FC<IComponentProps<HTMLOrSVGElement>> = props => (
  <svg viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <defs>
<linearGradient id="mg" x1="0" y1="0" x2="96" y2="96" gradientUnits="userSpaceOnUse">
<stop stop-color="#6366F1"/>
<stop offset="1" stop-color="#8B5CF6"/>
</linearGradient>
</defs>
    <path
      d="M12 84V14c0-3.1 3.7-4.72 5.9-2.55L42 35.5c3.3 3.3 8.65 3.3 11.95 0l24.1-24.05C80.25 9.28 84 10.9 84 14v70"
      stroke="url(#mg)"
      stroke-width="12"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
)
