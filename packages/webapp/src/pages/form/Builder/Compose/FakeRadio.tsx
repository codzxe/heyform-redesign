import type { FC } from 'react'

interface FakeRadioProps extends ComponentProps {
  hotkey?: string
  label: string | number
}

export const FakeRadio: FC<FakeRadioProps> = ({ hotkey, label, ...restProps }) => {
  return (
    <div className="myform-radio" {...restProps}>
      <div className="myform-radio-container">
        <div className="myform-radio-content">
          {hotkey && <div className="myform-radio-hotkey">{hotkey}</div>}
          <div className="myform-radio-label">{label}</div>
        </div>
      </div>
    </div>
  )
}
