import { Answer, HiddenFieldAnswer, Variable } from '@myform/shared-types-enums'
import { BadRequestException, Headers, UseGuards } from '@nestjs/common'

import { ResponseSessionSaveType, SaveResponseSessionInput } from '@graphql'
import { EndpointAnonymousIdGuard } from '@guard'
import { timestamp } from '@myform/utils'
import { Args, Mutation, Resolver } from '@nestjs/graphql'
import { EndpointService, FormService, RedisService, ResponseSessionService } from '@service'

@Resolver()
@UseGuards(EndpointAnonymousIdGuard)
export class SaveResponseSessionResolver {
  constructor(
    private readonly endpointService: EndpointService,
    private readonly formService: FormService,
    private readonly redisService: RedisService,
    private readonly responseSessionService: ResponseSessionService
  ) {}

  @Mutation(returns => ResponseSessionSaveType)
  async saveResponseSession(
    @Headers('x-anonymous-id') anonymousId: string,
    @Args('input') input: SaveResponseSessionInput
  ): Promise<ResponseSessionSaveType> {
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

    // The session may only be saved while the form was legitimately opened,
    // with the same grace for a time limit that a late submission gets
    const openToken = this.endpointService.decryptToken(input.openToken)
    this.endpointService.assertOpenToken(openToken, input.formId, form.settings, timestamp(), {
      allowTimeUpGrace: true
    })

    // Progress is saved continuously, so the cap is generous but shared by the
    // respondent across every form of this deployment
    await this.redisService.throttler(`session:save:${anonymousId}`, 120, '1h')

    const saved = await this.responseSessionService.save({
      formId: form.id,
      anonymousId,
      sessionToken: input.sessionToken,
      answers: input.answers as Answer[],
      hiddenFields: input.hiddenFields as HiddenFieldAnswer[],
      variables: input.variables as Variable[],
      currentFieldId: input.currentFieldId,
      startAt: input.startAt,
      expirationDays: form.settings.resumeExpirationDays
    })

    return {
      sessionToken: saved.token,
      expiresAt: saved.expiresAt
    }
  }
}
