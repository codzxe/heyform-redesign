import { Content, Portal, Root, Trigger } from '@radix-ui/react-popover'
import { IconDownload } from '@tabler/icons-react'
import type { Dayjs } from 'dayjs'
import { FC, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button, DatePicker, Tooltip } from '@/components'

export const SUBMISSION_EXPORT_FORMATS = ['csv', 'xlsx', 'pdf'] as const

export type SubmissionExportFormat = (typeof SUBMISSION_EXPORT_FORMATS)[number]

const FORMAT_LABEL_KEYS: Record<SubmissionExportFormat, string> = {
  csv: 'form.submissions.downloadCSV',
  xlsx: 'form.submissions.downloadXLSX',
  pdf: 'form.submissions.downloadPDF'
}

interface ExportMenuProps {
  formId: string
}

/**
 * The submissions export menu: an optional submission-date range plus a
 * download button per format. The download itself is a plain same-origin GET
 * request to the server's export endpoint, so the browser streams the file
 * as an attachment.
 */
const ExportMenu: FC<ExportMenuProps> = ({ formId }) => {
  const { t, i18n } = useTranslation()

  const [isOpen, setOpen] = useState(false)
  const [startDate, setStartDate] = useState<Dayjs | undefined>()
  const [endDate, setEndDate] = useState<Dayjs | undefined>()
  // Bumped on "Clear" so the pickers remount with empty inputs — their
  // internal display cannot be reset through the controlled value alone.
  const [resetKey, setResetKey] = useState(0)

  function handleClear() {
    setStartDate(undefined)
    setEndDate(undefined)
    setResetKey(key => key + 1)
  }

  function handleDownload(format: SubmissionExportFormat) {
    const params = new URLSearchParams({
      formId,
      format
    })

    // Local day boundaries, sent as full ISO timestamps (UTC-normalized)
    if (startDate) {
      params.set('from', startDate.startOf('day').toISOString())
    }

    if (endDate) {
      params.set('to', endDate.endOf('day').toISOString())
    }

    window.open(`/api/export/submissions?${params.toString()}`)
    setOpen(false)
  }

  return (
    <Root open={isOpen} onOpenChange={setOpen}>
      <Tooltip label={t('form.submissions.export')}>
        <Trigger asChild>
          <Button.Ghost
            size="md"
            iconOnly
            aria-label={t('form.submissions.export')}
            aria-haspopup="dialog"
          >
            <IconDownload className="h-5 w-5" />
          </Button.Ghost>
        </Trigger>
      </Tooltip>

      <Portal>
        <Content
          align="end"
          sideOffset={8}
          collisionPadding={16}
          className="bg-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-90 data-[state=open]:zoom-in-90 z-10 w-72 origin-top-right rounded-lg p-4 text-sm shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none"
        >
          <div className="flex items-center justify-between gap-x-2">
            <span className="text-primary font-medium">{t('form.submissions.exportHeadline')}</span>

            {(startDate || endDate) && (
              <button
                type="button"
                className="text-secondary hover:text-primary cursor-pointer rounded text-xs underline-offset-2 hover:underline"
                onClick={handleClear}
              >
                {t('form.submissions.exportClear')}
              </button>
            )}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="min-w-0">
              <span className="text-secondary mb-1 block text-xs">
                {t('form.submissions.exportFrom')}
              </span>

              <DatePicker
                key={`from-${resetKey}`}
                locale={i18n.language}
                value={startDate}
                maxDate={endDate}
                startDate={startDate}
                endDate={endDate}
                selectsStart
                placeholder={t('form.submissions.exportFrom')}
                onChange={setStartDate}
              />
            </label>

            <label className="min-w-0">
              <span className="text-secondary mb-1 block text-xs">
                {t('form.submissions.exportTo')}
              </span>

              <DatePicker
                key={`to-${resetKey}`}
                locale={i18n.language}
                value={endDate}
                minDate={startDate}
                startDate={startDate}
                endDate={endDate}
                selectsEnd
                placeholder={t('form.submissions.exportTo')}
                onChange={setEndDate}
              />
            </label>
          </div>

          <p className="text-secondary mt-2 text-xs">{t('form.submissions.exportHint')}</p>

          <div className="mt-3 grid grid-cols-1 gap-1.5">
            {SUBMISSION_EXPORT_FORMATS.map(format => (
              <Button.Ghost
                key={format}
                size="sm"
                className="text-xs [&_[data-slot=button]]:justify-start"
                onClick={() => handleDownload(format)}
              >
                <IconDownload className="h-4 w-4" />
                <span>{t(FORMAT_LABEL_KEYS[format])}</span>
              </Button.Ghost>
            ))}
          </div>
        </Content>
      </Portal>
    </Root>
  )
}

export default ExportMenu
