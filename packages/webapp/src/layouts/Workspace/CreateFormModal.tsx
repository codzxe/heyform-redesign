import { FormKindEnum, InteractiveModeEnum } from '@heyform-inc/shared-types-enums'
import { IconPlus, IconStack2 } from '@tabler/icons-react'
import { useRequest } from 'ahooks'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { FormService } from '@/services'
import { useParam, useRouter } from '@/utils'

import IconAI from '@/assets/ai.svg?react'
import { Button, Modal } from '@/components'
import { useAppStore, useModal } from '@/store'

import CreateWithAIModel from './CreateWithAIModel'
import TemplatesModel from './TemplatesModel'

const FORM_TYPES = [
  {
    id: 'ai',
    headline: 'form.creation.ai.headline',
    subHeadline: 'form.creation.ai.subHeadline',
    icon: IconAI
  },
  {
    id: 'scratch',
    headline: 'form.creation.scratch.headline',
    subHeadline: 'form.creation.scratch.subHeadline',
    icon: IconPlus
  },
  {
    id: 'template',
    headline: 'form.creation.template.headline',
    subHeadline: 'form.creation.template.subHeadline',
    icon: IconStack2
  }
]

const CreateFormComponent = () => {
  const { t } = useTranslation()

  const router = useRouter()
  const { workspaceId, projectId } = useParam()
  const { closeModal } = useAppStore()

  const [activeName, setActiveName] = useState<string>()

  const { loading, run } = useRequest(
    async () => {
      const formId = await FormService.create({
        projectId,
        name: t('form.creation.defaultName'),
        nameSchema: [],
        interactiveMode: InteractiveModeEnum.GENERAL,
        kind: FormKindEnum.SURVEY
      })

      closeModal('CreateFormModal')
      router.push(`/workspace/${workspaceId}/project/${projectId}/form/${formId}/create`)
    },
    {
      refreshDeps: [projectId, t],
      manual: true
    }
  )

  function handleClick(name: string) {
    switch (name) {
      case 'scratch':
        run()
        break

      case 'ai':
        setActiveName(name)
        break

      default:
        setActiveName(name)
        break
    }
  }

  function handleBack() {
    setActiveName(undefined)
  }

  if (activeName === 'template') {
    return <TemplatesModel onBack={handleBack} />
  } else if (activeName === 'ai') {
    return <CreateWithAIModel onBack={handleBack} />
  } else {
    return (
      <>
        <h2 className="font-serif text-primary text-balance text-2xl/8 font-semibold tracking-tight">
          {t('form.creation.headline')}
        </h2>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:w-[42rem] sm:grid-cols-3">
          {FORM_TYPES.map(row => (
            <Button.Link
              key={row.id}
              className="group h-auto rounded-2xl border py-8 transition-all hover:-translate-y-0.5 hover:shadow-md sm:aspect-square sm:h-auto sm:py-0 [&_[data-slot=button]]:h-full [&_[data-slot=button]]:flex-col"
              style={{
                borderColor: 'rgba(var(--hf-dashboard-border))',
                background: 'rgba(var(--hf-foreground))'
              }}
              loading={row.id === 'scratch' && loading}
              disabled={loading}
              onClick={() => handleClick(row.id)}
            >
              <span
                className="flex h-12 w-12 items-center justify-center rounded-2xl transition-transform group-hover:scale-105"
                style={{ background: 'rgba(var(--hf-brand), 0.1)' }}
              >
                <row.icon className="non-scaling-stroke h-6 w-6 text-brand" />
              </span>
              <div className="mt-3 text-sm/6 font-semibold">{t(row.headline)}</div>
              <div className="text-secondary mt-1 px-2 text-center text-xs">
                {t(row.subHeadline)}
              </div>
            </Button.Link>
          ))}
        </div>
      </>
    )
  }
}

export default function CreateFormModal() {
  const { isOpen, onOpenChange } = useModal('CreateFormModal')

  return (
    <Modal
      open={isOpen}
      contentProps={{
        id: 'create-form-modal',
        className: 'sm:max-w-full sm:max-h-[90vh] w-auto'
      }}
      onOpenChange={onOpenChange}
    >
      <CreateFormComponent />
    </Modal>
  )
}
