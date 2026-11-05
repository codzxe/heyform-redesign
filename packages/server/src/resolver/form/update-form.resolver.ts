import { Auth, Form, FormGuard, User } from '@decorator'
import { BCRYPT_SALT } from '@environments'
import { UpdateFormInput } from '@graphql'
import { FormModel, UserModel } from '@model'
import { helper, pickValidValues } from '@myform/utils'
import { Args, Mutation, Resolver } from '@nestjs/graphql'
import { FormService } from '@service'
import {
  normalizeNotificationRecipients,
  normalizeTranslationLanguages,
  passwordHash
} from '@utils'

@Resolver()
@Auth()
export class UpdateFormResolver {
  constructor(private readonly formService: FormService) {}

  @Mutation(returns => Boolean)
  @FormGuard()
  async updateForm(
    @Form() form: FormModel,
    @User() user: UserModel,
    @Args('input') input: UpdateFormInput
  ): Promise<boolean> {
    let updates: Record<string, any> = pickValidValues(input as any, [
      'name',
      ['active', 'settings.active'],
      ['enableExpirationDate', 'settings.enableExpirationDate'],
      ['expirationTimeZone', 'settings.expirationTimeZone'],
      ['enabledAt', 'settings.enabledAt'],
      ['closedAt', 'settings.closedAt'],
      ['enableTimeLimit', 'settings.enableTimeLimit'],
      ['timeLimit', 'settings.timeLimit'],
      ['captchaKind', 'settings.captchaKind'],
      ['filterSpam', 'settings.filterSpam'],
      ['enableQuotaLimit', 'settings.enableQuotaLimit'],
      ['quotaLimit', 'settings.quotaLimit'],
      ['enableIpLimit', 'settings.enableIpLimit'],
      ['ipLimitCount', 'settings.ipLimitCount'],
      ['ipLimitTime', 'settings.ipLimitTime'],
      ['displayIpAddress', 'settings.displayIpAddress'],
      ['enableProgress', 'settings.enableProgress'],
      ['enableQuestionList', 'settings.enableQuestionList'],
      ['enableNavigationArrows', 'settings.enableNavigationArrows'],
      ['openLinksInNewTab', 'settings.openLinksInNewTab'],
      ['locale', 'settings.locale'],
      ['languages', 'settings.languages'],
      ['enableClosedMessage', 'settings.enableClosedMessage'],
      ['closedFormTitle', 'settings.closedFormTitle'],
      ['closedFormDescription', 'settings.closedFormDescription'],
      ['allowArchive', 'settings.allowArchive'],
      ['requirePassword', 'settings.requirePassword'],
      ['enableEmailNotification', 'settings.enableEmailNotification'],
      ['notificationReplyToRespondent', 'settings.notificationReplyToRespondent'],
      ['notificationSubjectRespondent', 'settings.notificationSubjectRespondent'],
      ['notificationSkipOwner', 'settings.notificationSkipOwner'],
      ['responseLayout', 'settings.responseLayout'],
      ['showResultsOnCompletion', 'settings.showResultsOnCompletion'],
      ['quizPassingScore', 'settings.quizPassingScore'],
      ['showLeaderboard', 'settings.showLeaderboard'],
      ['leaderboardSize', 'settings.leaderboardSize'],
      ['anonymousLeaderboard', 'settings.anonymousLeaderboard'],
      ['enableResponseConsent', 'settings.enableResponseConsent'],
      ['consentText', 'settings.consentText'],
      ['consentVersion', 'settings.consentVersion'],
      ['enableResume', 'settings.enableResume'],
      ['resumeExpirationDays', 'settings.resumeExpirationDays']
    ])

    if (helper.isValid(input.password)) {
      updates['settings.password'] = await passwordHash(input.password!, BCRYPT_SALT)
    }

    // `pickValidValues` drops empty arrays, but an empty list must clear the recipients.
    if (input.notificationRecipients !== undefined) {
      updates['settings.notificationRecipients'] = normalizeNotificationRecipients(
        input.notificationRecipients
      )
    }

    // `pickValidValues` drops nulls, but an explicit null must clear the
    // per-form retention override (unset means the workspace default applies).
    if (input.retentionDays !== undefined) {
      updates['settings.retentionDays'] = input.retentionDays
    }

    if (helper.isTrue(input.redirectOnCompletion)) {
      updates = {
        ...updates,
        ...pickValidValues(input as any, [
          ['redirectOnCompletion', 'settings.redirectOnCompletion'],
          ['redirectUrl', 'settings.redirectUrl'],
          ['redirectDelay', 'settings.redirectDelay']
        ])
      }
    }

    // `pickValidValues` drops empty arrays, but we must persist language updates
    // (including clearing translations to an empty list).
    const hasLanguagesInput =
      Object.prototype.hasOwnProperty.call(input, 'languages') ||
      helper.isNull(input.languages) ||
      helper.isArray(input.languages)

    if (hasLanguagesInput) {
      updates['settings.languages'] = normalizeTranslationLanguages(input.languages)
    }

    if (helper.isValidArray(input.languages)) {
      const currentLanguages = new Set(form.settings?.languages || [])
      const addedLanguages = normalizeTranslationLanguages(input.languages).filter(
        language => !currentLanguages.has(language)
      )

      if (addedLanguages.length > 0) {
        await this.formService.addTranslateQueue(input.formId, form.teamId, user.id, addedLanguages)
      }
    }

    if (input.metaTitle || input.metaDescription || input.metaOGImageUrl) {
      updates = {
        ...updates,
        ...pickValidValues(input as any, [
          ['metaTitle', 'settings.metaTitle'],
          ['metaDescription', 'settings.metaDescription'],
          ['metaOGImageUrl', 'settings.metaOGImageUrl']
        ])
      }
    } else if (helper.isNull(input.metaOGImageUrl)) {
      updates['settings.metaOGImageUrl'] = null
    }

    return this.formService.update(input.formId, updates)
  }
}
