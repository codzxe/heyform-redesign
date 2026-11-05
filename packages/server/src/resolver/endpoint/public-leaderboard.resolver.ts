import { BadRequestException, UseGuards } from '@nestjs/common'

import { LeaderboardEntryType } from '../../common/graphql/leaderboard.graphql'
import { LeaderboardService, clampLeaderboardLimit } from '../../service/leaderboard.service'
import { EndpointAnonymousIdGuard } from '@guard'
import { timestamp } from '@myform/utils'
import { Args, Int, Query, Resolver } from '@nestjs/graphql'
import { EndpointService, FormService } from '@service'

@Resolver()
@UseGuards(EndpointAnonymousIdGuard)
export class PublicLeaderboardResolver {
  constructor(
    private readonly endpointService: EndpointService,
    private readonly formService: FormService,
    private readonly leaderboardService: LeaderboardService
  ) {}

  // Respondent-facing leaderboard: entries carry display fields only (rank,
  // display name, score, percentage, completion time), never answer content.
  // When the form asks for an anonymous leaderboard, the service also strips
  // the derived names.
  @Query(returns => [LeaderboardEntryType])
  async publicLeaderboard(
    @Args('formId') formId: string,
    @Args('openToken') openToken: string,
    @Args('limit', { nullable: true, defaultValue: 10, type: () => Int }) limit?: number
  ): Promise<LeaderboardEntryType[]> {
    const form = await this.formService.findById(formId)

    // One answer for every reason a board is not public: the form is missing,
    // suspended, closed, or simply does not show a leaderboard. The message
    // never reveals which one applies.
    if (
      !form ||
      form.suspended ||
      form.settings?.active !== true ||
      form.settings?.showLeaderboard !== true
    ) {
      throw new BadRequestException('Leaderboard is not available')
    }

    // Same open token as completing the form: it proves the caller opened the
    // form. No grace options here, so an expired token is rejected outright.
    const token = this.endpointService.decryptToken(openToken)
    this.endpointService.assertOpenToken(token, form.id, form.settings, timestamp())

    return this.leaderboardService.top(
      { id: form.id, settings: form.settings },
      clampLeaderboardLimit(limit)
    )
  }
}
