import { hexRGB, luminance } from './cardTint.ts'
import type { FeedStreamItem } from './useFeed.ts'
import { formatViewersCompact, formatViewersExact } from '../utils/viewers.ts'

const stateLabels = { pre: 'Upcoming', in: 'Live', post: 'Final' } as const
const delayedState = 'Delayed'

type Match = NonNullable<FeedStreamItem['match']>

/** Up to `count` capital initials, one per word. */
export function teamInitials(name: string, count = 2): string {
  return name.trim().split(/\s+/).slice(0, count).map(word => Array.from(word)[0] ?? '').join('').toUpperCase()
}

/** The feed's abbreviation, or initials when it is empty, so nothing under a logo is ever blank. */
export function bannerAbbreviation(side: Match['away']): string {
  return side.abbreviation.trim() || teamInitials(side.name, 3)
}

/**
 * A provider clock only moves on a publish, so a bare minute would sit still until the next one. Advance
 * the provider's own number by the time since it showed, which is right for a late kickoff and for
 * stoppage (45+2 becomes 45+3) without assuming an exact kickoff or a fixed interval.
 */
export function matchMinute(detail: string, state: Match['state'], observedAt?: number, now?: number) {
  const shown = /^(\d+)(?:\+(\d+))?'$/.exec(detail)
  if (!shown || state !== 'in' || !observedAt || !now || now < observedAt) return detail
  const advance = Math.floor((now - observedAt) / 60)
  if (!advance) return detail
  if (shown[2] === undefined) return `${Number(shown[1]) + advance}'`
  return `${shown[1]}+${Number(shown[2]) + advance}'`
}

/** Remembers when a detail first appeared on a card, so `matchMinute` can count from it. */
export function detailClock() {
  let seen = { detail: '', at: 0 }
  return (detail: string, now?: number) => {
    if (detail !== seen.detail) seen = { detail, at: now ?? 0 }
    return seen.at
  }
}

export function matchBannerContent(match: Match, viewers: string | number, metric: 'viewers' | 'views', stale: boolean,
  delayed = false, clock: { observedAt?: number; now?: number } = {}) {
  const state = delayed && match.state === 'pre' ? delayedState : stateLabels[match.state]
  const hasScores = match.away.score !== null && match.home.score !== null
  const shown = matchMinute(match.detail, match.state, clock.observedAt, clock.now)
  const detail = match.state === 'pre' && !hasScores ? 'vs' : shown === state ? '' : shown
  const exact = formatViewersExact(viewers)
  const unit = exact === '1' ? metric.slice(0, -1) : metric
  const compact = formatViewersCompact(viewers)
  const audience = stale ? '' : `${compact} ${unit[0]!.toUpperCase()}${unit.slice(1)}`
  // The name says what the banner shows, in its words and order: matchup, state, detail, audience.
  // The exact count follows the compact one only when they differ.
  const teams = hasScores
    ? `${match.away.name} ${match.away.score}, ${match.home.name} ${match.home.score}`
    : `${match.away.name} vs ${match.home.name}`
  const spoken = audience && (exact === compact ? audience : `${audience} (${exact})`)
  const spokenState = delayed && match.state === 'pre' ? 'Kickoff delayed' : state
  const label = [teams, spokenState, detail === 'vs' ? '' : detail, spoken].filter(Boolean).join('. ') + '.'
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

/**
 * A crest painted in its own team colour disappears when it sits on the same colour (an orange mark on
 * the orange end of the field). Return a halo of the opposite polarity at the least opacity that clears
 * `target` against the field, so the mark keeps a readable silhouette whatever it is drawn in.
 */
export function logoHalo(field: string, ink: string, paper: string, target: number): string {
  const ground = luminance(hexRGB(field) ?? [0, 0, 0])
  const ratio = (lightness: number) => (Math.max(ground, lightness) + 0.05) / (Math.min(ground, lightness) + 0.05)
  const [dark, light] = [hexRGB(ink)!, hexRGB(paper)!]
  const halo = ratio(1) >= ratio(0) ? light : dark
  const end = luminance(halo)
  const at = (alpha: number) => ground + (end - ground) * alpha
  if (ratio(end) <= target) return `rgb(${halo.map(c => Math.round(c * 255)).join(' ')} / .9)`
  let low = 0, high = 1
  for (let i = 0; i < 20; i++) {
    const middle = (low + high) / 2
    if (ratio(at(middle)) >= target) high = middle
    else low = middle
  }
  // Round outward so the printed opacity never lands under the target.
  return `rgb(${halo.map(c => Math.round(c * 255)).join(' ')} / ${Math.min(1, high + 0.005).toFixed(2)})`
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
