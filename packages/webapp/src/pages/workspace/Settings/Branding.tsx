import { useRequest } from 'ahooks'
import { useTranslation } from 'react-i18next'

import { WorkspaceService } from '@/services'
import { useParam } from '@/utils'

import { Switch } from '@/components'
import { useWorkspaceStore } from '@/store'

import WorkspaceBrandKit from './BrandKit'

export default function WorkspaceBranding() {
  const { t } = useTranslation()

  const { workspaceId } = useParam()
  const { workspace, updateWorkspace } = useWorkspaceStore()

  const { run: handleRemoveBrandingChange } = useRequest(
    async (removeBranding: boolean) => {
      const updates = {
        removeBranding
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
    <section id="branding" className="border-accent-light border-b py-10">
      <h2 className="hf-section-title font-serif">{t('settings.branding.title')}</h2>

      <div className="mt-4 space-y-8">
        <WorkspaceBrandKit />

        <div className="flex items-start gap-8">
          <div className="flex-1">
            <label className="text-base/7 font-medium sm:text-sm/5">
              {t('settings.branding.removeBrandingHeadline')}
            </label>
            <p data-slot="text" className="text-secondary text-base/5 sm:text-sm/5">
              {t('settings.branding.removeBrandingSubHeadline')}
            </p>
          </div>

          <div className="pt-2">
            <Switch value={workspace?.removeBranding} onChange={handleRemoveBrandingChange} />
          </div>
        </div>
      </div>
    </section>
  )
}
