import { useTranslation } from 'react-i18next'

import { WorkspaceService } from '@/services'
import { useParam } from '@/utils'

import { Async, Button, Repeat } from '@/components'
import { useAppStore, useWorkspaceStore } from '@/store'

import InvitationModal from './InvitationModal'
import MemberItem from './MemberItem'

export default function WorkspaceMembers() {
  const { t } = useTranslation()

  const { workspaceId } = useParam()
  const { members, setMembers } = useWorkspaceStore()
  const { openModal } = useAppStore()

  async function fetch() {
    setMembers(workspaceId, await WorkspaceService.members(workspaceId))
    return true
  }

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="hf-page-title">{t('members.title')}</h1>
        <Button size="md" onClick={() => openModal('InvitationModal')}>
          {t('members.invite.title')}
        </Button>
      </div>

      <div className="hf-table-shell mt-6">
        <table className="hf-table min-w-full text-left text-sm/6">
          <thead>
            <tr>
              <th>{t('members.name')}</th>
              <th>{t('members.role')}</th>
              <th>{t('members.lastSeen')}</th>
              <th></th>
            </tr>
          </thead>

            <tbody>
              <Async
                fetch={fetch}
                refreshDeps={[workspaceId]}
                loader={
                  <Repeat count={3}>
                    <MemberItem.Skeleton />
                  </Repeat>
                }
              >
                {members.map(m => (
                  <MemberItem key={m.id} member={m} />
                ))}
              </Async>
            </tbody>
          </table>
      </div>

      <InvitationModal />
    </>
  )
}
