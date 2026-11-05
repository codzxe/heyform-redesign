import { IconDatabase, IconFileText, IconInbox, IconUsers } from '@tabler/icons-react'
import { useRequest } from 'ahooks'
import { useTranslation } from 'react-i18next'

import { WorkspaceService } from '@/services'
import { useParam } from '@/utils'
import { formatBytes } from '@heyform-inc/utils'

import { Skeleton } from '@/components'

interface StatCardProps {
  icon: React.ReactNode
  label: string
  loading?: boolean
  value: React.ReactNode
  chipStyle?: React.CSSProperties
}

const StatCard = ({ icon, label, loading, value, chipStyle }: StatCardProps) => (
  <div className="hf-card flex items-center gap-4 p-5">
    <div
      className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
      data-slot="chip"
      style={chipStyle}
    >
      {icon}
    </div>
    <div className="min-w-0">
      <div className="text-secondary text-sm/5 font-medium">{label}</div>
      <Skeleton
        className="mt-1.5 h-8 [&_[data-slot=skeleton]]:h-6 [&_[data-slot=skeleton]]:w-3/5"
        loading={loading}
      >
        <div className="mt-0.5 text-2xl/8 font-semibold tracking-tight tabular-nums">{value}</div>
      </Skeleton>
    </div>
  </div>
)

export default function Overview() {
  const { t } = useTranslation()

  const { workspaceId } = useParam()

  const { data, loading } = useRequest(
    async () => {
      return WorkspaceService.overview(workspaceId)
    },
    {
      refreshDeps: [workspaceId]
    }
  )

  return (
    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {/* Forms */}
      <StatCard
        loading={loading || !data}
        label={t('dashboard.forms')}
        value={data?.formCount}
        chipStyle={{ backgroundColor: '#E3F0D8' }}
        icon={
          <IconFileText
            className="h-5 w-5"
            style={{ color: '#5B7F45' }}
            data-slot="icon"
            aria-hidden="true"
          />
        }
      />

      {/* Submissions */}
      <StatCard
        loading={loading || !data}
        label={t('dashboard.submission')}
        value={data?.submissionQuota}
        chipStyle={{ backgroundColor: '#FCEEBB' }}
        icon={
          <IconInbox
            className="h-5 w-5"
            style={{ color: '#C08A1E' }}
            data-slot="icon"
            aria-hidden="true"
          />
        }
      />

      {/* Members */}
      <StatCard
        loading={loading || !data}
        label={t('dashboard.members')}
        value={data?.memberCount || 1}
        chipStyle={{ backgroundColor: '#E6E2F4' }}
        icon={
          <IconUsers
            className="h-5 w-5"
            style={{ color: '#7C6FC4' }}
            data-slot="icon"
            aria-hidden="true"
          />
        }
      />

      {/* Storage */}
      <StatCard
        loading={loading || !data}
        label={t('dashboard.storage')}
        value={formatBytes(data?.storageQuota)}
        chipStyle={{ backgroundColor: '#FBE3C9' }}
        icon={
          <IconDatabase
            className="h-5 w-5"
            style={{ color: '#D0752A' }}
            data-slot="icon"
            aria-hidden="true"
          />
        }
      />
    </div>
  )
}
