import { COUNTRIES, FlagIcon } from '@myform/form-renderer'
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react'
import type { FC } from 'react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { FakeSubmit } from '../FakeSubmit'
import type { BlockProps } from './Block'
import { Block } from './Block'

export const PhoneNumber: FC<BlockProps> = ({ field, locale, ...restProps }) => {
  const { t } = useTranslation()
  const placeholder = useMemo(
    () => COUNTRIES.find(c => c.value === field.properties?.defaultCountryCode)?.example,
    [field.properties?.defaultCountryCode]
  )

  return (
    <Block className="myform-phone-number" field={field} locale={locale} {...restProps}>
      <div className="flex items-center">
        <div className="myform-calling-code">
          <FlagIcon countryCode={field.properties?.defaultCountryCode} />
          <IconChevronDown className="myform-phone-arrow-icon" />
        </div>
        <input type="text" className="myform-input" placeholder={placeholder} disabled={true} />
      </div>
      <FakeSubmit text={t('Next', { lng: locale })} icon={<IconChevronRight />} />
    </Block>
  )
}
