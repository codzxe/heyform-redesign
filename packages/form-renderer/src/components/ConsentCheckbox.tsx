import clsx from 'clsx'
import type { ChangeEvent, FC } from 'react'

import { useTranslation } from '../utils'

import { useStore } from '../store'

interface ConsentCheckboxProps {
  className?: string
}

/**
 * GDPR response consent, rendered above the submit control when the form asks
 * for it. The checked state lives in the store so the submit flow can block an
 * unchecked consent and forward the acceptance to the host.
 */
export const ConsentCheckbox: FC<ConsentCheckboxProps> = ({ className }) => {
  const { state, dispatch } = useStore()
  const { t } = useTranslation()

  if (!state.settings?.enableResponseConsent) {
    return null
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    dispatch({
      type: 'setConsentAccepted',
      payload: {
        consentAccepted: event.target.checked
      }
    })
  }

  const consentText = state.settings.consentText || t('consent.defaultText')

  return (
    <div className={clsx('myform-consent', className)}>
      <label className="myform-consent-label">
        <input
          type="checkbox"
          className="myform-consent-checkbox"
          checked={!!state.consentAccepted}
          onChange={handleChange}
          aria-required="true"
        />
        <span className="myform-consent-text">{consentText}</span>
      </label>
    </div>
  )
}
