import { useRequest } from 'ahooks'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { UserService } from '@/services'
import { useRouter } from '@/utils'

import {
  Button,
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
  useToast
} from '@/components'
import { getVerifyEmailResendCooldownSeconds } from '@/consts'
import { useUserStore } from '@/store'

export default function VerifyEmail() {
  const { t } = useTranslation()

  const router = useRouter()
  const toast = useToast()
  const cooldownSeconds = getVerifyEmailResendCooldownSeconds()
  const {
    temporaryEmail,
    user,
    updateUser,
    setTemporaryEmail,
    verifyEmailSentAt,
    setVerifyEmailSentAt
  } = useUserStore()
  const [now, setNow] = useState(() => Date.now())

  const resendRemaining = useMemo(() => {
    if (!verifyEmailSentAt) {
      return 0
    }

    const cooldownUntil = verifyEmailSentAt + cooldownSeconds * 1000
    const remaining = Math.ceil((cooldownUntil - now) / 1000)
    return remaining > 0 ? remaining : 0
  }, [cooldownSeconds, now, verifyEmailSentAt])

  const { loading: sendLoading, run: sendRun } = useRequest(
    async () => {
      if (user.isEmailVerified) {
        return router.redirect('/')
      }

      await UserService.emailVerificationCode()
      setVerifyEmailSentAt(Date.now())
    },
    {
      manual: true,
      refreshDeps: [user.isEmailVerified],
      onError: err => {
        toast({
          title: t('components.error.title'),
          message: err.message
        })
      }
    }
  )

  useEffect(() => {
    if (!user.isEmailVerified && !temporaryEmail && !verifyEmailSentAt) {
      sendRun()
    }
  }, [sendRun, temporaryEmail, user.isEmailVerified, verifyEmailSentAt])

  useEffect(() => {
    if (resendRemaining < 1) {
      return
    }

    const timer = window.setInterval(() => {
      setNow(Date.now())
    }, 1000)

    return () => {
      window.clearInterval(timer)
    }
  }, [resendRemaining])

  const { loading: verifyLoading, run: verifyRun } = useRequest(
    async (code: string) => {
      await UserService.verifyEmail(code)
      setTemporaryEmail(undefined)
      setVerifyEmailSentAt(undefined)
      updateUser({
        isEmailVerified: true
      })
      router.redirect('/')
    },
    {
      manual: true
    }
  )

  return (
    <div className="mx-auto grid w-full max-w-[21.875rem] gap-6 py-12 lg:py-0">
      <div className="grid gap-2 text-center">
        <h1 className="font-serif text-3xl/10 font-semibold italic tracking-tight">{t('verifyEmail.title')}</h1>
        <p className="text-secondary text-sm">
          {t('verifyEmail.subHeadline', { email: temporaryEmail })}
        </p>
      </div>

      <div className="mt-10">
        <InputOTP maxLength={6} loading={verifyLoading} onComplete={verifyRun}>
          <InputOTPGroup>
            <InputOTPSlot index={0} />
            <InputOTPSlot index={1} />
            <InputOTPSlot index={2} />
          </InputOTPGroup>
          <InputOTPSeparator />
          <InputOTPGroup>
            <InputOTPSlot index={3} />
            <InputOTPSlot index={4} />
            <InputOTPSlot index={5} />
          </InputOTPGroup>
        </InputOTP>

        <p className="text-secondary mt-4 text-center text-sm">
          {resendRemaining > 0 ? (
            <span>{t('verifyEmail.resendCooldown', { seconds: resendRemaining })}</span>
          ) : (
            <>
              <span>{t('verifyEmail.resendLabel')} </span>
              <Button.Link
                className="text-secondary enabled:hover:text-primary !inline-flex !p-0 underline hover:bg-transparent"
                loading={sendLoading}
                onClick={sendRun}
              >
                {t('verifyEmail.resendAction')}
              </Button.Link>
            </>
          )}
        </p>
      </div>
    </div>
  )
}
