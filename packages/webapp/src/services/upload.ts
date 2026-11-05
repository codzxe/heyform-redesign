import { FileUploadValue } from '@myform/shared-types-enums'
import axios from 'axios'

export interface UploadContext {
  fieldId: string
  formId: string
  openToken: string
}

export class UploadService {
  static async upload(file: File, context?: UploadContext): Promise<FileUploadValue> {
    const formData = new FormData()
    formData.append('file', file)

    const result = await axios.post('/api/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        ...(context
          ? {
              'x-myform-field-id': context.fieldId,
              'x-myform-form-id': context.formId,
              'x-myform-open-token': context.openToken
            }
          : {})
      }
    })

    return result.data
  }
}
