import { FC } from 'react'
import { useTranslation } from 'react-i18next'

import { PublicDashboardData } from '@/services'
import { toFixed } from '@myform/utils'

import DistributionBars from './DistributionBars'

export type PublicQuestion = NonNullable<PublicDashboardData['questions']>[number]

interface QuestionsSectionProps {
  questions: PublicQuestion[]
}

/**
 * The "questions" metric group of a shared dashboard: per-question response
 * counts, completion rates and answer distributions. Aggregate data only —
 * never anything that could identify a respondent.
 */
const QuestionsSection: FC<QuestionsSectionProps> = ({ questions }) => {
  const { t } = useTranslation()

  return (
    <section className="mt-10 space-y-4">
      {questions.map((question, index) => (
        <article key={`${question.title}-${index}`} className="hf-card p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h3 className="text-base/6 font-medium">{question.title}</h3>
            <span className="text-secondary text-sm tabular-nums">
              {question.responses} · {t('form.analytics.responses')}
            </span>
          </div>

          {question.completionRate !== undefined && (
            <p className="text-secondary mt-1 text-sm tabular-nums">
              {t('form.analytics.completionRate')}: {toFixed(question.completionRate)}%
            </p>
          )}

          {question.distribution && question.distribution.length > 0 && (
            <div className="mt-4">
              <DistributionBars items={question.distribution} />
            </div>
          )}
        </article>
      ))}
    </section>
  )
}

export default QuestionsSection
