import { LayoutProps } from '@/lib/router'
import { FC, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { helper } from '@myform/utils'

import Logo from '@/assets/logo.svg?react'

import LanguageSwitcher from './LanguageSwitcher'

export const AuthLayout: FC<LayoutProps> = ({ options, children }) => {
  const { t } = useTranslation()

  useEffect(() => {
    if (helper.isValid(options?.title)) {
      document.title = `${t(options!.title)} - MyForm`
    }
  }, [options, t])

  return (
    <div className="bg-background relative flex min-h-screen flex-col">
      {/* Warm editorial backdrop */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-48 left-1/2 h-[28rem] w-[52rem] -translate-x-1/2 rounded-full bg-brand/[0.09] blur-3xl" />
        <div className="absolute -bottom-48 -left-32 h-[26rem] w-[26rem] rounded-full bg-[rgb(242_193_78_/_0.18)] blur-3xl" />
        <div className="absolute -right-40 top-1/3 h-[22rem] w-[22rem] rounded-full bg-[rgb(127_169_140_/_0.16)] blur-3xl" />
      </div>

      <header className="relative z-10 flex items-center justify-between p-4 lg:p-6">
        <a href="/" className="flex items-center gap-2.5" title="MyForm">
          <Logo className="h-8 w-auto" />
          <span className="text-xl font-semibold tracking-tight">MyForm</span>
        </a>

        <LanguageSwitcher />
      </header>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 py-10 lg:px-12">
        <div className="bg-foreground border-accent-light w-full max-w-[26.5rem] rounded-3xl border p-6 shadow-[0_1px_2px_rgb(38_53_43_/_0.04),0_24px_48px_-16px_rgb(38_53_43_/_0.12)] sm:p-8">
          {children}
        </div>
      </main>

      <footer className="text-secondary relative z-10 flex items-center justify-center gap-2 pb-6 text-xs lg:pb-8">
        <Logo className="h-4 w-auto opacity-60" />
        <span>MyForm · Beautiful forms, warm hearts</span>
      </footer>
    </div>
  )
}
