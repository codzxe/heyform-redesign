import { FieldKindEnum, NumberPrice } from '@myform/shared-types-enums'
import type { FormField } from '@myform/shared-types-enums'
import Big from 'big.js'
import clsx from 'clsx'
import type { FC } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'

import {
  buildClassicPages,
  findClassicPageIndex,
  getEndingRouteFields,
  sendMessageToParent,
  useTranslation
} from '../utils'
import { clearResumeToken } from '../utils/resume'
import { applyLogicToFields, htmlUtils, resolveEnding, validateFields } from '@myform/answer-utils'
import { helper } from '@myform/utils'

import { Submit } from '../components'
import { ConsentCheckbox } from '../components/ConsentCheckbox'
import { removeStorage, useStore } from '../store'
import { getBlock } from './BlockRegistry'

/**
 * The classic response layout: groups present all of their questions on one
 * page, ungrouped top-level fields get a page of their own. Next validates the
 * whole page (and submits from the last page), Previous walks pages backwards,
 * and progress follows the page position.
 */
export const ClassicMain: FC = () => {
  const { state, dispatch } = useStore()
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [submitError, setSubmitError] = useState<string>()
  const pageScrollRef = useRef<HTMLDivElement>(null)

  const pages = useMemo(() => buildClassicPages(state.fields), [state.fields])
  const pageIndex = findClassicPageIndex(pages, state.scrollIndex!)
  const page = pages[pageIndex]
  const isLastPage = pageIndex >= pages.length - 1

  const paymentIndex = useMemo(
    () => state.fields.findIndex(field => field.kind === FieldKindEnum.PAYMENT),
    [state.fields]
  )
  const paymentField = paymentIndex > -1 ? state.fields[paymentIndex] : undefined

  // Payment keeps its own always-mounted block (the card elements must stay
  // alive for the confirmation at the end); it is revealed on its page only.
  const isPaymentOnCurrentPage = !!page && isPaymentFieldOnPage(page, paymentField)

  const isConsentRequired = !!state.settings?.enableResponseConsent

  useEffect(() => {
    const container = pageScrollRef.current

    if (!container) {
      return
    }

    container.scrollTo({ top: 0 })

    // Arriving on a page puts the respondent on its first question, the same
    // focus the conversational layout gives the question it lands on.
    if (state.scrollTo === 'previous') {
      return
    }

    const timeoutId = window.setTimeout(() => {
      const interactiveElement = container.querySelector<HTMLElement>(
        [
          '[data-myform-focus-target]:not([disabled])',
          'input:not([type="hidden"]):not([disabled])',
          'textarea:not([disabled])',
          'select:not([disabled])',
          '[contenteditable="true"]'
        ].join(',')
      )

      if (interactiveElement && interactiveElement.offsetParent !== null) {
        try {
          interactiveElement.focus({ preventScroll: true })
        } catch {
          interactiveElement.focus()
        }
      }
    }, 120)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [pageIndex])

  if (!page) {
    return null
  }

  // The payment block renders outside of the stacked questions (see above).
  const stackedFields = page.fields.filter(field => field.id !== paymentField?.id)

  function scrollToFieldElement(fieldId?: string) {
    if (!fieldId) {
      return
    }

    const element = document.getElementById(`myform-${state.instanceId}-${fieldId}`)

    element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  function handlePrevious() {
    setSubmitError(undefined)
    dispatch({ type: 'resetErrorField' })
    dispatch({ type: 'scrollPrevious' })
  }

  async function handleNext() {
    if (loading) {
      return
    }

    if (!isLastPage) {
      try {
        validateFields(page!.fields, state.values)
      } catch (err: any) {
        const fieldId = err?.response?.id

        dispatch({
          type: 'setErrorField',
          payload: { errorFieldId: fieldId }
        })
        scrollToFieldElement(fieldId)
        state.analytics?.push('validation_error', { fieldId })

        return
      }

      setSubmitError(undefined)
      dispatch({ type: 'resetErrorField' })
      dispatch({ type: 'scrollNext' })

      return
    }

    await handleSubmit()
  }

  async function handleSubmit() {
    if (loading) {
      return
    }

    if (isConsentRequired && !state.consentAccepted) {
      setSubmitError(t('consent.required'))
      return
    }

    const values = { ...state.values }
    const { fields: routeFields } = applyLogicToFields(
      [...state.allFields, ...state.thankYouFields].filter(Boolean) as FormField[],
      state.logics,
      state.parameters,
      values
    )

    try {
      validateFields(routeFields, values)
    } catch (err: any) {
      const fieldId = err?.response?.id

      // The offending question may sit on an earlier page.
      dispatch({
        type: 'scrollToField',
        payload: { fieldId, errorFieldId: fieldId }
      })
      state.analytics?.push('validation_error', { fieldId })

      return
    }

    setLoading(true)
    setSubmitError(undefined)

    try {
      if (state.stripe) {
        const stripePaymentField = routeFields.find(f => f.kind === FieldKindEnum.PAYMENT)

        if (stripePaymentField) {
          const value = values[stripePaymentField.id]

          if (helper.isValid(value)) {
            const price = stripePaymentField.properties?.price as NumberPrice
            const currency = stripePaymentField.properties?.currency

            if (!helper.isValid(price?.value) || price.value <= 0 || !helper.isValid(currency)) {
              values[stripePaymentField.id] = undefined
            } else {
              values[stripePaymentField.id] = {
                amount: Big(price.value).times(100).toNumber(),
                currency,
                billingDetails: {
                  name: value.name
                }
              }
            }
          }
        }
      }

      const ending = resolveEnding(
        getEndingRouteFields(state.allFields, state.thankYouFields),
        state.logics,
        state.parameters,
        values,
        false
      )

      // An ending that keeps its responses out of the form still has something
      // to tell the respondent, so it neither submits nor closes the embed.
      if (!ending?.properties?.discardSubmission) {
        const result = await state.onSubmit?.(values, false, state.stripe, {
          consentAccepted: state.consentAccepted,
          sessionToken: state.sessionToken
        })

        if (helper.isValid(result)) {
          dispatch({
            type: 'setSubmissionResult',
            payload: { submissionResult: result }
          })
        }

        if (helper.isTrue(state.query.hideAfterSubmit)) {
          sendMessageToParent('HIDE_EMBED_MODAL')
        }
      }

      state.analytics?.push('completed')

      setLoading(false)

      dispatch({
        type: 'setIsSubmitted',
        payload: {
          isSubmitted: true,
          thankYouFieldId: ending?.id
        }
      })

      removeStorage(state.formId)
      clearResumeToken(state.formId)
    } catch (err: any) {
      console.error(err, err?.response)
      setLoading(false)
      setSubmitError(err?.message)
    }
  }

  return (
    <div className="myform-classic-body">
      <div className="myform-theme-background" />

      <div className="myform-classic-scroll myform-scrollbar" ref={pageScrollRef}>
        <div className="myform-classic-page">
          {page.group && (
            <div className="myform-classic-group">
              <h2 className="myform-classic-group-title">
                {htmlUtils.plain(page.group.title as string)}
              </h2>
              {page.group.description && (
                <div className="myform-classic-group-description">
                  {htmlUtils.plain(page.group.description as string)}
                </div>
              )}
            </div>
          )}

          <div className="myform-classic-questions">
            {stackedFields.map(field => (
              <div className="myform-classic-question" key={field.id}>
                {getBlock(field)}
              </div>
            ))}

            {paymentField && (
              <div
                className={clsx('myform-classic-question myform-classic-payment', {
                  'myform-classic-payment-active': isPaymentOnCurrentPage
                })}
              >
                {getBlock(paymentField, paymentIndex)}
              </div>
            )}
          </div>

          <div className="myform-classic-actions">
            {submitError && (
              <div className="myform-validation-wrapper">
                <div className="myform-validation-error">{submitError}</div>
              </div>
            )}

            {isLastPage && isConsentRequired && <ConsentCheckbox />}

            <div className="myform-classic-buttons">
              {pageIndex > 0 && (
                <button
                  type="button"
                  className="myform-classic-previous"
                  onClick={handlePrevious}
                  disabled={loading}
                >
                  {t('paginationPrevious')}
                </button>
              )}

              <Submit
                className="!mt-0"
                text={isLastPage ? t('Submit') : t('Next')}
                loading={loading}
                onClick={() => {
                  void handleNext()
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function isPaymentFieldOnPage(
  page: { group?: { id: string }; fields: Array<{ id: string }> },
  paymentField?: { id: string }
): boolean {
  if (!paymentField) {
    return false
  }

  return (
    page.group?.id === paymentField.id || page.fields.some(field => field.id === paymentField.id)
  )
}
