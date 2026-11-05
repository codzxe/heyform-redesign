import type { Layout as FormLayout } from '@myform/shared-types-enums'
import type { FC } from 'react'
import { memo } from 'react'

import { isURL } from '../utils'
import { deepEqual, helper } from '@myform/utils'

function filterStyle(brightness?: number) {
  if (!brightness) {
    return undefined
  }

  const value = 1 + brightness / 100

  if (value < 0) {
    return {
      filter: `brightness(${value})`
    }
  }

  return {
    filter: `contrast(${2 - value}) brightness(${value})`
  }
}

const LayoutComponent: FC<FormLayout> = props => {
  if (helper.isEmpty(props) || !isURL(props!.mediaUrl)) {
    return null
  }

  return (
    <div className={`myform-layout myform-layout-${props!.align}`}>
      <img
        src={props!.mediaUrl}
        style={filterStyle(props!.brightness)}
        alt="MyForm layout image"
      />
    </div>
  )
}

export const Layout = memo(LayoutComponent, deepEqual)
