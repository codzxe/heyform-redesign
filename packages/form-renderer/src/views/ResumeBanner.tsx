import type { FC } from 'react'
import { useEffect, useState } from 'react'

import { useTranslation } from '../utils'
import {
  clearResumeQueryParam,
  clearResumeToken,
  deserializeSessionAnswers,
  deserializeSessionVariables,
  getSavedResumeToken,
  resumeResponseSessionRequest,
  saveResumeToken
} from '../utils/resume'
import type { ResumedResponseSession } from '../utils/resume'

import { removeStorage, useStore } from '../store'

/**
 * Save & resume: after the form opens, a session saved on this device (or one
 * reached through the ?resume= link parameter) is offered back to the
 * respondent. "Continue" restores the answers and jumps to where they stopped;
 * "Start over" clears the remembered token and begins from scratch.
 */
export const ResumeBanner: FC = () => {
  const { state, dispatch } = useStore()
  const { t } = useTranslation()
  const [session, setSession] = useState<ResumedResponseSession | null>(null)
  const [resumeToken, setResumeToken] = useState<string>()

  // The banner only makes sense before the respondent has moved on.
  const isEligible = !state.isSubmitted && (state.passedFieldIds?.length ?? 0) === 0

  useEffect(() => {
    const token = (state.query?.resume as string) || getSavedResumeToken(state.formId)

    if (!token) {
      return
    }

    resumeResponseSessionRequest({ formId: state.formId, token })
      .then(result => {
        // A session with no answers carries nothing worth restoring, and an
        // expired or unknown token should not nag the respondent at all.
        if (result && result.answers?.length > 0) {
          setSession(result)
          setResumeToken(token)
        } else {
          clearResumeToken(state.formId)
          clearResumeQueryParam()
        }
      })
      .catch(() => {
        // Resume is strictly best-effort; a failing check stays invisible.
      })
  }, [])

  function handleContinue() {
    if (!session || !resumeToken) {
      return
    }

    dispatch({
      type: 'restoreSession',
      payload: {
        values: deserializeSessionAnswers(session.answers),
        variables: deserializeSessionVariables(session.variables),
        currentFieldId: session.currentFieldId
      }
    })

    // Later saves keep updating the restored session instead of minting a new one.
    dispatch({
      type: 'setSessionToken',
      payload: {
        sessionToken: resumeToken
      }
    })

    saveResumeToken(state.formId, resumeToken)
    clearResumeQueryParam()

    state.analytics?.push('session_resumed', { fieldId: session.currentFieldId })

    setSession(null)
  }

  function handleStartOver() {
    clearResumeToken(state.formId)
    clearResumeQueryParam()
    removeStorage(state.formId)
    setSession(null)
  }

  if (!isEligible || !session) {
    return null
  }

  return (
    <div className="myform-resume-banner" role="dialog" aria-label={t('resume.bannerTitle')}>
      <div className="myform-resume-banner-body">
        <h2 className="myform-resume-banner-title">{t('resume.bannerTitle')}</h2>
        <p className="myform-resume-banner-description">{t('resume.bannerDescription')}</p>
      </div>
      <div className="myform-resume-banner-actions">
        <button type="button" className="myform-resume-banner-primary" onClick={handleContinue}>
          {t('resume.continue')}
        </button>
        <button type="button" className="myform-resume-banner-secondary" onClick={handleStartOver}>
          {t('resume.startOver')}
        </button>
      </div>
    </div>
  )
}
