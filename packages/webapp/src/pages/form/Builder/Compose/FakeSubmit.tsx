import type { FC, ReactNode } from 'react'

interface FakeSubmitProps extends ComponentProps {
  text?: string
  icon?: ReactNode
}

export const FakeSubmit: FC<FakeSubmitProps> = ({ text, icon, ...restProps }) => {
  return (
    <div className="myform-submit-container" {...restProps}>
      <div className="myform-submit-button">
        <span>{text}</span>
        {icon}
      </div>
    </div>
  )
}
