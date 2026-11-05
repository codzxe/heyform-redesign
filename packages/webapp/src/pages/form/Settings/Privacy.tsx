import { useTranslation } from 'react-i18next'

import { helper } from '@myform/utils'

import { Form, Input, Switch } from '@/components'
import { useFormStore } from '@/store'

const RETENTION_MIN_DAYS = 1
const RETENTION_MAX_DAYS = 3650

export default function FormSettingsPrivacy() {
  const { t } = useTranslation()
  const { tempSettings } = useFormStore()

  // `enableRetention` is a settings-page-only toggle (like `closeForm`): it is
  // seeded from retentionDays when the form loads (unset means the workspace
  // default applies) and stripped out again by the save flow.
  const isRetentionEnabled =
    (tempSettings as AnyMap | undefined)?.enableRetention ??
    helper.isValid(tempSettings?.retentionDays)

  return (
    <section id="privacy" className="pt-10">
      <h2 className="font-serif text-xl font-semibold tracking-tight">
        {t('form.settings.privacy.title')}
      </h2>
      <p className="text-secondary mt-2 text-sm/6">{t('form.settings.privacy.description')}</p>

      <div className="mt-4 space-y-8">
        <div>
          <Form.Item
            className="[&_[data-slot=content]]:pt-1.5"
            name="enableResponseConsent"
            label={t('form.settings.privacy.consent.enable')}
            isInline
          >
            <Switch />
          </Form.Item>

          {tempSettings?.enableResponseConsent && (
            <>
              <Form.Item
                className="mt-4"
                name="consentText"
                label={t('form.settings.privacy.consent.text')}
              >
                <Input.TextArea
                  className="w-full"
                  rows={5}
                  placeholder={t('form.settings.privacy.consent.textPlaceholder')}
                />
              </Form.Item>

              <Form.Item
                className="mt-4"
                name="consentVersion"
                label={t('form.settings.privacy.consent.version')}
                footer={t('form.settings.privacy.consent.versionHint')}
              >
                <Input className="w-full sm:w-40" autoComplete="off" />
              </Form.Item>
            </>
          )}
        </div>

        <div>
          <Form.Item
            className="[&_[data-slot=content]]:pt-1.5"
            name="enableRetention"
            label={t('form.settings.privacy.retention.enable')}
            isInline
          >
            <Switch />
          </Form.Item>

          {isRetentionEnabled && (
            <Form.Item
              className="mt-4"
              name="retentionDays"
              label={t('form.settings.privacy.retention.days')}
              footer={t('form.settings.privacy.retention.hint')}
              rules={[
                {
                  type: 'number',
                  required: true,
                  min: RETENTION_MIN_DAYS,
                  max: RETENTION_MAX_DAYS,
                  message: t('formSettings.dataError')
                }
              ]}
            >
              <Input
                className="w-full sm:w-32"
                type="number"
                min={RETENTION_MIN_DAYS}
                max={RETENTION_MAX_DAYS}
              />
            </Form.Item>
          )}
        </div>
      </div>
    </section>
  )
}
