import { useTranslation } from 'react-i18next'

import { Form, Input, Switch } from '@/components'
import { useFormStore } from '@/store'

export default function FormSettingsQuiz() {
  const { t } = useTranslation()
  const { tempSettings } = useFormStore()

  return (
    <section id="quiz" className="pt-10">
      <h2 className="font-serif text-xl font-semibold tracking-tight">
        {t('form.settings.quiz.title')}
      </h2>
      <p className="text-secondary mt-2 text-sm/6">{t('form.settings.quiz.description')}</p>

      <div className="mt-4 space-y-8">
        <Form.Item
          className="[&_[data-slot=content]]:pt-1.5"
          name="showResultsOnCompletion"
          label={t('form.settings.quiz.showResultsOnCompletion')}
          isInline
        >
          <Switch />
        </Form.Item>

        <Form.Item name="quizPassingScore" label={t('form.settings.quiz.quizPassingScore')}>
          <Input className="w-full sm:w-32" type="number" min={0} max={100} />
        </Form.Item>

        <div>
          <Form.Item
            className="[&_[data-slot=content]]:pt-1.5"
            name="showLeaderboard"
            label={t('form.settings.quiz.leaderboard.show')}
            isInline
          >
            <Switch />
          </Form.Item>

          {tempSettings?.showLeaderboard && (
            <>
              <Form.Item
                className="mt-4"
                name="leaderboardSize"
                label={t('form.settings.quiz.leaderboard.size')}
              >
                <Input className="w-full sm:w-32" type="number" min={1} max={100} />
              </Form.Item>

              <Form.Item
                className="mt-4 [&_[data-slot=content]]:pt-1.5"
                name="anonymousLeaderboard"
                label={t('form.settings.quiz.leaderboard.anonymous')}
                isInline
              >
                <Switch />
              </Form.Item>
            </>
          )}
        </div>

        <p className="border-accent-light text-secondary rounded-xl border p-4 text-sm/6">
          {t('form.settings.quiz.scoringHint')}
        </p>
      </div>
    </section>
  )
}
