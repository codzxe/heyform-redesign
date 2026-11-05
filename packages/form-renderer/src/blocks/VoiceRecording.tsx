import type { FC } from 'react'

import { useTranslation } from '../utils'
import { helper } from '@myform/utils'

import { FormField } from '../components'
import { MediaRecorderControl, getRecordingOpenToken } from '../components/MediaRecorderControl'
import { useStore } from '../store'
import type { BlockProps } from './Block'
import { Block } from './Block'
import { Form } from './Form'

/**
 * Voice recording answer. The control captures the audio take, uploads it to
 * the respondent upload endpoint and hands back a file-upload-like answer
 * value ({filename, key, urlPrefix, url}), which is stored through the same
 * form/store mechanism the file-upload block uses.
 */
export const VoiceRecording: FC<BlockProps> = ({ field, ...restProps }) => {
  const { state } = useStore()
  const { t } = useTranslation()

  function getValues(values: any) {
    return helper.isValid(values.input) ? values.input : undefined
  }

  return (
    <Block className="myform-voice-recording" field={field} {...restProps}>
      <Form
        initialValues={{
          input: state.values[field.id]
        }}
        autoSubmit={true}
        field={field}
        getValues={getValues}
      >
        <FormField
          name="input"
          rules={[
            {
              required: field.validations?.required,
              message: t('This field is required')
            }
          ]}
        >
          <MediaRecorderControl
            mode="audio"
            maxDurationSeconds={field.properties?.maxDurationSeconds}
            upload={{
              formId: state.formId,
              fieldId: field.id,
              openToken: getRecordingOpenToken(state.query)
            }}
          />
        </FormField>
      </Form>
    </Block>
  )
}
