import { BadRequestException } from '@nestjs/common'

import {
  CreateDashboardShareInput,
  DashboardShareType,
  DashboardSharesInput,
  FormAnalyticsOverviewInput,
  FormAnalyticsOverviewType,
  FormHeatmapInput,
  FormHeatmapItemType,
  RevokeDashboardShareInput
} from '../../common/graphql/analytics.graphql'
import { AnalyticsQueryService } from '../../service/analytics-query.service'
import { DashboardShareService } from '../../service/dashboard-share.service'
import { Auth, Form, FormGuard, User } from '@decorator'
import { FormModel, UserModel } from '@model'
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql'
import { TeamService } from '@service'

/**
 * Authenticated analytics dashboard v2: the aggregate overview, the per-field
 * hesitation heatmap and public dashboard share management.
 *
 * The form-scoped queries and mutations follow FormAnalyticResolver's guard
 * pattern: @FormGuard() resolves the form from args.input.formId, verifies the
 * requester's team membership and exposes the form via @Form().
 */
@Resolver()
@Auth()
export class AnalyticsV2Resolver {
  constructor(
    private readonly analyticsQueryService: AnalyticsQueryService,
    private readonly dashboardShareService: DashboardShareService,
    private readonly teamService: TeamService
  ) {}

  @Query(returns => FormAnalyticsOverviewType)
  @FormGuard()
  async formAnalyticsOverview(
    @Form() form: FormModel,
    @Args('input') input: FormAnalyticsOverviewInput
  ): Promise<FormAnalyticsOverviewType> {
    return this.analyticsQueryService.overview(form, input.range)
  }

  @Query(returns => [FormHeatmapItemType])
  @FormGuard()
  async formHeatmap(
    @Form() form: FormModel,
    @Args('input') input: FormHeatmapInput
  ): Promise<FormHeatmapItemType[]> {
    return this.analyticsQueryService.heatmapCached(form, input.range)
  }

  @Query(returns => [DashboardShareType])
  @FormGuard()
  async dashboardShares(@Args('input') input: DashboardSharesInput): Promise<DashboardShareType[]> {
    return this.dashboardShareService.list(input.formId)
  }

  @Mutation(returns => DashboardShareType)
  @FormGuard()
  async createDashboardShare(
    @Form() form: FormModel,
    @User() user: UserModel,
    @Args('input') input: CreateDashboardShareInput
  ): Promise<DashboardShareType> {
    return this.dashboardShareService.create(form, input.metrics, input.expiresInDays, user.id)
  }

  /**
   * Revocation is identified by the share id alone, so the owning team is
   * resolved from the share itself and the requester must be a member of it;
   * DashboardShareService.revoke then re-verifies the share belongs to that
   * team's form before setting revokedAt.
   */
  @Mutation(returns => Boolean)
  async revokeDashboardShare(
    @User() user: UserModel,
    @Args('input') input: RevokeDashboardShareInput
  ): Promise<boolean> {
    const teamId = await this.dashboardShareService.shareTeamId(input.shareId)
    const member = await this.teamService.findMemberById(teamId, user.id)

    if (!member) {
      throw new BadRequestException("You don't have permission to access the workspace")
    }

    return this.dashboardShareService.revoke(input.shareId, teamId)
  }
}
