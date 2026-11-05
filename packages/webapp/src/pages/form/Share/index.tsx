import {
  IconBrandFacebook,
  IconBrandLinkedin,
  IconBrandX,
  IconExclamationCircle,
  IconMail,
  IconQrcode
} from '@tabler/icons-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { getDecoratedURL, useParam } from '@/utils'

import { Button, Tooltip } from '@/components'
import { FORM_EMBED_OPTIONS } from '@/consts'
import { useAppStore, useFormStore, useWorkspaceStore } from '@/store'

import EmbedModal from './EmbedModal'
import LinkSettings from './LinkSettings'
import QRCodeModal from './QRCodeModal'

export default function FormShare() {
  const { t } = useTranslation()

  const { formId } = useParam()
  const { openModal } = useAppStore()
  const { sharingURLPrefix } = useWorkspaceStore()
  const { form, selectEmbedType } = useFormStore()

  const shareLink = useMemo(() => sharingURLPrefix + '/form/' + formId, [formId, sharingURLPrefix])

  function handleShareEmail() {
    const url = getDecoratedURL('mailto:', {
      subject: 'Cold you take a moment to fill in this heyform?',
      body: `We would really appreciate it if you filled in this form: ${shareLink}. Thank you.`
    })
    window.open(url)
  }

  function handleShareFacebook() {
    const url = getDecoratedURL('https://www.facebook.com/sharer/sharer.php', {
      u: shareLink
    })
    window.open(url)
  }

  function handleShareLinkedin() {
    const url = getDecoratedURL('https://www.linkedin.com/sharing/share-offsite', {
      url: shareLink
    })
    window.open(url)
  }

  function handleShareTwitter() {
    const url = getDecoratedURL('https://twitter.com/share', {
      url: shareLink,
      title: form?.name || ''
    })
    window.open(url)
  }

  function handleShareQrcode() {
    openModal('QRCodeModal', {
      url: shareLink
    })
  }

  function handleOpenEmbed(embedType: string) {
    selectEmbedType(embedType)
    openModal('EmbedModal')
  }

  return (
    <>
      <div className="mt-10 space-y-10">
        {form?.canPublish && (
          <div
            className="flex items-center justify-center gap-x-2 rounded-2xl border py-3"
            style={{
              borderColor: 'rgb(220 38 38 / 0.25)',
              background: 'rgb(220 38 38 / 0.06)'
            }}
          >
            <IconExclamationCircle className="h-5 w-5 text-red-700" />
            <span className="text-sm/6 font-medium text-red-700">
              {t('form.share.unpublishedTip')}
            </span>
          </div>
        )}

        <section id="link">
          <h2 className="hf-section-title font-serif">{t('form.share.link.headline')}</h2>
          <div className="mt-4">
            <div className="flex flex-col gap-2 text-sm/6 sm:flex-row sm:items-center">
              <div
                className="flex items-center gap-x-4 rounded-xl border"
                style={{
                  borderColor: 'rgba(var(--hf-dashboard-border))',
                  background: 'rgba(var(--hf-dashboard-zone))'
                }}
              >
                <div className="h-11 flex-1 truncate pl-4 text-sm/6 leading-11">{shareLink}</div>
                <Button.Copy className="rounded-l-none" text={shareLink} />
              </div>
            </div>

            <div className="mt-3 flex items-center gap-x-2">
              <Tooltip label={t('form.share.link.viaX')}>
                <div>
                  <Button.Link size="md" iconOnly onClick={handleShareTwitter}>
                    <IconBrandX className="h-5 w-5" />
                  </Button.Link>
                </div>
              </Tooltip>

              <Tooltip label={t('form.share.link.viaFacebook')}>
                <div>
                  <Button.Link size="md" iconOnly onClick={handleShareFacebook}>
                    <IconBrandFacebook className="h-5 w-5" />
                  </Button.Link>
                </div>
              </Tooltip>

              <Tooltip label={t('form.share.link.viaLinkedIn')}>
                <div>
                  <Button.Link size="md" iconOnly onClick={handleShareLinkedin}>
                    <IconBrandLinkedin className="h-5 w-5" />
                  </Button.Link>
                </div>
              </Tooltip>

              <Tooltip label={t('form.share.link.email.title')}>
                <div>
                  <Button.Link size="md" iconOnly onClick={handleShareEmail}>
                    <IconMail className="h-5 w-5" />
                  </Button.Link>
                </div>
              </Tooltip>

              <Tooltip label={t('form.share.link.qrcode.title')}>
                <div>
                  <Button.Link size="md" iconOnly onClick={handleShareQrcode}>
                    <IconQrcode className="h-5 w-5" />
                  </Button.Link>
                </div>
              </Tooltip>
            </div>
          </div>
        </section>

        <LinkSettings />

        <section id="embed">
          <h2 className="hf-section-title font-serif">{t('form.share.embed.headline')}</h2>
          <p className="text-secondary mt-1 text-sm/6">{t('form.share.embed.subHeadline')}</p>

          <div className="mt-4 flex gap-4 sm:gap-6">
            {FORM_EMBED_OPTIONS.map(row => (
              <button
                key={row.value}
                type="button"
                tabIndex={-1}
                className="text-secondary hover:text-primary group w-32 text-sm/6"
                onClick={() => handleOpenEmbed(row.value)}
              >
                <div
                  className="overflow-hidden rounded-xl border transition-all group-hover:-translate-y-0.5"
                  style={{
                    borderColor: 'rgba(var(--hf-dashboard-border))',
                    background: 'rgba(var(--hf-foreground))'
                  }}
                >
                  <row.icon className="w-full" />
                </div>
                <div className="mt-2 text-center font-medium">{t(row.label)}</div>
              </button>
            ))}
          </div>
        </section>
      </div>

      <QRCodeModal />
      <EmbedModal />
    </>
  )
}
