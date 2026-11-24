import tokens from '~/assets/css/theme.css?raw'
import { bannerColor, bannerScrim, mixBannerColor } from '~/composables/matchBanner'
import type { FeedStreamItem } from '~/composables/useFeed'

const token = (name: string) => tokens.match(new RegExp(`--${name}:\\s*([^;]+)`))![1]!.trim()
const base = token('banner-base')
const unplayedAlpha = Number(token('banner-unplayed-alpha'))
const contrast = Number(token('card-text-contrast')) + Number(token('banner-contrast-headroom'))

export function matchBannerStyle(match: NonNullable<FeedStreamItem['match']>, scale: 'listing' | 'hero' = 'listing') {
  const pre = match.state === 'pre' && scale !== 'hero'
  const colors = [match.away.color, match.home.color].map(color => pre
    ? mixBannerColor(color, base, unplayedAlpha) : bannerColor(color, base))
  return { '--banner-away': colors[0], '--banner-home': colors[1],
    '--banner-scrim': bannerScrim(colors, contrast),
    '--banner-edge': pre ? '0' : token('banner-edge-alpha'),
    '--banner-team-field': pre
      ? 'linear-gradient(to right, var(--banner-away), var(--banner-base), var(--banner-home))'
      : 'linear-gradient(to right, var(--banner-away) var(--banner-away-stop), var(--banner-home) var(--banner-home-stop))' }
}
