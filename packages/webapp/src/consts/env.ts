import { helper } from '@myform/utils'

export const DEVICEID_COOKIE_NAME = 'MYFORM_DEVICE_ID'
export const LOGGED_COOKIE_NAME = 'MYFORM_LOGGED_IN'
export const LOCALE_COOKIE_NAME = 'MYFORM_LOCALE'
export const REDIRECT_COOKIE_NAME = 'MYFORM_REDIRECT'
export const INVITATION_COOKIE_NAME = 'MYFORM_INVITATION'

export const HOMEPAGE_URL =
  window.myform?.homepageURL || (import.meta.env.VITE_DASHBOARD_URL as string)
export const DASHBOARD_URL = HOMEPAGE_URL
export const WEBSITE_URL =
  window.myform?.websiteURL || (import.meta.env.VITE_HOMEPAGE_URL as string)

export const GRAPHQL_API_URL = import.meta.env.VITE_GRAPHQL_API_URL as string
export const CDN_UPLOAD_URL = import.meta.env.VITE_CDN_UPLOAD_URL as string

export const COOKIE_DOMAIN =
  window.myform?.cookieDomain || (import.meta.env.VITE_COOKIE_DOMAIN as string)

export const STRIPE_PUBLISHABLE_KEY =
  window.myform?.stripePublishableKey || (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string)
export const GOOGLE_RECAPTCHA_KEY =
  window.myform?.googleRecaptchaKey || (import.meta.env.VITE_GOOGLE_RECAPTCHA_KEY as string)

export const DISABLE_LOGIN_WITH_PASSWORD = helper.isTrue(
  window.myform?.disableLoginWithPassword || import.meta.env.VITE_DISABLE_LOGIN_WITH_PASSWORD
)
export const DISABLE_LOGIN_WITH_GOOGLE = helper.isTrue(
  window.myform?.disableLoginWithGoogle || import.meta.env.VITE_DISABLE_LOGIN_WITH_GOOGLE
)
export const DISABLE_LOGIN_WITH_APPLE = helper.isTrue(
  window.myform?.disableLoginWithApple || import.meta.env.VITE_DISABLE_LOGIN_WITH_APPLE
)
export const DISABLE_LOGIN_WITH_OIDC = helper.isTrue(
  window.myform?.disableLoginWithOidc ?? import.meta.env.VITE_DISABLE_LOGIN_WITH_OIDC ?? 'true'
)
export const OIDC_DISPLAY_NAME =
  window.myform?.oidcDisplayName || (import.meta.env.VITE_OIDC_DISPLAY_NAME as string) || 'SSO'
export const OIDC_DISPLAY_ICON_URL =
  window.myform?.oidcDisplayIconUrl || (import.meta.env.VITE_OIDC_DISPLAY_ICON_URL as string) || ''
export const VERIFY_USER_EMAIL = helper.isTrue(
  window.myform?.verifyUserEmail ?? import.meta.env.VITE_VERIFY_USER_EMAIL ?? 'true'
)
export const ENABLE_GOOGLE_FONTS = helper.isTrue(
  window.myform?.enableGoogleFonts ?? import.meta.env.VITE_ENABLE_GOOGLE_FONTS ?? 'true'
)

export function isRegistrationDisabled() {
  return helper.isTrue(window.myform?.appDisableRegistration)
}

export function isSubmissionIpDisabled() {
  return helper.isTrue(window.myform?.disableSubmissionIp)
}

export function getVerifyEmailResendCooldownSeconds() {
  const value = Number(window.myform?.verifyEmailResendCooldownSeconds)
  return Number.isFinite(value) && value > 0 ? value : 60
}

export const TEMPLATES_URL =
  window.myform?.templatesURL || (import.meta.env.VITE_TEMPLATES_URL as string)
export const HELP_CENTER_URL =
  window.myform?.helpCenterURL || (import.meta.env.VITE_HELP_CENTER_URL as string)
export const FEEDBACK_FORM_URL =
  window.myform?.feedbackFormUrl || (import.meta.env.VITE_FEEDBACK_FORM_URL as string) || ''

export const IS_PROD = import.meta.env.NODE_ENV === 'production'
export const PACKAGE_VERSION = import.meta.env.PACKAGE_VERSION

export const COOKIE_OPTIONS: AnyMap = {
  expires: 365,
  sameSite: 'strict',
  domain: COOKIE_DOMAIN,
  secure: IS_PROD
}

if (window.myform) {
  window.myform.enableGoogleFonts = ENABLE_GOOGLE_FONTS
}
