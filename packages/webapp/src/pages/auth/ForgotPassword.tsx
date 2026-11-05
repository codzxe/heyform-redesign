import { Trans, useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { AuthService } from '@/services'
import { useRouter } from '@/utils'

import { Form, Input } from '@/components'
import { useUserStore } from '@/store'

const ForgotPassword = () => {
  const { t } = useTranslation()

  const router = useRouter()
  const { setTemporaryEmail } = useUserStore()

  async function fetch({ email }: any) {
    await AuthService.sendResetEmail(email)

    setTemporaryEmail(email)
    router.replace('/reset-password')
  }

  return (
    <div className="mx-auto grid w-full max-w-[21.875rem] gap-6 py-12 lg:py-0">
      <div className="grid gap-2 text-center">
        <h1 className="font-serif text-3xl/10 font-semibold italic tracking-tight">{t('forgotPassword.title')}</h1>
        <p className="text-secondary text-sm">{t('forgotPassword.subHeadline')}</p>
      </div>

      <Form.Simple
        className="space-y-4"
        fetch={fetch}
        submitProps={{
          label: t('components.continue'),
          className: 'w-full'
        }}
      >
        <Form.Item
          name="email"
          label={t('login.email.label')}
          rules={[
            {
              required: true,
              message: t('login.email.required')
            },
            {
              type: 'email',
              message: t('login.email.invalid')
            }
          ]}
        >
          <Input type="email" />
        </Form.Item>
      </Form.Simple>

      <p className="text-secondary text-center text-sm">
        <Trans
          t={t}
          i18nKey="forgotPassword.toLogin"
          components={{
            a: <Link className="text-primary hover:text-brand dark:text-brand dark:hover:text-primary font-medium underline underline-offset-4 decoration-accent hover:decoration-brand" to="/login" />
          }}
        />
      </p>
    </div>
  )
}

export default ForgotPassword
