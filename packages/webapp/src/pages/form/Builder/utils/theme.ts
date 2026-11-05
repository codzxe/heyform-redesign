import { getTheme, getThemeStyle } from '@myform/form-renderer'
import { FormTheme } from '@myform/shared-types-enums'

export function insertThemeStyle(customTheme?: FormTheme) {
  const theme = getTheme(customTheme)
  let content = getThemeStyle(theme)

  let style = document.getElementById('myform-theme')

  if (!style) {
    style = document.createElement('style')
    style.id = 'myform-theme'

    document.head.appendChild(style)
  }

  if (customTheme?.customCSS) {
    content += customTheme!.customCSS
  }

  style.textContent = content
}
