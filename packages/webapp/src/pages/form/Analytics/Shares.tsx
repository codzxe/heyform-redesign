import { IconCheck, IconCopy, IconLink, IconX } from '@tabler/icons-react'
import { useRequest } from 'ahooks'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AnalyticsService, DASHBOARD_SHARE_METRIC_OPTIONS, DashboardShare } from '@/services'
import { timeFromNow, unixToDayjs, useParam } from '@/utils'

import { Badge, Button, Checkbox, EmptyState, Select, useAlert, useToast } from '@/components'
import { DATE_FORMATS } from '@/consts'

// Existing i18n keys labelling the four shareable dashboard metrics
const METRIC_LABEL_KEYS: Record<string, string> = {
  overview: 'dashboard.overview',
  trends: 'form.analytics.responseTrend',
  questions: 'form.builder.sidebar.questions',
  heatmap: 'form.analytics.heatmap.title'
}

// The only expiry presets the UI offers; "never" sends no expiresInDays
const EXPIRY_PRESETS = [7, 30, 90]
const EXPIRY_NEVER = 'never'

const COPY_RESET_MS = 3_000

function formatDateTime(timestamp: number, locale: string) {
  const lowerLocale = locale.toLowerCase()
  const formats = DATE_FORMATS[lowerLocale as keyof typeof DATE_FORMATS] ?? DATE_FORMATS.en

  return unixToDayjs(timestamp).locale(lowerLocale).format(formats.date)
}

/**
 * Copies text through the async clipboard API, falling back to a selected
 * off-screen textarea where that API is missing or not permitted.
 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Fall through to the legacy selected-textarea path below
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()

  let copied = false

  try {
    copied = document.execCommand('copy')
  } catch {
    copied = false
  }

  document.body.removeChild(textarea)

  return copied
}

const SharesSkeleton = () => (
  <div className="mt-4 space-y-4">
    {[0, 1].map(index => (
      <div className="hf-card space-y-3 p-5" key={index}>
        <div className="skeleton h-5 w-56 rounded-md" />
        <div className="skeleton h-3.5 w-72 rounded-md" />
      </div>
    ))}
  </div>
)

export default function FormAnalyticsShares() {
  const { t, i18n } = useTranslation()

  const toast = useToast()
  const alert = useAlert()
  const { formId } = useParam()

  const [isCreating, setIsCreating] = useState(false)
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([
    ...DASHBOARD_SHARE_METRIC_OPTIONS
  ])
  const [expiry, setExpiry] = useState(EXPIRY_NEVER)
  const [submitting, setSubmitting] = useState(false)
  const [createdShare, setCreatedShare] = useState<DashboardShare>()
  const [copied, setCopied] = useState(false)

  const {
    loading,
    error: listError,
    data,
    refresh
  } = useRequest(
    async () => {
      // The shared apollo client resolves a query to the first field of its
      // payload (see utils/apollo responseInterceptor), so the awaited value
      // is the DashboardShare[] itself.
      return (await AnalyticsService.dashboardShares(formId)) as unknown as DashboardShare[]
    },
    {
      refreshDeps: [formId],
      onError(err) {
        toast({ title: t('components.error.title'), message: err.message })
      }
    }
  )

  const shares = data ?? []

  const expiryOptions = useMemo(
    () => [
      { value: EXPIRY_NEVER, label: t('form.analytics.share.neverExpires') },
      ...EXPIRY_PRESETS.map(days => ({
        value: String(days),
        label: `${days} ${t('form.settings.access.countdown.days')}`
      }))
    ],
    [t]
  )

  function toggleMetric(metric: string) {
    setSelectedMetrics(prev =>
      prev.includes(metric) ? prev.filter(row => row !== metric) : [...prev, metric]
    )
  }

  function openCreatePanel() {
    // Every new link starts from the full dashboard
    setSelectedMetrics([...DASHBOARD_SHARE_METRIC_OPTIONS])
    setExpiry(EXPIRY_NEVER)
    setIsCreating(true)
  }

  async function handleCreate() {
    if (selectedMetrics.length < 1) {
      return
    }

    setSubmitting(true)

    try {
      // The awaited value is the created share itself (see the note above);
      // its plaintext URL is returned by the API exactly once, on creation only
      const share = (await AnalyticsService.createDashboardShare({
        formId,
        metrics: selectedMetrics,
        expiresInDays: expiry === EXPIRY_NEVER ? undefined : Number(expiry)
      })) as unknown as DashboardShare

      setCreatedShare(share)
      setCopied(false)
      setIsCreating(false)
      await refresh()
    } catch (err: Any) {
      toast({ title: t('components.error.title'), message: err.message })
    }

    setSubmitting(false)
  }

  async function handleCopyUrl() {
    if (!createdShare?.url) {
      return
    }

    if (await copyToClipboard(createdShare.url)) {
      setCopied(true)
      setTimeout(() => setCopied(false), COPY_RESET_MS)
    } else {
      toast({ title: t('components.error.title'), message: t('components.error.message') })
    }
  }

  function handleRevoke(share: DashboardShare) {
    alert({
      title: t('form.analytics.share.revoke'),
      description: share.metrics.map(metric => t(METRIC_LABEL_KEYS[metric] ?? metric)).join(' · '),
      cancelProps: {
        label: t('components.cancel')
      },
      confirmProps: {
        label: t('form.analytics.share.revoke'),
        className: 'bg-error hover:bg-error text-primary-light dark:text-primary'
      },
      showFetchError: false,
      fetch: async () => {
        try {
          await AnalyticsService.revokeDashboardShare(share.id)
        } catch (err: Any) {
          toast({ title: t('components.error.title'), message: err.message })
          throw err
        }

        await refresh()
      }
    })
  }

  const isLoading = loading && !data

  return (
    <section aria-labelledby="form-analytics-shares-title" className="mt-14">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h2 className="hf-section-title font-serif" id="form-analytics-shares-title">
            {t('form.analytics.share.title')}
          </h2>
          <p className="text-secondary mt-1.5 max-w-xl text-sm/5">
            {t('form.analytics.share.description')}
          </p>
        </div>

        {!isCreating && (
          <Button className="shrink-0" size="md" onClick={openCreatePanel}>
            {t('form.analytics.share.create')}
          </Button>
        )}
      </div>

      {isCreating && (
        <div className="hf-card mt-4 p-5">
          <h3 className="text-base/6 font-semibold">{t('form.analytics.share.create')}</h3>

          <fieldset className="mt-4">
            <legend className="text-base/6 font-medium">
              {t('form.analytics.share.metrics.label')}
            </legend>
            <p className="text-secondary mt-1 text-sm/5">
              {t('form.analytics.share.metrics.hint')}
            </p>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {DASHBOARD_SHARE_METRIC_OPTIONS.map(metric => (
                <label
                  className="border-input hover:bg-accent-light flex cursor-pointer items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm/6"
                  key={metric}
                >
                  <Checkbox
                    value={selectedMetrics.includes(metric)}
                    onChange={() => toggleMetric(metric)}
                  />
                  {t(METRIC_LABEL_KEYS[metric] ?? metric)}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="mt-5 sm:max-w-xs">
            <label
              className="mb-1.5 block text-base/6 font-medium sm:text-sm/6"
              htmlFor="share-expiry"
            >
              {t('form.analytics.share.expiresAt')}
            </label>
            <Select
              className="w-full"
              id="share-expiry"
              options={expiryOptions}
              value={expiry}
              onChange={setExpiry}
            />
          </div>

          <div className="mt-6 flex items-center gap-3">
            <Button
              disabled={selectedMetrics.length < 1}
              loading={submitting}
              size="md"
              onClick={handleCreate}
            >
              {t('form.analytics.share.create')}
            </Button>
            <Button.Ghost size="md" onClick={() => setIsCreating(false)}>
              {t('components.cancel')}
            </Button.Ghost>
          </div>
        </div>
      )}

      {createdShare?.url && (
        <div aria-live="polite" className="hf-card mt-4 p-5" role="status">
          <div className="flex items-start justify-between gap-3">
            <p className="flex items-center gap-2 text-sm/6 font-medium">
              <IconCheck className="h-5 w-5 shrink-0 text-green-700" />
              {t('form.analytics.share.created')}
            </p>

            <Button.Link
              className="text-secondary hover:text-primary -mt-1 mr-2"
              iconOnly
              size="sm"
              onClick={() => setCreatedShare(undefined)}
            >
              <span className="sr-only">{t('components.close')}</span>
              <IconX className="h-5 w-5" />
            </Button.Link>
          </div>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="bg-background border-input min-w-0 flex-1 break-all rounded-xl border px-3.5 py-2 text-sm/6">
              {createdShare.url}
            </code>
            <Button className="shrink-0" size="md" onClick={handleCopyUrl}>
              {copied ? (
                <IconCheck className="h-4.5 w-4.5" />
              ) : (
                <IconCopy className="h-4.5 w-4.5" />
              )}
              {copied ? t('form.analytics.share.copied') : t('form.analytics.share.copy')}
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <SharesSkeleton />
      ) : listError && !data ? (
        <div className="hf-empty-state mt-4 flex flex-col items-center p-10 text-center">
          <p className="text-sm/6 font-medium">{t('components.error.title')}</p>
          <p className="text-secondary mt-1 text-sm/5">{t('components.error.message')}</p>
          <Button.Ghost className="mt-5" size="md" onClick={() => refresh()}>
            {t('components.error.retry')}
          </Button.Ghost>
        </div>
      ) : shares.length < 1 ? (
        <EmptyState
          buttonTitle={t('form.analytics.share.create')}
          className="mt-4"
          headline={t('form.analytics.share.empty')}
          icon={<IconLink className="h-10 w-10" />}
          onClick={openCreatePanel}
        />
      ) : (
        <ul className="mt-4 space-y-4">
          {shares.map(share => (
            <li className="hf-card p-5" key={share.id}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {share.metrics.map(metric => (
                      <span
                        className="bg-accent-light rounded-lg px-2.5 py-0.5 text-sm/5 font-medium"
                        key={metric}
                      >
                        {t(METRIC_LABEL_KEYS[metric] ?? metric)}
                      </span>
                    ))}

                    {share.revokedAt && (
                      <Badge color="zinc">{t('form.analytics.share.revoked')}</Badge>
                    )}
                  </div>

                  <div className="text-secondary mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm/5">
                    <span>{timeFromNow(share.createdAt, i18n.language)}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {share.expiresAt
                        ? `${t('form.analytics.share.expiresAt')} ${formatDateTime(share.expiresAt, i18n.language)}`
                        : t('form.analytics.share.neverExpires')}
                    </span>
                  </div>
                </div>

                <Button.Ghost
                  className="text-error hover:text-error shrink-0"
                  disabled={!!share.revokedAt}
                  size="sm"
                  onClick={() => handleRevoke(share)}
                >
                  {t('form.analytics.share.revoke')}
                </Button.Ghost>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
