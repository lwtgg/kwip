import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { hexRGB, boundedSeed, tintField, fieldContrast } from '../app/composables/cardTint.ts'
const css = readFileSync(new URL('../app/assets/css/theme.css', import.meta.url), 'utf8')

test('seed validation is exact, independent, and limited to the first two entries', () => {
  assert.deepEqual(hexRGB('#AbC'), hexRGB('#aabbcc'))
  for (const seed of ['red', '#1234', '#11223344', ' #123', '#123 ', 'url(x)', null]) assert.equal(hexRGB(seed), null)
  assert.equal(tintField(['bad', 'bad', '#fff'], css, 'dark', 'listing').accepted, false)
  const one = tintField(['bad', '#f00'], css, 'dark', 'listing')
  assert.deepEqual(one.pair[0], one.pair[1])
})
test('bounds preserve hue and cap saturation for extremes and shorthand', () => {
  assert.deepEqual(boundedSeed([1, 0, 0], .6, .18, .26).map(v => Math.round(v * 1000)), [416, 104, 104])
  assert.deepEqual(boundedSeed([0, 0, 0], .6, .84, .92), [.84, .84, .84])
})
test('whole-field contrast detects a failing interior despite passing endpoints', () => {
  const a = hexRGB('#f00')!, b = hexRGB('#00f')!, white = hexRGB('#fff')!
  // Convex luminance has an interior minimum: black text can fail only in the middle.
  const black = hexRGB('#000')!
  assert.ok(fieldContrast(a, b, black) < Math.min(fieldContrast(a, a, black), fieldContrast(b, b, black)))
  assert.ok(fieldContrast(a, b, white) >= 3.99)
  // Widen the bounds to exercise rejection independently of today's safe palette.
  const unrestricted = css
    .replace('--color-surface: #1b201e', '--color-surface: #ffffff')
    .replace('--color-fg: #edf2ef', '--color-fg: #000000')
    .replace('--color-muted: #aeb8b2', '--color-muted: #000000')
    .replace('--card-tint-saturation-max: 0.6', '--card-tint-saturation-max: 1')
    .replace('--card-tint-dark-min: 0.18', '--card-tint-dark-min: 0')
    .replace('--card-tint-dark-max: 0.26', '--card-tint-dark-max: 1')
    .replace('--card-tint-hero-color: 0.5', '--card-tint-hero-color: 1')
    .replace('--card-tint-hero-surface: 0.5', '--card-tint-hero-surface: 0')
  const green = hexRGB('#0f0')!
  assert.ok(fieldContrast(a, a, black) >= 4.5 && fieldContrast(green, green, black) >= 4.5)
  const rejected = tintField(['#f00', '#0f0'], unrestricted, 'dark', 'hero')
  assert.equal(rejected.accepted, false, 'rejects the entire field despite passing endpoints')
  assert.deepEqual(rejected.pair, [white, white])
})
test('both themes, scales and worst-case seed pairs retain AA or reject the whole field', () => {
  const seeds = ['#000', '#fff', '#f00', '#0f0', '#00f', '#ff0', '#0ff', '#f0f', '#777', 'invalid']
  for (const theme of ['dark', 'light'] as const) for (const scale of ['listing', 'hero'] as const) {
    for (const a of seeds) for (const b of seeds) {
      const field = tintField([a, b], css, theme, scale)
      assert.ok(field.contrast.every(c => c >= 4.5), `${theme}/${scale}/${a}/${b}: ${field.contrast}`)
    }
  }
  // Deliberately incompatible secondary ink rejects even a single readable-looking seed.
  const incompatible = css.replace('--color-muted: #aeb8b2', '--color-muted: #888888')
  const result = tintField(['#fff'], incompatible, 'dark', 'hero')
  assert.equal(result.accepted, false)
  assert.deepEqual(result.pair[0], hexRGB('#1b201e'))
  assert.ok(result.contrast.every(c => c >= 4.5), 'rejected tint returns a readable neutral pair')
})
