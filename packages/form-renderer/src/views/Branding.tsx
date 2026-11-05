import { FC } from 'react'
import { Trans } from 'react-i18next'

import { LogoIcon } from '../components'
import { useStore } from '../store'

export const Branding: FC = () => {
  const websiteURL: string =
    (typeof window !== 'undefined' && (window as any).myform?.websiteURL) || '#'
  const { state } = useStore()

  if (state.settings?.removeBranding) {
    return null
  }

  return (
    <a className="myform-branding" href={websiteURL} target="_blank" rel="noreferrer">
      <Trans
        i18nKey="Made with MyForm"
        components={{
          icon: <LogoIcon className="inline h-4 w-4" />,
          span: <span className="font-medium" />
        }}
      />
    </a>
  )
}

export const WelcomeBranding: FC = () => {
  return (
    <div className="myform-footer myform-welcome-footer">
      <div className="myform-footer-wrapper">
        <div className="myform-footer-left" />
        <div className="myform-footer-right">
          <Branding />
        </div>
      </div>
    </div>
  )
}
