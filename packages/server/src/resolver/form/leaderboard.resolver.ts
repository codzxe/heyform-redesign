import {
  FormLeaderboardInput,
  LeaderboardEntryType
} from '../../common/graphql/leaderboard.graphql'
import { LeaderboardService, clampLeaderboardLimit } from '../../service/leaderboard.service'
import { Auth, Form, FormGuard } from '@decorator'
import { FormModel } from '@model'
import { Args, Query, Resolver } from '@nestjs/graphql'

@Resolver()
@Auth()
export class FormLeaderboardResolver {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  // Owner-facing leaderboard. The guard verified the caller's membership of
  // the form's team and resolved the form; entries carry display fields only,
  // never answer content. The form's anonymousLeaderboard setting applies
  // here too, so what owners see matches what respondents see.
  @Query(returns => [LeaderboardEntryType])
  @FormGuard()
  async formLeaderboard(
    @Form() form: FormModel,
    @Args('input') input: FormLeaderboardInput
  ): Promise<LeaderboardEntryType[]> {
    return this.leaderboardService.top(
      { id: form.id, settings: form.settings },
      clampLeaderboardLimit(input.limit)
    )
  }
}
