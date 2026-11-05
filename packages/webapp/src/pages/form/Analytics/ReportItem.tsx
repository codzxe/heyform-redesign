import { CHOICE_FIELD_KINDS, RATING_FIELD_KINDS } from '@myform/shared-types-enums'
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react'
import { FC, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { helper, toFixed } from '@myform/utils'

import { useFormStore } from '@/store'

import FormReportSubmissions, { FormReportOtherAnswers } from './Submissions'

interface FormReportItemProps {
  index: number
  response: any
  isHideFieldEnabled?: boolean
}

interface ChoicesProps {
  // The question the choices belong to; its typed "Other" entries load on demand.
  fieldId?: string
  chooses: any[]
}

interface RatingsProps extends ChoicesProps {
  length: number
}

const Choices: FC<ChoicesProps> = ({ fieldId, chooses }) => {
  const { t } = useTranslation()
  const total = useMemo(
    () => chooses.reduce((prev, next) => prev + (next.count || 0), 0) || 1,
    [chooses]
  )
  const [isOtherOpen, setIsOtherOpen] = useState(false)

  return (
    <div className="myform-report-chart">
      {chooses.map((row, index) => {
        const percent = `${toFixed(((row.count || 0) * 100) / total)}%`
        const canExpand = row.isOther && row.count > 0 && fieldId
        const ChevronIcon = isOtherOpen ? IconChevronDown : IconChevronRight

        const bar = (
          <>
            <div
              className="myform-report-chart-background"
              style={{
                width: percent
              }}
            />
            <div className="myform-report-chart-content">
              <span className="myform-report-chart-percent flex items-center gap-1">
                {canExpand && <ChevronIcon className="h-4 w-4" />}
                {row.label} · {percent}
              </span>
              <span className="myform-report-chart-count">
                {t('form.analytics.report.submission', { count: row.count || 0 })}
              </span>
            </div>
          </>
        )

        if (!canExpand) {
          return (
            <div key={index} className="myform-report-chart-item">
              {bar}
            </div>
          )
        }

        return (
          <div key={index}>
            <button
              type="button"
              className="myform-report-chart-item block w-full text-left"
              aria-expanded={isOtherOpen}
              onClick={() => setIsOtherOpen(open => !open)}
            >
              {bar}
            </button>
            {isOtherOpen && <FormReportOtherAnswers fieldId={fieldId} />}
          </div>
        )
      })}
    </div>
  )
}

const Ratings: FC<RatingsProps> = ({ length, chooses }) => {
  const { t } = useTranslation()
  const arrays = Array.from<number>({ length }).map((_, index) => index + 1)
  const total = chooses.filter(c => helper.isNumeric(c)).reduce((prev, next) => prev + next, 0)

  return (
    <div className="myform-report-chart">
      {arrays.map((row, index) => {
        const count = chooses[row] || 0
        const percent = `${toFixed((count * 100) / total)}%`

        return (
          <div key={index} className="myform-report-chart-item">
            <div
              className="myform-report-chart-background"
              style={{
                width: percent
              }}
            />
            <div className="myform-report-chart-content">
              <span className="myform-report-chart-percent">
                {row} · {total > 0 ? Math.round((count * 100) / total) : 0}%
              </span>
              <span className="myform-report-chart-count">
                {t('form.analytics.report.submission', { count })}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

const FormReportItem: FC<FormReportItemProps> = ({ index, response, isHideFieldEnabled }) => {
  const { t } = useTranslation()

  const { form } = useFormStore()

  const isChoices = useMemo(() => CHOICE_FIELD_KINDS.includes(response.kind), [response.kind])
  const isRating = useMemo(() => RATING_FIELD_KINDS.includes(response.kind), [response.kind])

  const isHided = useMemo(
    () => isHideFieldEnabled && form?.customReport?.hiddenFields?.includes(response.id),
    [form?.customReport?.hiddenFields, isHideFieldEnabled, response.id]
  )

  const children = useMemo(() => {
    if (isChoices) {
      return <Choices fieldId={response.id} chooses={response.chooses} />
    } else if (isRating) {
      return <Ratings length={response.properties?.total} chooses={response.chooses} />
    } else {
      return <FormReportSubmissions response={response} />
    }
  }, [isChoices, isRating, response])

  return (
    <li className="myform-report-item">
      <div className="flex gap-4">
        <div className="myform-report-question flex-1">
          {index}. {response.title}
        </div>
      </div>
      <div className="myform-report-meta">
        {isRating
          ? t('form.analytics.report.submission2', {
              count: response.count,
              average: response.average
            })
          : t('form.analytics.report.submission', { count: response.count })}
      </div>

      {!isHided && <div className="myform-report-content">{children}</div>}
    </li>
  )
}

const Skeleton = () => {
  return (
    <div>
      <div className="py-[0.3125rem]">
        <div className="skeleton h-3.5 w-72 rounded-sm"></div>
      </div>
      <div className="py-[0.3125rem]">
        <div className="skeleton h-3.5 w-24 rounded-sm"></div>
      </div>
    </div>
  )
}

export default Object.assign(FormReportItem, {
  Skeleton
})
