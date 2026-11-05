import { Auth, Form, FormGuard, Team, User } from '@decorator'
import {
  CreateScheduledReportInput,
  DeleteScheduledReportInput,
  ScheduledReportType,
  ScheduledReportsInput,
  UpdateScheduledReportInput
} from '@graphql'
import { FormModel, ScheduledReportModel, TeamModel, UserModel } from '@model'
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql'
import { ScheduledReportService } from '@service'

function toScheduledReportType(report: ScheduledReportModel): ScheduledReportType {
  const createdAt = (report as any).createdAt as Date | undefined

  return {
    id: report.id,
    formId: report.formId,
    frequency: report.frequency,
    dayOfWeek: report.dayOfWeek ?? null,
    dayOfMonth: report.dayOfMonth ?? null,
    timezone: report.timezone,
    recipients: report.recipients,
    enabled: report.enabled,
    nextRunAt: report.nextRunAt,
    lastRunAt: report.lastRunAt ?? null,
    status: report.status,
    lastError: report.lastError ?? null,
    createdAt: createdAt ? Math.floor(new Date(createdAt).getTime() / 1_000) : 0
  }
}

@Resolver()
@Auth()
export class ScheduledReportResolver {
  constructor(private readonly scheduledReportService: ScheduledReportService) {}

  @Query(returns => [ScheduledReportType])
  @FormGuard()
  async scheduledReports(
    @Args('input') input: ScheduledReportsInput
  ): Promise<ScheduledReportType[]> {
    const reports = await this.scheduledReportService.listByForm(input.formId)
    return reports.map(toScheduledReportType)
  }

  @Mutation(returns => ScheduledReportType)
  @FormGuard()
  async createScheduledReport(
    @Form() form: FormModel,
    @User() user: UserModel,
    @Args('input') input: CreateScheduledReportInput
  ): Promise<ScheduledReportType> {
    // `form` is the FormGuard-loaded document: its teamId is server-side
    // truth, the report is always stored under the form's own team.
    const report = await this.scheduledReportService.create(form, input, user.id)
    return toScheduledReportType(report)
  }

  @Mutation(returns => ScheduledReportType)
  @FormGuard()
  async updateScheduledReport(
    @Team() team: TeamModel,
    @Args('input') input: UpdateScheduledReportInput
  ): Promise<ScheduledReportType> {
    const report = await this.scheduledReportService.update(input.id, team.id, input)
    return toScheduledReportType(report)
  }

  @Mutation(returns => Boolean)
  @FormGuard()
  async deleteScheduledReport(
    @Team() team: TeamModel,
    @Args('input') input: DeleteScheduledReportInput
  ): Promise<boolean> {
    return this.scheduledReportService.remove(input.id, team.id)
  }
}
