import { Controller, Get, NotFoundException, Param } from '@nestjs/common'

import { DashboardShareService } from '../service/dashboard-share.service'

/**
 * Public, unauthenticated dashboard for a share token. Returns only the metric
 * groups the share permits — never respondent-identifying data — and 404s for
 * unknown, revoked or expired tokens.
 */
@Controller()
export class PublicDashboardController {
  constructor(private readonly dashboardShareService: DashboardShareService) {}

  @Get('/api/public/dashboard/:token')
  async dashboard(@Param('token') token: string) {
    const share = await this.dashboardShareService.resolvePublic(token)

    if (!share) {
      throw new NotFoundException('The dashboard share does not exist')
    }

    const data = await this.dashboardShareService.publicDashboardData(share)

    if (!data) {
      throw new NotFoundException('The dashboard share does not exist')
    }

    return data
  }
}
