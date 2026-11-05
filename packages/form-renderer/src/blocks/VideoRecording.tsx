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
 * Video recording answer. Camera and microphone are captured together; the
 * finished take is uploaded immediately and stored as a file-upload-like
 * answer value ({filename, key, urlPrefix, url}).
 */
export const VideoRecording: FC<BlockProps> = ({ field, ...restProps }) => {
  const { state } = useStore()
  const { t } = useTranslation()

  function getValues(values: any) {
    return helper.isValid(values.input) ? values.input : undefined
  }

  return (
    <Block className="myform-video-recording" field={field} {...restProps}>
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
            mode="video"
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
