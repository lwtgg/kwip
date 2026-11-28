import tokens from '~/assets/css/theme.css?raw'
import { bannerColor, bannerScrim, logoHalo, mixBannerColor } from '~/composables/matchBanner'
import { hexRGB, interpolate, type RGB } from '~/composables/cardTint'
import type { FeedStreamItem } from '~/composables/useFeed'

const token = (name: string) => tokens.match(new RegExp(`--${name}:\\s*([^;]+)`))![1]!.trim()
const base = token('banner-base')
const unplayedAlpha = Number(token('banner-unplayed-alpha'))
const contrast = Number(token('card-text-contrast')) + Number(token('banner-contrast-headroom'))
const haloInk = hexRGB(token('banner-logo-halo-ink'))!
const haloPaper = hexRGB(token('banner-logo-halo-paper'))!
const ground = hexRGB(base)!
const haloTarget = Number(token('banner-logo-halo-contrast'))
const haloGain = Number(token('banner-logo-halo-gain'))
const preGround = Number(token('banner-logo-halo-pre-ground'))

export function matchBannerStyle(match: NonNullable<FeedStreamItem['match']>, scale: 'listing' | 'hero' = 'listing') {
  const pre = match.state === 'pre' && scale !== 'hero'
  const colors = [match.away.color, match.home.color].map(color => pre
    ? mixBannerColor(color, base, unplayedAlpha) : bannerColor(color, base))
  const halo = (color: string) => {
    // A pre field runs to the base at the centre, so the mark stands on a mix, not on the end stop.
    const field = hexRGB(color) ?? ground
    return logoHalo(pre ? interpolate(field, ground, preGround) : field, haloInk, haloPaper, haloTarget, haloGain)
  }
  return { '--banner-away': colors[0], '--banner-home': colors[1],
    '--banner-away-logo-halo': halo(colors[0]!),
    '--banner-home-logo-halo': halo(colors[1]!),
    '--banner-scrim': bannerScrim(colors, contrast),
    '--banner-edge': pre ? '0' : token('banner-edge-alpha'),
    '--banner-team-field': pre
      ? 'linear-gradient(to right, var(--banner-home), var(--banner-base), var(--banner-away))'
      : 'linear-gradient(to right, var(--banner-home) var(--banner-home-stop), var(--banner-away) var(--banner-away-stop))' }
}
