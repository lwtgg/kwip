import tokens from '~/assets/css/theme.css?raw'
import { tintField } from '~/composables/cardTint'

export function cardTintStyle(seeds: string[] = [], scale: 'listing' | 'hero' = 'listing') {
  return {
    '--card-field-dark': tintField(seeds, tokens, 'dark', scale).background,
    '--card-field-light': tintField(seeds, tokens, 'light', scale).background,
  }
}
