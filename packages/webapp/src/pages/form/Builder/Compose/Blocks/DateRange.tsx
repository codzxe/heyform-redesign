import { TIME_FORMAT } from '@myform/form-renderer'
import { IconChevronRight } from '@tabler/icons-react'
import type { FC } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/utils'

import { DATE_FORMAT_MAPS } from '@/consts'

import { FakeSubmit } from '../FakeSubmit'
import type { BlockProps } from './Block'
import { Block } from './Block'
import { DateItem } from './Date'

export const DateRange: FC<BlockProps> = ({ field, locale, ...restProps }) => {
  const { t } = useTranslation()
  const format = field.properties?.format || 'MM/DD/YYYY'
  const [x, y, z, dateDivider] = DATE_FORMAT_MAPS[format]
  const [h, m, timeDivider] = DATE_FORMAT_MAPS[TIME_FORMAT]

  return (
    <Block className="myform-date" field={field} locale={locale} {...restProps}>
      <div
        className={cn('myform-date-range flex items-center', {
          'myform-date-range-with-time': field.properties?.allowTime
        })}
      >
        <div className="myform-date-root myform-start-date">
          <DateItem locale={locale} format={x} />
          <div className="myform-date-divider">{dateDivider}</div>
          <DateItem locale={locale} format={y} />
          <div className="myform-date-divider">{dateDivider}</div>
          <DateItem locale={locale} format={z} />

          {field.properties?.allowTime && (
            <>
              <DateItem locale={locale} format={h} />
              <div className="myform-date-divider">{timeDivider}</div>
              <DateItem locale={locale} format={m} />
            </>
          )}
        </div>

        <div className="myform-date-range-divider">{t('form.builder.compose.dateRangeTo')}</div>

        <div className="myform-date-root myform-end-date">
          <DateItem locale={locale} format={x} />
          <div className="myform-date-divider">{dateDivider}</div>
          <DateItem locale={locale} format={y} />
          <div className="myform-date-divider">{dateDivider}</div>
          <DateItem locale={locale} format={z} />

          {field.properties?.allowTime && (
            <>
              <DateItem locale={locale} format={h} />
              <div className="myform-date-divider">{timeDivider}</div>
              <DateItem locale={locale} format={m} />
            </>
          )}
        </div>
      </div>

      <FakeSubmit text={t('Next', { lng: locale })} icon={<IconChevronRight />} />
    </Block>
  )
}
