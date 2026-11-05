import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Headers,
  Post,
  Req,
  Res
} from '@nestjs/common'
import { ArrayMaxSize, IsArray, IsString } from 'class-validator'
import type { Request, Response } from 'express'

import { AnalyticsEventInput, AnalyticsEventService } from '../service/analytics-event.service'
import { helper, timestamp } from '@myform/utils'
import { EndpointService, FormService, RedisService } from '@service'
import { ip, md5 } from '@utils'

// A public form's token is intentionally obtainable by respondents, so cap both
// reuse of a single token and aggregate events per IP address. Redis keeps the
// limit consistent across application replicas.
const TOKEN_RATE_LIMIT = 600
const IP_RATE_LIMIT = 1200
const RATE_LIMIT_WINDOW = '1h'

class CreateAnalyticsEventsDto {
  @IsString()
  formId: string

  @IsString()
  openToken: string

  // Per-event payload validation happens in AnalyticsEventService, so one
  // malformed event is dropped individually instead of failing the batch.
  @IsArray()
  @ArrayMaxSize(50)
  events: AnalyticsEventInput[]
}

/**
 * Public respondent analytics ingest. The form renderer batches interaction
 * events and flushes them here with the same open token that guards form opens
 * and submissions; failures never block the respondent.
 */
@Controller()
export class AnalyticsEventController {
  constructor(
    private readonly endpointService: EndpointService,
    private readonly formService: FormService,
    private readonly redisService: RedisService,
    private readonly analyticsEventService: AnalyticsEventService
  ) {}

  @Post('/api/analytics/events')
  async events(
    @Body() input: CreateAnalyticsEventsDto,
    @Headers('x-anonymous-id') anonymousId: string,
    @Req() req: Request,
    @Res() res: Response
  ): Promise<void> {
    // Mirrors EndpointAnonymousIdGuard, which is GraphQL-only: on REST the
    // anonymous id travels in the x-anonymous-id header.
    if (helper.isEmpty(anonymousId)) {
      throw new ForbiddenException('Forbidden request error')
    }

    const form = await this.formService.findById(input.formId)

    if (!form || form.suspended || form.settings?.active !== true) {
      throw new BadRequestException('The form is not available')
    }

    const now = timestamp()
    const token = this.endpointService.decryptToken(input.openToken)

    this.endpointService.assertOpenToken(token, input.formId, form.settings, now, {
      allowTimeUpGrace: true
    })

    await Promise.all([
      this.redisService.throttler(
        `analytics:${md5(input.openToken)}`,
        TOKEN_RATE_LIMIT,
        RATE_LIMIT_WINDOW
      ),
      this.redisService.throttler(
        `analytics:ip:${md5(ip(req) ?? '')}`,
        IP_RATE_LIMIT,
        RATE_LIMIT_WINDOW
      )
    ])

    await this.analyticsEventService.recordBatch(input.formId, anonymousId, input.events)

    res.status(204).send()
  }
}
