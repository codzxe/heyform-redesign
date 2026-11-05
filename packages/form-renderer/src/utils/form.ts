import {
  ChoiceBadgeEnum,
  FORM_FIELD_KINDS,
  FieldKindEnum,
  FormField,
  FormResponseLayoutEnum,
  FormSettings,
  QUESTION_FIELD_KINDS
} from '@myform/shared-types-enums'

import { htmlUtils, parsePlainAnswer, validateRequiredField } from '@myform/answer-utils'
import { helper, type } from '@myform/utils'

import { CHAR_A_KEY_CODE } from '../consts'
import type { AnyMap, IFormField, IPartialFormField } from '../typings'

export { getNavigateFieldId, sliceFieldsByLogics } from '@myform/answer-utils'

const MENTION_REGEX = /<span[^>]+data-mention="([^"]+)"([^>]+)?>[^<]+<\/span>/gi
const HIDDEN_FIELD_REGEX = /<span[^>]+data-hiddenfield="([^"]+)"([^>]+)?>[^<]+<\/span>/gi
const VARIABLE_REGEX = /<span[^>]+data-variable="([^"]+)"([^>]+)?>[^<]+<\/span>/gi

// The fields a respondent can reach, as the renderer lays them out: every question and
// statement with each group followed by its children (a group without any is dropped),
// payment fields only when payments are on, and the top-level endings. initStore() and the
// tests that compare the renderer with the server both build it here.
export function getRespondentFields(
  fields: IFormField[] | undefined,
  translations?: Record<string, any>,
  allowPayment = true
) {
  const list = parseFields(fields, translations)
  const welcomeField = list.find(f => f.kind === FieldKindEnum.WELCOME)
  const thankYouFields = list.filter(f => f.kind === FieldKindEnum.THANK_YOU)
  let allFields = flattenFieldsWithGroups(
    list.filter(f => f.kind !== FieldKindEnum.WELCOME && f.kind !== FieldKindEnum.THANK_YOU)
  )

  if (!allowPayment) {
    allFields = allFields.filter(f => f.kind !== FieldKindEnum.PAYMENT)
  }

  return { welcomeField, thankYouFields, allFields }
}

// The fields resolveEnding() decides from. Only top-level endings can be shown (Blocks.tsx looks
// the id up in thankYouFields) and the server leaves nested ones out too, so an ending inside a
// group is dropped here instead of becoming the fallback ending ahead of the top-level ones.
export function getEndingRouteFields(allFields: IFormField[], thankYouFields: IFormField[]) {
  return [...allFields.filter(f => f.kind !== FieldKindEnum.THANK_YOU), ...thankYouFields]
}

export function isNotNil(arg: any): boolean {
  return !helper.isNil(arg)
}

// Whether a choice answer includes "Other": typed text, or a blank entry where that's allowed.
export function isOtherAnswered(field: FormField, value?: { other?: string }): boolean {
  if (!field.properties?.allowOther) {
    return false
  }

  return helper.isValid(value?.other) || (!!field.properties.allowBlankOther && value?.other === '')
}

export function isFile(arg: any): boolean {
  return isNotNil(arg) && type(arg) === 'file'
}

export function initialValue(value: any) {
  if (helper.isValid(value)) {
    return value
  }
}

export function replaceHTML(
  html: string,
  values: AnyMap,
  fields: IFormField[],
  query: AnyMap,
  variables: AnyMap
) {
  if (helper.isEmpty(html)) {
    return ''
  }

  // Replace mentions
  html = html.replace(MENTION_REGEX, (matched, fieldId) => {
    const value = values[fieldId]

    if (!value) {
      return matched
    }

    const field = fields.find(f => f.id === fieldId)

    if (!field) {
      return matched
    }

    const text = parsePlainAnswer(
      {
        ...field,
        value
      } as any,
      true
    )

    return `<span class="mention" data-mention="${fieldId}">${text}</span>`
  })

  // Replace hidden fields
  html = html.replace(HIDDEN_FIELD_REGEX, (matched, varId) => {
    const value = query[varId]

    if (helper.isEmpty(value)) {
      return matched
    }

    return `<span class="hiddenfield" data-variable="${varId}">${value}</span>`
  })

  // Replace variables
  html = html.replace(VARIABLE_REGEX, (matched, varId) => {
    const value = variables[varId]

    if (helper.isEmpty(value)) {
      return matched
    }

    return `<span class="variable" data-variable="${varId}">${value}</span>`
  })

  return html
}

export function parseFields(
  fields?: IFormField[],
  translations: Record<string, any> = {}
): IFormField[] {
  const result = fields?.filter(f => FORM_FIELD_KINDS.includes(f.kind))

  if (!helper.isValidArray(result)) {
    return []
  }

  return result!.map(f => {
    const translation = translations[f.id]

    // Adapt with old form structure
    const title = (translation?.title || (f as unknown as any).titleSchema || f.title) as string[]

    if (helper.isArray(title)) {
      f.title = htmlUtils.serialize(title, {
        livePreview: true
      })
    }

    const description = translation?.description || f.description

    if (helper.isArray(description)) {
      f.description = htmlUtils.serialize(description as string[], {
        livePreview: true
      })
    }

    return f
  })
}

export function flattenFieldsWithGroups(fields: IFormField[]): IFormField[] {
  let result: IFormField[] = []

  fields.forEach(f => {
    if (f.kind === FieldKindEnum.GROUP) {
      const children = parseFields(f.properties?.fields)

      if (helper.isValidArray(children)) {
        const row = {
          ...{},
          ...f,
          properties: {
            ...f.properties,
            fields: []
          }
        }

        result = [
          ...result,
          row,
          ...children.map(c => {
            c.parent = row
            return c
          })
        ]
      }
    } else {
      result.push(f)
    }
  })

  return result
}

function getPartialField(field: IFormField): IPartialFormField {
  return {
    id: field.id,
    index: field.index!,
    kind: field.kind,
    title: htmlUtils.plain(field.title as string),
    required: field.validations?.required
  }
}

export function treeFields(fields: IFormField[]): IPartialFormField[] {
  const root = fields.filter(f => helper.isNil(f.parent))
  const children: IFormField[] = fields.filter(f => isNotNil(f.parent))

  return root.map(f => {
    const row = getPartialField(f)

    if (f.kind === FieldKindEnum.GROUP) {
      row.children = children.filter(c => c.parent?.id === f.id).map(getPartialField)
    }

    return row
  })
}

export function validateLogicField(
  field: IFormField,
  jumpFieldIds: string[],
  values: any
): boolean {
  if (jumpFieldIds.includes(field.id) && !field.isTouched) {
    return validateRequiredField(field, values)
  }

  return true
}

// Answers and skips outlive a branch the respondent backed out of, so count them
// along the current route. Moving past a required question doesn't complete it,
// since submitting sends the respondent back to answer it.
export function calculateProgress(
  fields: IFormField[],
  values: AnyMap,
  passedFieldIds: string[] = []
) {
  // A group only presents its children, so it never holds an answer of its own.
  const questions = fields.filter(
    f => f.kind !== FieldKindEnum.GROUP && QUESTION_FIELD_KINDS.includes(f.kind)
  )
  const doneCount = questions.filter(
    f => helper.isValid(values[f.id]) || (!f.validations?.required && passedFieldIds.includes(f.id))
  ).length

  return {
    questionCount: questions.length,
    percentage: questions.length === 0 ? 0 : Math.round((doneCount / questions.length) * 100)
  }
}

export function numberToChar(number: number, radix = 26): string {
  const arrays: number[] = []

  while (number > radix) {
    arrays.unshift(radix)
    number -= radix
  }

  if (number > 0) {
    arrays.unshift(number)
  }

  return arrays.map(n => String.fromCharCode(CHAR_A_KEY_CODE + n - 1).toLowerCase()).join('')
}

export function questionNumber(number?: number | string, parentNumber?: number | string): string {
  if (number) {
    return parentNumber ? [parentNumber, numberToChar(number! as number)].join('') : String(number)
  }

  return ''
}

export function removeHeading(title?: string) {
  return (title || '').replace(/<h\d>/gi, '<span>').replace(/<\/h\d>/gi, '</span>')
}

export function getChoiceKeyName(badge: ChoiceBadgeEnum, index: number) {
  if (badge === ChoiceBadgeEnum.NUMBER) {
    return String(index + 1)
  }

  if (index >= 26) {
    const prefix = String.fromCharCode(CHAR_A_KEY_CODE + Math.floor((index - 26) / 10))
    const suffix = (index - 26) % 10

    return `${prefix}${suffix}`
  } else {
    return String.fromCharCode(CHAR_A_KEY_CODE + index)
  }
}

// ----------------------------------------------------------------------------
// Classic response layout
//
// The classic layout breaks the respondent route into pages: every group
// presents all of its children on one page, while each ungrouped top-level
// field becomes a page of its own. The store keeps its flat field list (the
// conversational runtime works on it), so pages are derived on demand.

/** Multi-page layout requested through form settings (conversational is the default). */
export function isClassicLayout(settings?: FormSettings): boolean {
  return settings?.responseLayout === FormResponseLayoutEnum.CLASSIC
}

export interface ClassicPage {
  /** Index of the first route field rendered on this page. */
  startIndex: number
  /** The group field when this page presents a group, otherwise undefined. */
  group?: IFormField
  /** The question fields the respondent answers on this page. */
  fields: IFormField[]
}

export function buildClassicPages(fields: IFormField[]): ClassicPage[] {
  const pages: ClassicPage[] = []
  let current: ClassicPage | undefined

  fields.forEach((field, index) => {
    if (field.kind === FieldKindEnum.GROUP) {
      current = { startIndex: index, group: field, fields: [] }
      pages.push(current)
      return
    }

    if (field.parent) {
      const parentIsCurrentGroup = !!current?.group && current.group.id === field.parent.id

      // A child whose group row is not the page being built (a group the
      // respondent backed out of, or an orphan) still needs a page of its own.
      if (!parentIsCurrentGroup) {
        current = { startIndex: index, fields: [] }
        pages.push(current)
      }

      current!.fields.push(field)
      return
    }

    current = { startIndex: index, fields: [field] }
    pages.push(current)
  })

  return pages
}

/** Index of the page the scroll position currently sits on. */
export function findClassicPageIndex(pages: ClassicPage[], scrollIndex: number): number {
  let found = 0

  pages.forEach((page, index) => {
    if (scrollIndex >= page.startIndex) {
      found = index
    }
  })

  return found
}

export function findClassicPage(
  pages: ClassicPage[],
  scrollIndex: number
): ClassicPage | undefined {
  return pages[findClassicPageIndex(pages, scrollIndex)]
}

/** Classic progress runs on page position, not on answered questions. */
export function getClassicPageProgress(fields: IFormField[], scrollIndex: number): number {
  const pages = buildClassicPages(fields)

  if (pages.length < 2) {
    return 0
  }

  const index = findClassicPageIndex(pages, scrollIndex)

  return Math.round((index / (pages.length - 1)) * 100)
}

export function isLastClassicPage(fields: IFormField[], scrollIndex: number): boolean {
  const pages = buildClassicPages(fields)

  return findClassicPageIndex(pages, scrollIndex) >= pages.length - 1
}

/**
 * Whether a field is presented on the page the respondent currently sees.
 * Blocks use it to mark every question of a classic page as active, since the
 * flat scroll position only points at the page's first field.
 */
export function isFieldOnActiveClassicPage(
  fields: IFormField[],
  scrollIndex: number,
  fieldId: string
): boolean {
  const page = findClassicPage(buildClassicPages(fields), scrollIndex)

  if (!page) {
    return false
  }

  return page.group?.id === fieldId || page.fields.some(field => field.id === fieldId)
}
