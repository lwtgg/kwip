/** Run: node tests/cards_contrast.ts /tmp/kwip50a-resume-shots/contrast.json */
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { bannerColor, bannerScrim, mixBannerColor } from '../app/composables/matchBanner.ts'
import { tintField, fieldContrast, hexRGB } from '../app/composables/cardTint.ts'

const css = readFileSync(new URL('../app/assets/css/theme.css', import.meta.url), 'utf8')
const listing = JSON.parse(readFileSync(process.argv[3] ?? new URL('../public/fixtures/streams.json', import.meta.url), 'utf8'))
const seeds = ['#000', '#fff', '#f00', '#0f0', '#00f', '#ff0', '#0ff', '#f0f', '#777', 'invalid']
const results = []
for (const theme of ['dark', 'light'] as const) {
  for (const scale of ['listing', 'hero'] as const) {
    const focus = hexRGB(theme === 'dark' ? '#73e4b0' : '#086347')!
    const canvas = hexRGB(theme === 'dark' ? '#0c100f' : '#f5f8f5')!
    const measure = (colors: string[]) => {
      const field = tintField(colors, css, theme, scale)
      const focusContrast = fieldContrast(field.pair[0]!, field.pair[1]!, focus)
      assert.ok(field.contrast.every(ratio => ratio >= 4.5))
      assert.ok(focusContrast >= 3)
      assert.ok(fieldContrast(canvas, canvas, focus) >= 3)
      return { colors, accepted: field.accepted, contrast: field.contrast, focusContrast }
    }
    const extremes = seeds.flatMap(a => seeds.map(b => measure([a, b])))
    const fixtures = listing.streams.flatMap((category: { streams: { colors: string[] }[] }) =>
      category.streams.map(event => measure(event.colors ?? [])))
    results.push({ theme, scale, neutral: measure([]), extremes, fixtures,
      minimum: {
        fg: Math.min(...extremes.map(field => field.contrast[0]!)),
        muted: Math.min(...extremes.map(field => field.contrast[1]!)),
        focus: Math.min(...extremes.map(field => field.focusContrast)),
      },
    })
  }
}
const token = (name: string) => css.match(new RegExp(`--${name}:\\s*([^;]+)`))![1]!.trim()
const base = token('banner-base')
const matches = listing.streams.flatMap((category: { streams: { match?: { away: { color: string }; home: { color: string } } }[] }) =>
  category.streams.flatMap(event => event.match ? [[event.match.away.color, event.match.home.color]] : []))
const pairs = [...seeds.flatMap(a => seeds.map(b => [a, b])), ...matches, ['#192f23', '#361f24'], []]
const banners = (['dark', 'light'] as const).flatMap(theme => (['listing', 'hero'] as const).flatMap(scale =>
  (['pre', 'in', 'post'] as const).flatMap(state => pairs.map(seeds => {
    const pair = [seeds[0], seeds[1]].map(color => state === 'pre' && scale === 'listing'
      ? mixBannerColor(color, base, Number(token('banner-unplayed-alpha')))
      : bannerColor(color, base))
    const scrim = bannerScrim(pair, Number(token('card-text-contrast')) + Number(token('banner-contrast-headroom')))
    const rgb = pair.map(color => hexRGB(color)!.map(channel => channel * (1 - scrim)))
    const contrast = fieldContrast(rgb[0]!, rgb[1]!, hexRGB(token('banner-white'))!)
    assert.ok(contrast >= 4.5, JSON.stringify({ theme, scale, state, pair, contrast }))
    return { theme, scale, state, seeds, pair, scrim, contrast }
  }))))
const worstBanner = banners.reduce((a, b) => a.contrast < b.contrast ? a : b)
console.log('Banner sweep', JSON.stringify({ count: banners.length, worstBanner }))
const report = { generatedAt: new Date().toISOString(), banners, worstBanner, tokenHash: createHash('sha256').update(css).digest('hex'), results }
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(report, null, 2))
console.log(JSON.stringify(results.map(({ theme, scale, minimum }) => ({ theme, scale, minimum })), null, 2))
