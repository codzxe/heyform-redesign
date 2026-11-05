import { UseGuards } from '@nestjs/common'

import { CreateDeletionRequestInput } from '../common/graphql/privacy.graphql'
import { DeletionRequestService } from '../service/deletion-request.service'
import { EndpointAnonymousIdGuard } from '@guard'
import { Args, Mutation, Resolver } from '@nestjs/graphql'
import { ClientInfo, GqlClient } from '@utils'

/**
 * Public GDPR endpoints. The right-to-erasure request is open to respondents:
 * the anonymous-id guard keeps automated scrapers out, the service rate limits
 * per requester IP and per form, and the answer is always a generic success —
 * it never reveals whether the form actually holds the requester's data.
 */
@Resolver()
@UseGuards(EndpointAnonymousIdGuard)
export class PrivacyResolver {
  constructor(private readonly deletionRequestService: DeletionRequestService) {}

  @Mutation(returns => Boolean)
  async createDeletionRequest(
    @GqlClient() client: ClientInfo,
    @Args('input') input: CreateDeletionRequestInput
  ): Promise<boolean> {
    return this.deletionRequestService.createFromPublic(
      {
        formId: input.formId,
        type: input.type,
        payload: input.payload
      },
      client.ip
    )
  }
}
