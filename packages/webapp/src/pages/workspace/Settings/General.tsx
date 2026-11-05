import { useRequest } from 'ahooks'
import { useTranslation } from 'react-i18next'

import { WorkspaceService } from '@/services'
import { useParam } from '@/utils'

import { ImageFormPicker, Input } from '@/components'
import { useWorkspaceStore } from '@/store'

export default function WorkspaceGeneral() {
  const { t } = useTranslation()

  const { workspaceId } = useParam()
  const { workspace, updateWorkspace } = useWorkspaceStore()

  const { run: handleNameChange } = useRequest(
    async (name: string) => {
      const updates = {
        name
      }

      updateWorkspace(workspaceId, updates)
      await WorkspaceService.update(workspaceId, updates)
    },
    {
      debounceWait: 300,
      manual: true,
      refreshDeps: [workspaceId]
    }
  )

  const { run: handleAvatarChange } = useRequest(
    async (avatar?: string) => {
      const updates = {
        avatar
      }

      updateWorkspace(workspaceId, updates)
      await WorkspaceService.update(workspaceId, updates)
    },
    {
      manual: true,
      refreshDeps: [workspaceId]
    }
  )

  return (
    <section id="general" className="border-accent-light border-b pb-10">
      <h2 className="hf-section-title font-serif">{t('settings.general.title')}</h2>

      <div className="mt-4 space-y-8">
        <div className="space-y-2">
          <label htmlFor="name" className="text-primary block text-sm/6 font-medium leading-6">
            {t('settings.general.name')}
          </label>
          <Input id="name" value={workspace?.name} onChange={handleNameChange} />
        </div>

        <div className="space-y-2">
          <div className="space-y-1">
            <label className="text-primary block text-sm font-medium leading-6">
              {t('settings.general.logo')}
            </label>
            <p data-slot="text" className="text-secondary text-base/5 sm:text-sm/5">
              {t('settings.general.pickLogo')}
            </p>
          </div>
          <ImageFormPicker
            value={workspace?.avatar}
            fallback={workspace?.name}
            resize={{
              width: 100,
              height: 100
            }}
            onChange={handleAvatarChange}
          />
        </div>
      </div>
    </section>
  )
}
