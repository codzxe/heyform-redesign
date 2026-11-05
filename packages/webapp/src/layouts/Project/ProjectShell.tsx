import { FC, ReactNode, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, useLocation } from 'react-router-dom'

import { cn, useParam } from '@/utils'

import { Button } from '@/components'
import { useAppStore, useWorkspaceStore } from '@/store'

import ProjectMembers from './ProjectMembers'
import ProjectMembersModal from './ProjectMembersModal'

interface ProjectShellProps {
  children: ReactNode
}

export const ProjectShell: FC<ProjectShellProps> = ({ children }) => {
  const { t } = useTranslation()

  const location = useLocation()
  const { workspaceId, projectId } = useParam()
  const { openModal } = useAppStore()
  const { project } = useWorkspaceStore()

  const navigations = useMemo(
    () => [
      {
        value: 'analytics',
        label: t('project.forms.title'),
        to: `/workspace/${workspaceId}/project/${projectId}/`
      },
      {
        value: 'trash',
        label: t('project.trash.title'),
        to: `/workspace/${workspaceId}/project/${projectId}/trash`
      }
    ],
    [projectId, workspaceId, t]
  )

  useEffect(() => {
    if (location.state?.isCreateModalOpen) {
      window.history.replaceState({}, '')
      openModal('CreateFormModal')
    }
  }, [location.state?.isCreateModalOpen, openModal])

  useEffect(() => {
    if (location.state?.isMembersModalOpen) {
      window.history.replaceState({}, '')
      openModal('ProjectMembersModal')
    }
  }, [location.state?.isMembersModalOpen, openModal])

  useEffect(() => {
    return () => {
      window.history.replaceState({}, '')
    }
  }, [])

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl sm:flex"
            style={{ background: 'rgba(var(--hf-brand), 0.1)' }}
          >
            <span className="font-serif text-lg italic leading-none text-brand">F</span>
          </div>
          <h1 className="hf-page-title truncate">{project?.name}</h1>
        </div>

        <Button size="md" onClick={() => openModal('CreateFormModal')}>
          {t('form.creation.title')}
        </Button>
      </div>

      <ProjectMembers />

      <div className="mt-6">
        <nav
          className="inline-flex items-center gap-1 rounded-full p-1"
          style={{ background: 'rgba(var(--hf-dashboard-zone))' }}
        >
          {navigations.map(n => (
            <NavLink
              key={n.value}
              className={({ isActive }) =>
                cn(
                  'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-foreground text-primary shadow-sm'
                    : 'text-secondary hover:text-primary'
                )
              }
              to={n.to}
              end
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
      </div>

      {children}
      <ProjectMembersModal />
    </>
  )
}
