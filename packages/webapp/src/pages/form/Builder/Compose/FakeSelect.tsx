import { IconChevronDown } from '@tabler/icons-react'
import type { FC } from 'react'

export const FakeSelect: FC<ComponentProps & { placeholder?: string }> = ({
  placeholder,
  ...restProps
}) => {
  return (
    <div className="myform-select" {...restProps}>
      <div className="myform-select-container">
        {/* @ts-ignore */}
        <span className="myform-select-value" placeholder={placeholder} />
        <span className="myform-select-arrow-icon">
          <IconChevronDown />
        </span>
      </div>
    </div>
  )
}
