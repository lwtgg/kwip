import { hexRGB } from './cardTint.ts'
import type { FeedStreamItem } from './useFeed.ts'
import { formatViewersCompact, formatViewersExact } from '../utils/viewers.ts'

const stateLabels = { pre: 'Upcoming', in: 'Live', post: 'Final' } as const

type Match = NonNullable<FeedStreamItem['match']>

export function matchBannerContent(match: Match, viewers: string | number, metric: 'viewers' | 'views', stale: boolean) {
  const state = stateLabels[match.state]
  const hasScores = match.away.score !== null && match.home.score !== null
  const detail = match.state === 'pre' && !hasScores ? 'vs' : match.detail === state ? '' : match.detail
  const exact = formatViewersExact(viewers)
  const unit = exact === '1' ? metric.slice(0, -1) : metric
  const compact = formatViewersCompact(viewers)
  const audience = stale ? '' : `${compact} ${unit[0]!.toUpperCase()}${unit.slice(1)}`
  const label = [match.away, match.home].map(side => hasScores ? `${side.name} ${side.score}` : side.name)
    .concat(match.detail || state).join(', ')
  return { hasScores, tiers: [state, detail, audience], label }
}

/** sRGB source-over, with invalid/missing colours degrading independently. */
export function mixBannerColor(color: string | null | undefined, base: string, opacity: number): string {
  const ground = hexRGB(base)
  if (!ground) throw new Error('Invalid banner base')
  const seed = hexRGB(color)
  if (!seed) return base
  const alpha = Math.max(0, Math.min(1, opacity))
  return '#' + ground.map((channel, i) => Math.round((channel * (1 - alpha) + seed[i]! * alpha) * 255)
    .toString(16).padStart(2, '0')).join('')
}

export function bannerColor(color: string | null | undefined, base: string): string {
  return hexRGB(color) ? color! : base
}

/** Black scrim needed at the brightest (unshaded) point for opaque white AA text. */
export function bannerScrim(colors: string[], minimum: number): number {
  const luminance = (rgb: number[]) => rgb.reduce((sum, value, i) =>
    sum + (value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][i]!, 0)
  const passes = (alpha: number) => colors.every(color => {
    const rgb = hexRGB(color)!
    return 1.05 / (luminance(rgb.map(value => value * (1 - alpha))) + .05) >= minimum
  })
  if (passes(0)) return 0
  let low = 0, high = 1
  for (let i = 0; i < 24; i++) {
    const middle = (low + high) / 2
    if (passes(middle)) high = middle
    else low = middle
  }
  return high
}
