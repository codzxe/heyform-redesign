import { Auth, Form, FormGuard } from '@decorator'
import { ExportFormToJSONInput } from '@graphql'
import { FormModel } from '@model'
import { Args, Query, Resolver } from '@nestjs/graphql'
import { GraphQLJSONObject } from 'graphql-type-json'

/**
 * Exports a form definition (structure, logic, settings and theme) as a JSON
 * object that can be re-imported with importFormFromJSON. Submissions and
 * respondent data are deliberately excluded.
 */
@Resolver()
@Auth()
export class ExportFormJsonResolver {
  @Query(returns => GraphQLJSONObject)
  @FormGuard()
  async exportFormToJSON(
    @Form() form: FormModel,
    @Args('input') input: ExportFormToJSONInput
  ): Promise<Record<string, any>> {
    return {
      name: form.name,
      fields: form.fields || [],
      hiddenFields: form.hiddenFields || [],
      logics: form.logics || [],
      variables: form.variables || [],
      settings: form.settings || {},
      themeSettings: form.themeSettings || {},
      interactiveMode: form.interactiveMode,
      kind: form.kind
    }
  }
}
