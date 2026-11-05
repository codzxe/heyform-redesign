import { FieldKindEnum, FormField, FormModel } from '@myform/shared-types-enums'

import { flattenFields } from '@myform/answer-utils'

const UPLOAD_FIELD_KINDS = new Set([FieldKindEnum.FILE_UPLOAD, FieldKindEnum.SIGNATURE])

export function isAllowedUploadField(form: Pick<FormModel, 'fields'>, fieldId?: string): boolean {
  if (!fieldId) {
    return false
  }

  return flattenFields((form.fields || []) as FormField[], true).some(
    field => field.id === fieldId && UPLOAD_FIELD_KINDS.has(field.kind)
  )
}
