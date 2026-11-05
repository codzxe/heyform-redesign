import { useTranslation } from 'react-i18next'

import { CreateWorkspaceForm } from '@/layouts/Workspace/CreateWorkspaceModal'

export default function CreateWorkspace() {
  const { t } = useTranslation()

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="font-serif text-2xl/8 font-semibold italic tracking-tight">
        {t('workspace.creation.headline')}
      </h1>
      <p className="text-secondary mt-2 text-sm">{t('workspace.creation.subHeadline')}</p>
      <div className="mt-10">
        <CreateWorkspaceForm />
      </div>
    </div>
  )
}
