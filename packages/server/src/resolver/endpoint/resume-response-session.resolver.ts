import { BadRequestException, Headers, UseGuards } from '@nestjs/common'

import { ResponseSessionResumeType, ResumeResponseSessionInput } from '@graphql'
import { EndpointAnonymousIdGuard } from '@guard'
import { Args, Query, Resolver } from '@nestjs/graphql'
import { FormService, RedisService, ResponseSessionService } from '@service'

@Resolver()
@UseGuards(EndpointAnonymousIdGuard)
export class ResumeResponseSessionResolver {
  constructor(
    private readonly formService: FormService,
    private readonly redisService: RedisService,
    private readonly responseSessionService: ResponseSessionService
  ) {}

  @Query(returns => ResponseSessionResumeType, { nullable: true })
  async resumeResponseSession(
    @Headers('x-anonymous-id') anonymousId: string,
    @Args('input') input: ResumeResponseSessionInput
  ): Promise<ResponseSessionResumeType | null> {
    const form = await this.formService.findById(input.formId)

    if (!form) {
      throw new BadRequestException('The form does not exist')
    }

    if (form.suspended) {
      throw new BadRequestException('The form is suspended')
    }

    if (form.settings.active !== true) {
      throw new BadRequestException('The form does not active')
    }

    if (form.settings.enableResume !== true) {
      throw new BadRequestException('Resume is not enabled for this form')
    }

    // Resume tokens are secrets, so the lookups are bounded per respondent
    await this.redisService.throttler(`session:resume:${anonymousId}`, 60, '1h')

    const session = await this.responseSessionService.resume(input.formId, input.token)

    if (!session) {
      return null
    }

    return {
      answers: session.answers ?? [],
      hiddenFields: session.hiddenFields ?? [],
      variables: session.variables ?? [],
      currentFieldId: session.currentFieldId,
      expiresAt: session.expiresAt
    }
  }
}
