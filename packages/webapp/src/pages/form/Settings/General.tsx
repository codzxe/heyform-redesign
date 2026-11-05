import { FormResponseLayoutEnum } from '@myform/shared-types-enums'
import { useTranslation } from 'react-i18next'

import { cn } from '@/utils'

import { Form, Switch } from '@/components'

const RESPONSE_LAYOUT_OPTIONS = [
  {
    value: FormResponseLayoutEnum.CONVERSATIONAL,
    title: 'form.settings.responseLayout.conversational',
    description: 'form.settings.responseLayout.conversationalDescription'
  },
  {
    value: FormResponseLayoutEnum.CLASSIC,
    title: 'form.settings.responseLayout.classic',
    description: 'form.settings.responseLayout.classicDescription'
  }
]

export default function FormSettingsGeneral() {
  const { t } = useTranslation()

  return (
    <section id="general">
      <h2 className="font-serif text-xl font-semibold tracking-tight">
        {t('form.settings.general.title')}
      </h2>

      <div className="mt-4 space-y-8">
        <Form.Item
          name="responseLayout"
          label={t('form.settings.responseLayout.label')}
          description={t('form.settings.responseLayout.description')}
        >
          {(control: Any) => {
            const value = control.value ?? FormResponseLayoutEnum.CONVERSATIONAL

            return (
              <div
                className="grid gap-4 sm:grid-cols-2"
                role="radiogroup"
                aria-label={t('form.settings.responseLayout.label')}
              >
                {RESPONSE_LAYOUT_OPTIONS.map(option => {
                  const checked = value === option.value

                  return (
                    <div
                      key={option.value}
                      role="radio"
                      aria-checked={checked}
                      tabIndex={0}
                      className={cn(
                        'border-input hover:border-primary focus-visible:border-primary cursor-pointer rounded-xl border p-4 ring-1 ring-transparent transition-colors focus-visible:outline-none',
                        {
                          'border-primary ring-input': checked
                        }
                      )}
                      onClick={() => control.onChange(option.value)}
                      onKeyDown={event => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          control.onChange(option.value)
                        }
                      }}
                    >
                      <div className="flex items-center gap-x-2.5">
                        <span
                          aria-hidden="true"
                          className={cn(
                            'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                            checked ? 'border-primary' : 'border-input'
                          )}
                        >
                          <span
                            className={cn('bg-primary h-2 w-2 rounded-full transition-opacity', {
                              'opacity-100': checked,
                              'opacity-0': !checked
                            })}
                          />
                        </span>

                        <span
                          className={cn(
                            'text-base/6 font-medium sm:text-sm/6',
                            checked ? 'text-primary' : 'text-secondary'
                          )}
                        >
                          {t(option.title)}
                        </span>
                      </div>

                      <p className="text-secondary mt-2 text-sm/5">{t(option.description)}</p>
                    </div>
                  )
                })}
              </div>
            )
          }}
        </Form.Item>

        <Form.Item
          className="[&_[data-slot=content]]:pt-1.5"
          name="allowArchive"
          label={t('form.settings.general.archive.headline')}
          description={t('form.settings.general.archive.subHeadline')}
          isInline
        >
          <Switch />
        </Form.Item>

        <Form.Item
          className="[&_[data-slot=content]]:pt-1.5"
          name="enableProgress"
          label={t('form.settings.general.progressBar.headline')}
          description={t('form.settings.general.progressBar.subHeadline')}
          isInline
        >
          <Switch />
        </Form.Item>

        <Form.Item
          className="[&_[data-slot=content]]:pt-1.5"
          name="enableQuestionList"
          label={t('form.settings.general.viewQuestions.headline')}
          description={t('form.settings.general.viewQuestions.subHeadline')}
          isInline
        >
          <Switch />
        </Form.Item>

        <Form.Item
          className="[&_[data-slot=content]]:pt-1.5"
          name="enableNavigationArrows"
          label={t('form.settings.general.navigationArrows.headline')}
          description={t('form.settings.general.navigationArrows.subHeadline')}
          isInline
        >
          <Switch />
        </Form.Item>

        <Form.Item
          className="[&_[data-slot=content]]:pt-1.5"
          name="openLinksInNewTab"
          label={t('form.settings.general.openLinksInNewTab.headline')}
          description={t('form.settings.general.openLinksInNewTab.subHeadline')}
          isInline
        >
          <Switch />
        </Form.Item>
      </div>
    </section>
  )
}
