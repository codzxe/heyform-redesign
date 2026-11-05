import { CaptchaKindEnum, FormStatusEnum, InteractiveModeEnum } from '@myform/shared-types-enums'
import { BadRequestException } from '@nestjs/common'

import { Auth, Project, ProjectGuard, Team, User } from '@decorator'
import { ImportFormFromJSONInput } from '@graphql'
import { ProjectModel, TeamModel, UserModel } from '@model'
import { helper } from '@myform/utils'
import { Args, Mutation, Resolver } from '@nestjs/graphql'
import { FormService } from '@service'

/**
 * Imports a previously exported form definition (JSON) as a new draft form in
 * the target project. The payload is validated structurally: a name and a
 * non-empty fields array are required, and only known top-level properties are
 * carried over so a crafted export cannot inject arbitrary document fields.
 */
@Resolver()
@Auth()
export class ImportFormJsonResolver {
  constructor(private readonly formService: FormService) {}

  @Mutation(returns => String)
  @ProjectGuard()
  async importFormFromJSON(
    @Team() team: TeamModel,
    @Project() project: ProjectModel,
    @User() user: UserModel,
    @Args('input') input: ImportFormFromJSONInput
  ): Promise<string> {
    let formData: Record<string, any>

    try {
      formData = JSON.parse(input.formJson)
    } catch {
      throw new BadRequestException('Invalid JSON format')
    }

    if (!helper.isValid(formData?.name) || !helper.isValidArray(formData?.fields)) {
      throw new BadRequestException('Invalid form JSON: missing required fields')
    }

    return this.formService.create({
      name: String(formData.name).slice(0, 120),
      teamId: project.teamId,
      projectId: project.id,
      memberId: user.id,
      fields: formData.fields,
      hiddenFields: helper.isValidArray(formData.hiddenFields) ? formData.hiddenFields : [],
      logics: helper.isValidArray(formData.logics) ? formData.logics : [],
      variables: helper.isValidArray(formData.variables) ? formData.variables : [],
      settings: formData.settings || {
        active: false,
        captchaKind: CaptchaKindEnum.NONE,
        filterSpam: false,
        allowArchive: true,
        requirePassword: false,
        locale: 'en',
        enableQuestionList: true,
        enableNavigationArrows: true
      },
      themeSettings: formData.themeSettings || {},
      interactiveMode: formData.interactiveMode || InteractiveModeEnum.GENERAL,
      kind: formData.kind,
      status: FormStatusEnum.NORMAL
    })
  }
}
