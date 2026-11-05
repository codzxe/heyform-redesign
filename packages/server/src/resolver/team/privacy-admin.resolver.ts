import { BadRequestException } from '@nestjs/common'

import {
  AuditLogPageType,
  AuditLogType,
  DeletionRequestType,
  ProcessDeletionRequestInput,
  TeamAuditLogsInput
} from '../../common/graphql/privacy.graphql'
import { DeletionRequestService } from '../../service/deletion-request.service'
import { Auth, Team, TeamGuard, User } from '@decorator'
import { TeamModel, TeamRoleEnum, UserModel } from '@model'
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql'
import { AuditService, TeamService } from '@service'

type Timestamped = number | Date | string

function toEpochSeconds(value: Timestamped | undefined): number {
  if (value instanceof Date) {
    return Math.floor(value.getTime() / 1000)
  }

  if (typeof value === 'number') {
    return Math.floor(value)
  }

  if (typeof value === 'string') {
    const parsed = new Date(value).getTime()
    return Number.isNaN(parsed) ? 0 : Math.floor(parsed / 1000)
  }

  return 0
}

function toDeletionRequestType(doc: any): DeletionRequestType {
  return {
    id: String(doc._id ?? doc.id),
    teamId: doc.teamId,
    formId: doc.formId,
    type: doc.type,
    status: doc.status,
    requestPayload: doc.requestPayload ?? {},
    requestedBy: doc.requestedBy,
    processedBy: doc.processedBy,
    processedAt: doc.processedAt,
    resultNote: doc.resultNote,
    createdAt: toEpochSeconds(doc.createdAt)
  }
}

function toAuditLogType(doc: any): AuditLogType {
  return {
    id: String(doc._id ?? doc.id),
    teamId: doc.teamId,
    formId: doc.formId,
    actorType: doc.actorType,
    actorId: doc.actorId,
    action: doc.action,
    target: doc.target,
    meta: doc.meta,
    ip: doc.ip,
    createdAt: toEpochSeconds(doc.createdAt)
  }
}

function isTeamAdmin(team: TeamModel): boolean {
  return (
    team.isOwner === true ||
    (team as TeamModel & { role?: TeamRoleEnum }).role === TeamRoleEnum.OWNER ||
    (team as TeamModel & { role?: TeamRoleEnum }).role === TeamRoleEnum.ADMIN
  )
}

/**
 * Workspace-admin GDPR endpoints: the deletion request inbox and the audit
 * log. Every operation verifies the authenticated user's membership and
 * owner/admin role on the workspace the data belongs to — a client-supplied
 * teamId is never trusted on its own.
 */
@Resolver()
@Auth()
export class PrivacyAdminResolver {
  constructor(
    private readonly teamService: TeamService,
    private readonly deletionRequestService: DeletionRequestService,
    private readonly auditService: AuditService
  ) {}

  @Query(returns => [DeletionRequestType])
  async deletionRequests(
    @User() user: UserModel,
    @Args('teamId') teamId: string
  ): Promise<DeletionRequestType[]> {
    // The teamId arrives as a plain argument, so membership and role are
    // verified the same way the permission guard does it for input objects.
    await this.assertTeamAdmin(teamId, user)

    const requests = await this.deletionRequestService.list(teamId)

    return requests.map(toDeletionRequestType)
  }

  @Mutation(returns => Boolean)
  async processDeletionRequest(
    @User() user: UserModel,
    @Args('input') input: ProcessDeletionRequestInput
  ): Promise<boolean> {
    // The service loads the request and verifies the user is an owner/admin
    // of the workspace the request belongs to.
    return this.deletionRequestService.process(input.id, input.approve, input.note, user)
  }

  @Query(returns => AuditLogPageType)
  @TeamGuard()
  async teamAuditLogs(
    @Team() team: TeamModel,
    @Args('input') input: TeamAuditLogsInput
  ): Promise<AuditLogPageType> {
    if (!isTeamAdmin(team)) {
      throw new BadRequestException("You don't have permission to view the audit log")
    }

    const page = await this.auditService.list(input.teamId, {
      page: input.page,
      limit: input.limit,
      action: input.action
    })

    return {
      total: page.total,
      page: page.page,
      limit: page.limit,
      items: page.items.map(toAuditLogType)
    }
  }

  private async assertTeamAdmin(teamId: string, user: UserModel): Promise<void> {
    const team = await this.teamService.findById(teamId)

    if (!team) {
      throw new BadRequestException("You don't have permission to access the workspace")
    }

    const member = await this.teamService.findMemberById(teamId, user.id)
    const isAdmin =
      team.ownerId === user.id ||
      member?.role === TeamRoleEnum.OWNER ||
      member?.role === TeamRoleEnum.ADMIN

    if (!isAdmin) {
      throw new BadRequestException("You don't have permission to manage deletion requests")
    }
  }
}
