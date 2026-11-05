import { Controller, Get, Res } from '@nestjs/common'
import type { Response } from 'express'

import {
  APP_HOMEPAGE_URL,
  FEEDBACK_FORM_URL,
  HELP_CENTER_URL,
  COOKIE_DOMAIN,
  ENABLE_GOOGLE_FONTS,
  GOOGLE_RECAPTCHA_KEY,
  STRIPE_PUBLISHABLE_KEY
} from '@environments'

@Controller()
export class FormController {
  @Get('/form/:formId')
  async index(@Res() res: Response) {
    return res.render('index', {
      myform: {
        homepageURL: APP_HOMEPAGE_URL,
        websiteURL: APP_HOMEPAGE_URL,
        helpCenterURL: HELP_CENTER_URL,
        feedbackFormUrl: FEEDBACK_FORM_URL,
        cookieDomain: COOKIE_DOMAIN,
        enableGoogleFonts: ENABLE_GOOGLE_FONTS,
        stripePublishableKey: STRIPE_PUBLISHABLE_KEY,
        googleRecaptchaKey: GOOGLE_RECAPTCHA_KEY
      }
    })
  }
}
