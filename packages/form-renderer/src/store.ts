import type {
  FormField,
  FormSettings,
  FormTheme,
  HiddenField,
  Logic,
  Variable
} from '@myform/shared-types-enums'
import { useContext } from 'react'

import {
  LRU,
  LRUMemoryStore,
  buildClassicPages,
  calculateProgress,
  createStoreContext,
  createStoreReducer,
  findClassicPageIndex,
  getClassicPageProgress,
  getFormOpenToken,
  isClassicLayout,
  isFile,
  isLastClassicPage,
  replaceHTML,
  validateLogicField
} from './utils'
import type { IAnalytics } from './utils/analytics'
import { createAnalyticsCollector } from './utils/analytics'
import { applyLogicToFields } from '@myform/answer-utils'
import { helper } from '@myform/utils'

import type { AnyMap, IFormField } from './typings'

let LRU_CACHE: LRU

function removeLegacyLocalStorage(): void {
  if (typeof window === 'undefined') {
    return
  }

  // Versions before this hardening pass stored answer data in localStorage for seven days.
  // Purge that bucket whenever a renderer initializes, even though autosave now defaults off.
  try {
    window.localStorage.removeItem('MYFORM_DATA')
  } catch {}
}

function getSessionStore() {
  if (typeof window === 'undefined') {
    return new LRUMemoryStore()
  }

  return {
    getItem(key: string) {
      try {
        const value = window.sessionStorage.getItem(key)
        return value ? JSON.parse(value) : undefined
      } catch {
        return undefined
      }
    },
    setItem(key: string, value: unknown) {
      try {
        window.sessionStorage.setItem(key, JSON.stringify(value))
      } catch {}
    },
    removeItem(key: string) {
      try {
        window.sessionStorage.removeItem(key)
      } catch {}
    }
  }
}

export function getLRU(): LRU {
  if (!LRU_CACHE) {
    LRU_CACHE = new LRU({
      bucket: 'MYFORM_SESSION_DATA',
      expires: 60 * 60,
      store: getSessionStore()
    })
  }
  return LRU_CACHE
}

export function getStorage(formId: string, autoSave?: boolean) {
  const values: any = {}

  removeLegacyLocalStorage()

  if (autoSave) {
    const cache = getLRU().get(formId)

    if (helper.isValid(cache)) {
      Object.keys(cache).forEach(key => {
        const value = cache[key]

        if (helper.isValid(value)) {
          values[key] = value
        }
      })
    }
  }

  return values
}

export function removeStorage(formId: string) {
  getLRU().remove(formId)
}

export type ScrollDestination = 'next' | 'previous' | string

// Stripe.js v3 API surface the renderer host implements for payment blocks.
// Referenced through the @types/stripe-v3 ambient declarations.
/// <reference types="@types/stripe-v3" />
export interface IStripe {
  elements: stripe.elements.Elements
  confirmCardPayment: (
    clientSecret: string,
    data?: stripe.ConfirmCardPaymentData,
    options?: stripe.ConfirmCardPaymentOptions
  ) => Promise<stripe.PaymentIntentResponse>
  apiKey: string
  accountId: string
}

/** Extra context the renderer passes the host when a response is submitted. */
export interface ISubmitExtras {
  /** GDPR consent checkbox state, sent when the form asks for consent. */
  consentAccepted?: boolean
  /** Save & resume session the submission should be linked to. */
  sessionToken?: string
}

/** Quiz scoring the server computed while storing the response. */
export interface ISubmissionResult {
  clientSecret?: string
  score?: number
  totalScore?: number
  percentage?: number
  passed?: boolean
  correctCount?: number
  questionCount?: number
  leaderboardRank?: number
}

/** Mutable facts the analytics collector reads as it flushes. */
export interface IAnalyticsRuntime {
  isCompleted?: boolean
}

export interface IState {
  formId: string
  instanceId: string
  welcomeField?: IFormField
  thankYouFieldId?: string
  thankYouFields: IFormField[]
  allFields: IFormField[]
  fields: IFormField[]
  hiddenFields: HiddenField[]
  translations?: Record<string, any>
  query: Record<string, any>
  jumpFieldIds: string[]
  logics?: Logic[]
  parameters?: Variable[]
  variables: AnyMap
  values: AnyMap
  autoSave?: boolean
  settings?: FormSettings
  percentage: number
  questionCount: number
  passedFieldIds: string[]
  scrollIndex?: number
  scrollTo?: ScrollDestination
  isScrollNextDisabled?: boolean
  errorFieldId?: string
  isSubmitTouched?: boolean
  isStarted?: boolean
  isSubmitted?: boolean
  isSidebarOpen?: boolean
  reportAbuseURL?: string
  locale: string
  customUrlRedirects?: boolean
  alwaysShowNextButton?: boolean
  enableQuestionList?: boolean
  enableNavigationArrows?: boolean
  logo?: string
  theme: FormTheme
  stripe?: IStripe
  /** Batched respondent telemetry; undefined on the server. */
  analytics?: IAnalytics
  analyticsRuntime?: IAnalyticsRuntime
  /** Save & resume session token returned by the first session save. */
  sessionToken?: string
  /** GDPR consent checkbox state (unset until the respondent interacts). */
  consentAccepted?: boolean
  /** Quiz scoring returned by completeSubmission, shown on the ending. */
  submissionResult?: ISubmissionResult
  onSubmit?: (
    values: Record<string, any>,
    isPartial?: boolean,
    stripe?: IStripe,
    extras?: ISubmitExtras
  ) => Promise<ISubmissionResult | void>
}

const actions: any = {
  setValues: (state: IState, { values }: any) => {
    const newValues = {
      ...state.values,
      ...values
    }

    if (state.autoSave) {
      const cache: AnyMap = {}

      Object.keys(newValues).forEach(key => {
        const value = newValues[key]

        if (helper.isValid(value) && !isFile(value)) {
          cache[key] = value
        }
      })

      getLRU().put(state.formId, cache)
    }

    const { fields, variables } = applyLogicToFields(
      [...state.allFields, ...state.thankYouFields].filter(Boolean) as FormField[],
      state.logics,
      state.parameters,
      newValues
    )

    // Classic pages move as a whole, so both progress and whether another page
    // is ahead depend on the page the scroll position sits on, never on the
    // answer that just changed.
    const isClassic = isClassicLayout(state.settings)
    const { questionCount, percentage } = isClassic
      ? {
          questionCount: state.questionCount,
          percentage: getClassicPageProgress(fields, state.scrollIndex!)
        }
      : calculateProgress(fields, newValues, state.passedFieldIds)
    const isScrollNextDisabled = isClassic
      ? isLastClassicPage(fields, state.scrollIndex!)
      : !validateLogicField(fields[state.scrollIndex!], state.jumpFieldIds, values) ||
        state.scrollIndex! >= fields.length - 1

    return {
      ...state,
      fields,
      values: newValues,
      variables,
      percentage,
      questionCount,
      isScrollNextDisabled
    }
  },

  setIsStarted: (state: IState, { isStarted }: any) => {
    return actions.scrollTo(
      {
        ...state,
        isStarted,
        isSubmitted: state.fields.length < 1
      },
      {
        scrollIndex: 0,
        scrollTo: 'next'
      }
    )
  },

  setIsSubmitTouched: (state: IState, { isSubmitTouched }: any) => ({ ...state, isSubmitTouched }),

  setIsSubmitted: (state: IState, { isSubmitted, thankYouFieldId }: any) => ({
    ...state,
    isSubmitted,
    isSidebarOpen: false,
    thankYouFieldId
  }),

  setIsSidebarOpen: (state: IState, { isSidebarOpen }: any) => ({ ...state, isSidebarOpen }),

  setStripe: (state: IState, { stripe }: any) => ({ ...state, stripe }),

  setConsentAccepted: (state: IState, { consentAccepted }: any) => ({ ...state, consentAccepted }),

  setSessionToken: (state: IState, { sessionToken }: any) => ({ ...state, sessionToken }),

  setSubmissionResult: (state: IState, { submissionResult }: any) => ({
    ...state,
    submissionResult
  }),

  // Classic pages validate as a whole, so a rejected page only has to flag the
  // offending field for its block to show the inline error; no navigation.
  setErrorField: (state: IState, { errorFieldId }: any) => ({ ...state, errorFieldId }),

  // Restores a saved session: answers and variables come back first (logic
  // re-runs over them), then the route jumps to where the respondent stopped.
  restoreSession: (state: IState, { values, variables, currentFieldId }: any) => {
    let nextState = state

    if (helper.isValid(values) || helper.isValid(variables)) {
      nextState = actions.setValues(nextState, {
        values: values || {}
      })
    }

    if (helper.isValid(currentFieldId)) {
      nextState = actions.scrollToField(nextState, {
        fieldId: currentFieldId
      })
    }

    return nextState
  },

  resetErrorField: (state: IState) => ({ ...state, errorFieldId: undefined }),

  scrollPrevious: (state: IState) => {
    if (state.scrollIndex! < 1) {
      return state
    }

    // Classic pages move as a whole: go back to the start of the previous page.
    if (isClassicLayout(state.settings)) {
      const pages = buildClassicPages(state.fields)
      const currentIndex = findClassicPageIndex(pages, state.scrollIndex!)
      const targetIndex = currentIndex > 0 ? pages[currentIndex - 1].startIndex : 0

      return actions.scrollTo(state, {
        scrollIndex: targetIndex,
        scrollTo: 'previous'
      })
    }

    return actions.scrollTo(state, {
      scrollIndex: state.scrollIndex! - 1,
      scrollTo: 'previous'
    })
  },

  scrollNext: (state: IState) => {
    const { scrollIndex, fields, values, jumpFieldIds } = state

    // Classic pages move as a whole: land on the start of the next page.
    if (isClassicLayout(state.settings)) {
      const pages = buildClassicPages(fields)
      const currentIndex = findClassicPageIndex(pages, scrollIndex!)

      if (currentIndex >= pages.length - 1) {
        return {
          ...state,
          isScrollNextDisabled: true
        }
      }

      return actions.scrollTo(state, {
        scrollIndex: pages[currentIndex + 1].startIndex,
        scrollTo: 'next'
      })
    }

    const isTouched = validateLogicField(fields[scrollIndex!], jumpFieldIds, values)

    if (!isTouched || scrollIndex! >= fields.length - 1) {
      return {
        ...state,
        isScrollNextDisabled: true
      }
    }

    return actions.scrollTo(state, {
      scrollIndex: scrollIndex! + 1,
      scrollTo: 'next'
    })
  },

  scrollToField(state: IState, { fieldId, errorFieldId }: any) {
    const index = state.fields.findIndex(f => f.id === fieldId)

    if (index < 0) {
      return state
    }

    return actions.scrollTo(state, {
      scrollIndex: index,
      scrollTo:
        !helper.isNil(state.scrollIndex) && index >= state.scrollIndex! ? 'next' : 'previous',
      errorFieldId
    })
  },

  scrollTo(state: IState, { scrollIndex, scrollTo, errorFieldId }: any) {
    const { fields, values, variables } = state
    const field = fields[scrollIndex]

    field.title = replaceHTML(field.title as string, values, fields, state.query, variables)
    field.description = replaceHTML(
      field.description as string,
      values,
      fields,
      state.query,
      variables
    )

    // Empty when moving backwards, and spans every question a question list jump skips over.
    const passedFields = fields.slice(state.scrollIndex, scrollIndex)
    const passedFieldIds = [...new Set([...state.passedFieldIds, ...passedFields.map(f => f.id)])]

    const isClassic = isClassicLayout(state.settings)
    const { questionCount, percentage } = isClassic
      ? {
          questionCount: state.questionCount,
          percentage: getClassicPageProgress(fields, scrollIndex)
        }
      : calculateProgress(fields, values, passedFieldIds)

    return {
      ...state,
      fields,
      passedFieldIds,
      percentage,
      questionCount,
      scrollIndex,
      scrollTo,
      isScrollNextDisabled: isClassic ? isLastClassicPage(fields, scrollIndex) : false,
      errorFieldId
    }
  }
}

export const StoreContext = createStoreContext<IState>({
  instanceId: '',
  formId: '',
  allFields: [],
  fields: [],
  thankYouFields: [],
  hiddenFields: [],
  query: {},
  jumpFieldIds: [],
  values: {},
  variables: {},
  percentage: 0,
  questionCount: 0,
  passedFieldIds: [],
  locale: 'en',
  theme: {}
})

export const StoreReducer = createStoreReducer<IState>(actions, (_, newState) => newState)

export function useStore() {
  return useContext(StoreContext)
}

/**
 * Builds the respondent telemetry for a renderer instance. The open token is
 * resolved on every flush (the host bridges it onto the runtime config once
 * the form has been opened), and the completion flag is kept on a mutable
 * runtime object the views keep in sync with the store.
 */
export function initAnalytics(
  formId: string,
  query?: Record<string, any>
): { analytics?: IAnalytics; analyticsRuntime: IAnalyticsRuntime } {
  const analyticsRuntime: IAnalyticsRuntime = { isCompleted: false }

  if (typeof window === 'undefined') {
    return { analyticsRuntime }
  }

  const analytics = createAnalyticsCollector({
    formId,
    getOpenToken: () => getFormOpenToken(query),
    isCompleted: () => !!analyticsRuntime.isCompleted
  })

  return { analytics, analyticsRuntime }
}
