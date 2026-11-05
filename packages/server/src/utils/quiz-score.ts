import {
  Answer,
  Choice,
  FieldKindEnum,
  FormField,
  FormKindEnum,
  FormSettings
} from '@myform/shared-types-enums'

import { flattenFields } from '@myform/answer-utils'

export interface QuizScore {
  score: number
  totalScore: number
  percentage: number
  passed: boolean | null
  correctCount: number
  questionCount: number
}

const CHOICE_KINDS: FieldKindEnum[] = [
  FieldKindEnum.YES_NO,
  FieldKindEnum.MULTIPLE_CHOICE,
  FieldKindEnum.PICTURE_CHOICE
]

function isChoiceKind(kind: FieldKindEnum): boolean {
  return CHOICE_KINDS.includes(kind)
}

function expectedChoiceScore(choices: Choice[] = []): number {
  const scored = choices
    .filter(choice => choice.isExpected)
    .map(choice => (typeof choice.score === 'number' && choice.score >= 0 ? choice.score : 1))
  return scored.length > 0 ? Math.max(...scored) : 0
}

/**
 * Answer value for choice fields: either "{ value: string[], other: string }"
 * or a single id string, depending on the block.
 */
function selectedChoiceIds(answer: Answer): string[] {
  const value: any = answer.value

  if (Array.isArray(value?.value)) {
    return value.value.map(String)
  }
  if (typeof value === 'string') {
    return [value]
  }
  if (typeof value?.value === 'string') {
    return [value.value]
  }
  return []
}

/**
 * Server-side quiz scoring. All values derive from the published form
 * configuration and the stored answers — nothing is trusted from the client.
 *
 * - choice questions: the score of every selected expected choice is summed;
 *   selecting a non-expected choice earns nothing (no negative scores)
 * - a question is "correct" when every selected choice is expected and at
 *   least one is
 * - totalScore sums the best achievable score per scorable question
 */
export interface ScorableFormLike {
  kind: FormKindEnum
  settings?: FormSettings
  fields?: FormField[]
}

export function calculateQuizScore(form: ScorableFormLike, answers: Answer[]): QuizScore | null {
  if (form.kind !== FormKindEnum.QUIZ) {
    return null
  }

  const fields = flattenFields(form.fields, true)
  const answerById = new Map(answers.map(answer => [answer.id, answer]))
  const scorableFields = fields.filter(field => isChoiceKind(field.kind) && helperHasScore(field))

  let score = 0
  let totalScore = 0
  let correctCount = 0
  let questionCount = 0

  for (const field of scorableFields) {
    questionCount += 1
    const maxScore = expectedChoiceScore(field.properties?.choices)
    totalScore += maxScore

    if (maxScore <= 0) {
      continue
    }

    const answer = answerById.get(field.id)
    if (!answer) {
      continue
    }

    const choicesById = new Map((field.properties?.choices ?? []).map(c => [c.id, c]))
    const selectedIds = selectedChoiceIds(answer)
    let fieldScore = 0
    let allExpected = selectedIds.length > 0

    for (const id of selectedIds) {
      const choice = choicesById.get(id)
      if (!choice || !choice.isExpected) {
        allExpected = false
        continue
      }
      fieldScore += typeof choice.score === 'number' && choice.score >= 0 ? choice.score : 1
    }

    score += fieldScore
    if (allExpected && fieldScore > 0) {
      correctCount += 1
    }
  }

  if (questionCount < 1) {
    return null
  }

  const percentage = totalScore > 0 ? Math.round((score / totalScore) * 10000) / 100 : 0
  const passingScore = form.settings?.quizPassingScore
  const passed =
    typeof passingScore === 'number' && passingScore >= 0 && passingScore <= 100
      ? percentage >= passingScore
      : null

  return {
    score,
    totalScore,
    percentage,
    passed,
    correctCount,
    questionCount
  }
}

function helperHasScore(field: FormField): boolean {
  const choices: Choice[] = field.properties?.choices ?? []
  return choices.some(choice => choice.isExpected)
}
