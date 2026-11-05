import { useEffect, useMemo, useRef } from 'react'

import { buildClassicPages, findClassicPageIndex, isClassicLayout } from '../utils'
import type { IAnalytics } from '../utils/analytics'
import { getFormOpenToken } from '../utils/api'
import {
  buildSessionHiddenFields,
  saveResponseSessionRequest,
  saveResumeToken,
  serializeSessionAnswers,
  serializeSessionVariables
} from '../utils/resume'

import type { IState } from '../store'
import { useStore } from '../store'

const SESSION_SAVE_DEBOUNCE_MS = 2_000
const ANSWER_EVENT_DEBOUNCE_MS = 500

interface ViewTrackingState {
  key: string
  position: number
  fieldIds: string[]
  enteredAt: number
}

/**
 * Save & resume session sync. Navigation (and answer changes, which the classic
 * layout commits as they happen) schedule a debounced save of the in-progress
 * response. The first save mints a session token the respondent's device
 * remembers; every later save updates the same session. Failures are silent —
 * resume must never disturb the respondent.
 */
export function useResponseSessionSync() {
  const { state, dispatch } = useStore()
  const stateRef = useRef(state)
  const saveTimerRef = useRef<number>()
  const isSavingRef = useRef(false)
  const isDirtyRef = useRef(false)

  stateRef.current = state

  useEffect(() => {
    if (!state.settings?.enableResume || state.isSubmitted) {
      return
    }

    window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      void saveSession(stateRef.current)
    }, SESSION_SAVE_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(saveTimerRef.current)
    }
  }, [state.scrollIndex, state.values, state.settings?.enableResume, state.isSubmitted])

  async function saveSession(current: IState) {
    if (!current.settings?.enableResume || current.isSubmitted) {
      return
    }

    const openToken = getFormOpenToken(current.query)

    if (!openToken) {
      return
    }

    const answers = serializeSessionAnswers(current.values)

    if (answers.length < 1 && !current.isStarted) {
      return
    }

    // A save still in flight absorbs this request and runs again once done,
    // so concurrent saves cannot mint duplicate sessions.
    if (isSavingRef.current) {
      isDirtyRef.current = true
      return
    }

    isSavingRef.current = true

    try {
      const result = await saveResponseSessionRequest({
        formId: current.formId,
        openToken,
        sessionToken: current.sessionToken,
        answers,
        hiddenFields: buildSessionHiddenFields(current.hiddenFields, current.query),
        variables: serializeSessionVariables(current.variables),
        currentFieldId: current.fields[current.scrollIndex!]?.id
      })

      if (result?.sessionToken) {
        dispatch({
          type: 'setSessionToken',
          payload: {
            sessionToken: result.sessionToken
          }
        })
        saveResumeToken(current.formId, result.sessionToken)
      }
    } catch {
      // Saving is best-effort; the next navigation schedules a retry.
    } finally {
      isSavingRef.current = false

      if (isDirtyRef.current) {
        isDirtyRef.current = false
        saveTimerRef.current = window.setTimeout(() => {
          void saveSession(stateRef.current)
        }, SESSION_SAVE_DEBOUNCE_MS)
      }
    }
  }
}

/**
 * Respondent view telemetry. Every navigation is seen as a view change — the
 * conversational layout tracks the active question, the classic layout tracks
 * the page and reports every question presented on it. Leaving a view emits a
 * field_exit carrying the time spent, arriving emits field_enter, and the
 * direction of the move emits page_next or page_prev. The final field_exit is
 * emitted when the response is completed.
 */
export function useRespondentTracking(): void {
  const { state } = useStore()
  const analytics: IAnalytics | undefined = state.analytics
  const isClassic = isClassicLayout(state.settings)

  const pages = useMemo(
    () => (isClassic ? buildClassicPages(state.fields) : []),
    [isClassic, state.fields]
  )
  const pageIndex = findClassicPageIndex(pages, state.scrollIndex!)
  const activeFieldId = state.fields[state.scrollIndex!]?.id
  const trackingRef = useRef<ViewTrackingState>()

  useEffect(() => {
    if (!state.isStarted || state.isSubmitted || !activeFieldId) {
      return
    }

    const page = pages[pageIndex]
    const fieldIds = isClassic
      ? [page?.group?.id, ...(page?.fields.map(field => field.id) ?? [])].filter(Boolean)
      : [activeFieldId]
    const key = isClassic ? `page:${pageIndex}` : `field:${activeFieldId}`
    const position = isClassic ? pageIndex : state.scrollIndex!
    const previous = trackingRef.current

    // Nothing changed in what the respondent is looking at.
    if (previous?.key === key) {
      return
    }

    trackingRef.current = { key, position, fieldIds, enteredAt: Date.now() }

    if (!analytics) {
      return
    }

    if (previous) {
      const durationMs = Date.now() - previous.enteredAt

      previous.fieldIds.forEach(fieldId => {
        analytics.push('field_exit', { fieldId, durationMs })
      })

      analytics.push(position > previous.position ? 'page_next' : 'page_prev', {
        fieldId: activeFieldId
      })
    }

    fieldIds.forEach(fieldId => {
      analytics.push('field_enter', { fieldId })
    })
  }, [
    activeFieldId,
    analytics,
    isClassic,
    pageIndex,
    state.isStarted,
    state.scrollIndex,
    state.isSubmitted
  ])

  // The completed response closes the last view the respondent was on.
  useEffect(() => {
    const previous = trackingRef.current

    if (!state.isSubmitted || !previous || !analytics) {
      return
    }

    const durationMs = Date.now() - previous.enteredAt

    previous.fieldIds.forEach(fieldId => {
      analytics.push('field_exit', { fieldId, durationMs })
    })

    trackingRef.current = undefined
  }, [state.isSubmitted, analytics])
}

/**
 * Collapses the per-keystroke answer commits of the classic layout into one
 * answer_change event per burst of edits.
 */
export function useAnswerChangeEvent(fieldId: string) {
  const { state } = useStore()
  const timerRef = useRef<number>()

  useEffect(() => {
    return () => {
      window.clearTimeout(timerRef.current)
    }
  }, [])

  return function trackAnswerChange() {
    if (!state.analytics) {
      return
    }

    window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      state.analytics?.push('answer_change', { fieldId })
    }, ANSWER_EVENT_DEBOUNCE_MS)
  }
}
