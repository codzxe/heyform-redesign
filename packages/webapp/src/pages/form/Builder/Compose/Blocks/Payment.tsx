import { CURRENCY_SYMBOLS } from '@myform/form-renderer'
import { NumberPrice } from '@myform/shared-types-enums'
import { IconChevronRight } from '@tabler/icons-react'
import type { FC } from 'react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { helper } from '@myform/utils'

import { FakeSubmit } from '../FakeSubmit'
import type { BlockProps } from './Block'
import { Block } from './Block'

export const Payment: FC<BlockProps> = ({ field, locale, ...restProps }) => {
  const { t } = useTranslation()

  const priceString = useMemo(() => {
    const currency = field.properties?.currency || 'USD'
    let price = 0

    if (helper.isValid(field.properties?.price)) {
      if (field.properties!.price!.type === 'number') {
        price = (field.properties!.price as NumberPrice).value || 0
      }
    }

    return CURRENCY_SYMBOLS[currency] + price
  }, [field.properties?.currency, field.properties?.price])

  return (
    <Block className="myform-payment" field={field} locale={locale} {...restProps}>
      <div className="myform-payment-header">
        <p>
          {t('Your credit card will be charged', { lng: locale })}: <strong>{priceString}</strong>
        </p>
      </div>

      <div className="myform-payment-body">
        <div className="myform-payment-item">
          <div className="myform-payment-label">{t('Name on card', { lng: locale })}</div>
          <input type="text" className="myform-input" placeholder="Han Solo" disabled={true} />
        </div>

        <div className="myform-payment-item">
          <div className="myform-payment-label">{t('Card number', { lng: locale })}</div>
          <input
            type="text"
            className="myform-input"
            placeholder="1234 1234 1234 1234"
            disabled={true}
          />
        </div>

        <div className="myform-payment-wrapper">
          <div className="myform-payment-item">
            <div className="myform-payment-label">{t('Expiry date', { lng: locale })}</div>
            <input type="text" className="myform-input" placeholder="MM/YY" disabled={true} />
          </div>
          <div className="myform-payment-item">
            <div className="myform-payment-label">{t('CVC', { lng: locale })}</div>
            <input type="text" className="myform-input" placeholder="123" disabled={true} />
          </div>
        </div>
      </div>

      <FakeSubmit text={t('Next', { lng: locale })} icon={<IconChevronRight />} />
    </Block>
  )
}
