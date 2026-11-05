import type { FC } from 'react'

import type { BlockProps } from './Block'
import { Block } from './Block'

export const ThankYou: FC<BlockProps> = ({ field, locale, ...restProps }) => {
  return (
    <Block
      className="myform-thank-you myform-empty-state"
      field={field}
      locale={locale}
      {...restProps}
    />
  )
}
