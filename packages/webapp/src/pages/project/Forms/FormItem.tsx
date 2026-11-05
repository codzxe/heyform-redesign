import {
  IconCopy,
  IconDots,
  IconPencil,
  IconRestore,
  IconShare,
  IconTag,
  IconTrash
} from '@tabler/icons-react'
import { useRequest } from 'ahooks'
import { FC, MouseEvent, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { FormService } from '@/services'
import { cn, timeFromNow, timeToNow, useRouter } from '@/utils'

import IconLink from '@/assets/link.svg?react'
import IconMoveTo from '@/assets/move-to.svg?react'
import { Badge, Button, Dropdown, Tooltip, useAlert, usePrompt } from '@/components'
import { useWorkspaceStore } from '@/store'
import { FormType } from '@/types'

interface FormItemLinkProps extends ComponentProps {
  to: string
  isInTrash?: boolean
  isSuspended?: boolean
}

const FormStatus: FC<{ form?: FormType }> = ({ form }) => {
  const { t } = useTranslation()

  if (!form) {
    return null
  } else if (form.suspended) {
    return <Badge color="red">{t('form.suspended')}</Badge>
  } else if (form.isDraft) {
    return <Badge color="zinc">{t('form.draft')}</Badge>
  } else if (form.settings?.active) {
    return <Badge color="green">{t('form.active')}</Badge>
  } else {
    return <Badge color="zinc">{t('form.closed')}</Badge>
  }
}

const FormItemLink: FC<FormItemLinkProps> = ({
  to,
  isInTrash = false,
  isSuspended = false,
  children,
  ...restProps
}) => {
  const { t } = useTranslation()
  const alert = useAlert()

  function handleSuspend() {
    alert({
      title: t('form.suspend.headline'),
      description: t('form.suspend.subHeadline'),
      confirmProps: {
        label: t('form.suspend.contactUs')
      },
      onConfirm() {
        window.location.href = 'https://heyform.net/f/E4MKK2hx'
      }
    })
  }

  if (isSuspended) {
    return (
      <div {...restProps} onClick={handleSuspend}>
        {children}
      </div>
    )
  } else if (isInTrash) {
    return <div {...restProps}>{children}</div>
  } else {
    return (
      <Link to={to} {...restProps}>
        {children}
      </Link>
    )
  }
}

interface FormItemProps {
  compact?: boolean
  form: FormType
  isInTrash?: boolean
  onChange?: (type: 'rename' | 'trash' | 'restore' | 'delete' | 'move', form: FormType) => void
}

/* Editorial gradient tiles — deterministic per form id */
const FORM_TILE_THEMES = [
  'linear-gradient(135deg, #26352B 0%, #3D5744 100%)',
  'linear-gradient(135deg, #B4653F 0%, #D68A5E 100%)',
  'linear-gradient(135deg, #8A7B5C 0%, #B7A87F 100%)',
  'linear-gradient(135deg, #44586B 0%, #6B8095 100%)',
  'linear-gradient(135deg, #5F4567 0%, #8A6A93 100%)',
  'linear-gradient(135deg, #2E6157 0%, #4C897B 100%)',
  'linear-gradient(135deg, #A05C4E 0%, #C4806F 100%)',
  'linear-gradient(135deg, #51624C 0%, #73866B 100%)'
]

function formTileTheme(id: string): string {
  let hash = 0

  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0
  }

  return FORM_TILE_THEMES[Math.abs(hash) % FORM_TILE_THEMES.length]
}

function formInitial(name: string): string {
  const char = (name || '').trim().charAt(0)

  return char ? char.toUpperCase() : 'H'
}

const FormItem: FC<FormItemProps> = ({ form, isInTrash, onChange, compact = false }) => {
  const { t, i18n } = useTranslation()

  const alert = useAlert()
  const prompt = usePrompt()
  const router = useRouter()
  const { workspace, sharingURLPrefix } = useWorkspaceStore()

  const options = useMemo(
    () =>
      isInTrash
        ? [
            {
              value: 'restore',
              icon: <IconRestore className="h-4 w-4" />,
              label: 'components.restore'
            },
            {
              value: 'delete',
              icon: <IconTrash className="h-4 w-4" />,
              label: 'components.permanentlyDelete'
            }
          ]
        : [
            {
              value: 'edit',
              icon: <IconPencil className="h-4 w-4" />,
              label: 'components.edit'
            },
            {
              value: 'rename',
              icon: <IconTag className="h-4 w-4" />,
              label: 'components.rename'
            },
            {
              value: 'share',
              icon: <IconShare className="h-4 w-4" />,
              label: 'components.share'
            },
            {
              value: 'duplicate',
              icon: <IconCopy className="h-4 w-4" />,
              label: 'components.duplicate'
            },
            {
              value: 'moveto',
              icon: <IconMoveTo className="h-4 w-4" />,
              label: 'components.moveto'
            },
            {
              value: 'trash',
              icon: <IconTrash className="h-4 w-4" />,
              label: 'components.delete'
            }
          ],
    [isInTrash]
  )

  function handleEdit(event?: MouseEvent<HTMLButtonElement>) {
    event?.preventDefault()
    router.push(`/workspace/${form.teamId}/project/${form.projectId}/form/${form.id}/create`)
  }

  function handleShare(event?: MouseEvent<HTMLButtonElement>) {
    event?.preventDefault()
    router.push(`/workspace/${form.teamId}/project/${form.projectId}/form/${form.id}/share`)
  }

  const { runAsync: handleDuplicate } = useRequest(
    async () => {
      const name = t('form.duplicate', { name: form.name })
      const id = await FormService.duplicate(form.id, name)

      router.push(`/workspace/${form.teamId}/project/${form.projectId}/form/${id}/create`)
    },
    {
      refreshDeps: [form],
      manual: true
    }
  )

  function handleRename() {
    prompt({
      value: form,
      title: t('project.rename.headline'),
      inputProps: {
        name: 'name',
        label: t('project.rename.name.label'),
        rules: [
          {
            required: true,
            message: t('project.rename.name.required')
          }
        ]
      },
      submitProps: {
        className: '!mt-4 px-5 min-w-24',
        size: 'md',
        label: t('components.save')
      },
      fetch: async values => {
        await FormService.update(form.id, values)

        onChange?.('rename', {
          ...form,
          ...values
        })
      }
    })
  }

  function handleMoveTo() {
    prompt({
      value: {
        projectId: form.projectId
      },
      title: t('project.moveto.headline', { name: form.name }),
      selectProps: {
        className: 'w-full',
        name: 'projectId',
        rules: [
          {
            required: true,
            message: t('project.moveto.project.required')
          }
        ],
        options: workspace.projects || [],
        labelKey: 'name',
        valueKey: 'id'
      },
      submitProps: {
        className: '!mt-4 px-5 min-w-24',
        size: 'md',
        label: t('components.save')
      },
      submitOnChangedOnly: true,
      fetch: async values => {
        const result = await FormService.moveToProject(form.id, values.projectId)

        if (result) {
          router.replace(
            `/workspace/${form.teamId}/project/${values.projectId}/form/${form.id}/analytics`
          )
        }
      }
    })
  }

  const { runAsync } = useRequest(
    async (type: string) => {
      switch (type) {
        case 'trash':
          await FormService.moveToTrash(form.id)
          onChange?.(type, form)
          break

        case 'restore':
          await FormService.restoreForm(form.id)
          onChange?.(type, form)
          break

        case 'delete':
          alert({
            title: t('project.trash.delete.headline', { name: form.name }),
            description: t('project.trash.delete.subHeadline'),
            cancelProps: {
              label: t('components.cancel')
            },
            confirmProps: {
              label: t('components.delete'),
              className: 'bg-error text-primary-light dark:text-primary hover:bg-error'
            },
            fetch: async () => {
              await FormService.delete(form.id)
              onChange?.(type, form)
            }
          })
          break
      }
    },
    {
      refreshDeps: [form],
      manual: true
    }
  )

  async function handleClick(value: string) {
    switch (value) {
      case 'edit':
        return handleEdit()

      case 'share':
        return handleShare()

      case 'rename':
        return handleRename()

      case 'duplicate':
        return handleDuplicate()

      case 'moveto':
        return handleMoveTo()

      case 'trash':
      case 'restore':
      case 'delete':
        return runAsync(value)
    }
  }

  return (
    <FormItemLink
      className={cn(
        'group',
        compact
          ? 'block'
          : 'hover:bg-secondary-light has-[[data-state=open]]:bg-secondary-light flex items-center justify-between gap-6 rounded-xl px-4 py-4'
      )}
      to={`/workspace/${form.teamId}/project/${form.projectId}/form/${form.id}/analytics`}
      isInTrash={isInTrash}
      isSuspended={form.suspended}
    >
      {compact ? (
        <div className="hf-card group/card overflow-hidden transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-lg">
          <div
            className="relative flex h-24 items-end overflow-hidden p-4"
            style={{ background: formTileTheme(form.id) }}
          >
            <span
              className="font-serif text-4xl italic leading-none text-white/95"
              style={{ textShadow: '0 1px 8px rgb(0 0 0 / 0.18)' }}
            >
              {formInitial(form.name)}
            </span>

            <div className="absolute inset-x-0 top-0 flex items-start justify-end p-2.5">
              <div className="flex items-center gap-1 opacity-0 transition-opacity duration-200 group-hover/card:opacity-100 group-focus-within/card:opacity-100">
                {!form.suspended && !isInTrash && (
                  <>
                    <Button.Link
                      size="sm"
                      className="bg-white/15 text-white backdrop-blur-sm hover:bg-white/25"
                      iconOnly
                      onClick={handleEdit}
                    >
                      <IconPencil className="h-4 w-4" />
                    </Button.Link>

                    <Button.Link
                      size="sm"
                      className="bg-white/15 text-white backdrop-blur-sm hover:bg-white/25"
                      iconOnly
                      onClick={() => handleShare()}
                    >
                      <IconShare className="h-4 w-4" />
                    </Button.Link>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="p-4">
            <div className="truncate text-sm/6 font-medium">{form.name}</div>

            <div className="mt-1 truncate text-xs/5 text-secondary">
              {isInTrash
                ? t('form.metadata2', {
                    count: form.submissionCount,
                    date: timeToNow(form.retentionAt, i18n.language)
                  })
                : t('form.metadata', {
                    count: form.submissionCount,
                    date: timeFromNow(form.updatedAt, i18n.language)
                  })}
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <FormStatus form={form} />

              {!form.suspended && (
                <div className="flex items-center">
                  {!isInTrash && (
                    <Button.Copy
                      size="sm"
                      className="text-secondary"
                      text={`${sharingURLPrefix}/form/${form.id}`}
                      label={t('form.copyLinkToShare')}
                      icon={<IconLink className="h-4 w-4" strokeWidth={2.2} />}
                    />
                  )}

                  <Dropdown
                    contentProps={{
                      className:
                        'min-w-36 [&_[data-value=delete]]:text-error [&_[data-value=trash]]:text-error',
                      side: 'bottom',
                      sideOffset: 8,
                      align: 'end'
                    }}
                    options={options}
                    multiLanguage
                    onClick={handleClick}
                  >
                    <Button.Link
                      size="sm"
                      className="text-secondary data-[state=open]:bg-accent-light"
                      iconOnly
                    >
                      <Tooltip label={t('form.menuTip')}>
                        <IconDots className="h-4 w-4" />
                      </Tooltip>
                    </Button.Link>
                  </Dropdown>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="min-w-0 flex-1">
            <div className="break-words text-sm/6 font-medium">{form.name}</div>
            <div className="mt-1 text-sm/6 text-secondary">
              {isInTrash
                ? t('form.metadata2', {
                    count: form.submissionCount,
                    date: timeToNow(form.retentionAt, i18n.language)
                  })
                : t('form.metadata', {
                    count: form.submissionCount,
                    date: timeFromNow(form.updatedAt, i18n.language)
                  })}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <FormStatus form={form} />

            {!form.suspended && (
              <Dropdown
                contentProps={{
                  className:
                    'min-w-36 [&_[data-value=delete]]:text-error [&_[data-value=trash]]:text-error',
                  side: 'bottom',
                  sideOffset: 8,
                  align: 'end'
                }}
                options={options}
                multiLanguage
                onClick={handleClick}
              >
                <Button.Link
                  size="sm"
                  className="text-secondary data-[state=open]:bg-accent-light"
                  iconOnly
                >
                  <Tooltip label={t('form.menuTip')}>
                    <IconDots className="h-4 w-4" />
                  </Tooltip>
                </Button.Link>
              </Dropdown>
            )}
          </div>
        </>
      )}
    </FormItemLink>
  )
}

const Skeleton = () => {
  return (
    <div>
      <div className="hf-card overflow-hidden">
        <div className="skeleton h-24 rounded-none" />
        <div className="p-4">
          <div className="skeleton h-4 w-3/4 rounded-md" />
          <div className="skeleton mt-2 h-3 w-1/2 rounded-md" />
          <div className="mt-4 flex items-center justify-between">
            <div className="skeleton h-5 w-16 rounded-full" />
            <div className="skeleton h-5 w-12 rounded-md" />
          </div>
        </div>
      </div>
    </div>
  )
}

export default Object.assign(FormItem, {
  Skeleton
})
