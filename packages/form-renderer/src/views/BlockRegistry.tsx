import { FieldKindEnum, FormField } from '@myform/shared-types-enums'

import { Address } from '../blocks/Address'
import { Country } from '../blocks/Country'
import { Date } from '../blocks/Date'
import { DateRange } from '../blocks/DateRange'
import { Email } from '../blocks/Email'
import { FileUpload } from '../blocks/FileUpload'
import { FullName } from '../blocks/FullName'
import { InputTable } from '../blocks/InputTable'
import { LegalTerms } from '../blocks/LegalTerms'
import { LongText } from '../blocks/LongText'
import { MultipleChoice } from '../blocks/MultipleChoice'
import { Number } from '../blocks/Number'
import { OpinionScale } from '../blocks/OpinionScale'
import { Payment } from '../blocks/Payment'
import { PhoneNumber } from '../blocks/PhoneNumber'
import { PictureChoice } from '../blocks/PictureChoice'
import { Rating } from '../blocks/Rating'
import { ScreenRecording } from '../blocks/ScreenRecording'
import { ShortText } from '../blocks/ShortText'
import { Signature } from '../blocks/Signature'
import { Statement } from '../blocks/Statement'
import { VideoRecording } from '../blocks/VideoRecording'
import { VoiceRecording } from '../blocks/VoiceRecording'
import { Website } from '../blocks/Website'
import { YesNo } from '../blocks/YesNo'

type TransitionState = 'active' | 'leaving'

/**
 * The block registry: maps a field kind to its respondent-facing block. Both
 * layouts render blocks through it — the conversational one question at a
 * time, the classic layout stacking every question of the current page.
 */
export function getBlock(
  field: FormField,
  blockIndex?: number,
  transitionState: TransitionState = 'active'
) {
  switch (field.kind) {
    case FieldKindEnum.ADDRESS:
      return <Address key={field.id} field={field} transitionState={transitionState} />

    case FieldKindEnum.COUNTRY:
      return <Country key={field.id} field={field} transitionState={transitionState} />

    case FieldKindEnum.FULL_NAME:
      return <FullName key={field.id} field={field} transitionState={transitionState} />

    case FieldKindEnum.DATE:
      return <Date key={field.id} field={field} transitionState={transitionState} />

    case FieldKindEnum.DATE_RANGE:
      return <DateRange key={field.id} field={field} transitionState={transitionState} />

    case FieldKindEnum.EMAIL:
      return <Email key={field.id} field={field} transitionState={transitionState} />

    case FieldKindEnum.FILE_UPLOAD:
      return <FileUpload key={field.id} field={field} transitionState={transitionState} />

    case FieldKindEnum.MULTIPLE_CHOICE:
      return <MultipleChoice key={field.id} field={field} transitionState={transitionState} />

    case FieldKindEnum.NUMBER:
      return <Number key={field.id} field={field} transitionState={transitionState} />

    case FieldKindEnum.OPINION_SCALE:
      return <OpinionScale key={field.id} field={field} transitionState={transitionState} />

    case FieldKindEnum.PHONE_NUMBER:
      return <PhoneNumber key={field.id} field={field} transitionState={transitionState} />

    case FieldKindEnum.PICTURE_CHOICE:
      return <PictureChoice key={field.id} field={field} transitionState={transitionState} />

    case FieldKindEnum.RATING:
      return <Rating key={field.id} field={field} transitionState={transitionState} />

    case FieldKindEnum.URL:
      return <Website key={field.id} field={field} transitionState={transitionState} />

    case FieldKindEnum.YES_NO:
      return <YesNo key={field.id} field={field} transitionState={transitionState} />

    case FieldKindEnum.LONG_TEXT:
      return <LongText key={field.id} field={field} transitionState={transitionState} />

    case FieldKindEnum.SIGNATURE:
      return <Signature key={field.id} field={field} transitionState={transitionState} />

    case FieldKindEnum.LEGAL_TERMS:
      return <LegalTerms key={field.id} field={field} transitionState={transitionState} />

    case FieldKindEnum.INPUT_TABLE:
      return <InputTable key={field.id} field={field} transitionState={transitionState} />

    case FieldKindEnum.SHORT_TEXT:
      return <ShortText key={field.id} field={field} transitionState={transitionState} />

    case FieldKindEnum.VOICE_RECORDING:
      return <VoiceRecording key={field.id} field={field} transitionState={transitionState} />

    case FieldKindEnum.VIDEO_RECORDING:
      return <VideoRecording key={field.id} field={field} transitionState={transitionState} />

    case FieldKindEnum.SCREEN_RECORDING:
      return <ScreenRecording key={field.id} field={field} transitionState={transitionState} />

    case FieldKindEnum.PAYMENT:
      return (
        <Payment
          key={field.id}
          field={field}
          paymentBlockIndex={blockIndex}
          transitionState={transitionState}
        />
      )

    default:
      return <Statement key={field.id} field={field} transitionState={transitionState} />
  }
}
