/** Pure sRGB tint math. Values come from theme.css, never the browser or artwork. */
export type RGB = [number, number, number]
export function hexRGB(seed: unknown): RGB | null {
  if (typeof seed !== 'string' || !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(seed)) return null
  let hex = seed.slice(1)
  if (hex.length === 3) hex = [...hex].map(c => c + c).join('')
  return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255) as RGB
}
export function luminance(rgb: RGB): number {
  const linear = rgb.map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722
}
export function boundedSeed(rgb: RGB, saturationMax: number, low: number, high: number): RGB {
  const max = Math.max(...rgb), min = Math.min(...rgb), delta = max - min
  const lightness = (max + min) / 2
  let hue = 0
  if (delta) {
    if (max === rgb[0]) hue = ((rgb[1] - rgb[2]) / delta) % 6
    else if (max === rgb[1]) hue = (rgb[2] - rgb[0]) / delta + 2
    else hue = (rgb[0] - rgb[1]) / delta + 4
    hue = (hue / 6 + 1) % 1
  }
  const saturation = delta ? delta / (1 - Math.abs(2 * lightness - 1)) : 0
  const s = Math.min(saturation, saturationMax), l = Math.max(low, Math.min(high, lightness))
  const a = s * Math.min(l, 1 - l)
  const channel = (n: number) => {
    const k = (n + hue * 12) % 12
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
  }
  return [channel(0), channel(8), channel(4)]
}
export const interpolate = (a: RGB, b: RGB, t: number): RGB => a.map((v, i) => v + (b[i]! - v) * t) as RGB

/** sRGB luminance along a linear field is convex: max is at an endpoint;
 * its unique minimum (possibly a flat interval) is bounded by ternary search.
 * The small outward margin prevents numeric error from admitting a failing field. */
export function fieldContrast(a: RGB, b: RGB, foreground: RGB): number {
  let lo = 0, hi = 1
  for (let i = 0; i < 80; i++) {
    const l = lo + (hi - lo) / 3, r = hi - (hi - lo) / 3
    if (luminance(interpolate(a, b, l)) < luminance(interpolate(a, b, r))) hi = r
    else lo = l
  }
  const min = Math.max(0, luminance(interpolate(a, b, (lo + hi) / 2)) - 1e-12)
  const max = Math.min(1, Math.max(luminance(a), luminance(b)) + 1e-12)
  const fg = luminance(foreground)
  if (fg >= min && fg <= max) return 1
  return fg < min ? (min + 0.05) / (fg + 0.05) : (fg + 0.05) / (max + 0.05)
}

export function tintField(seeds: unknown[], css: string, theme: 'dark' | 'light', scale: 'listing' | 'hero') {
  const token = (name: string) => {
    const matches = [...css.matchAll(new RegExp(`--${name}:\\s*([^;]+);`, 'g'))]
    return matches[theme === 'light' ? matches.length - 1 : 0]?.[1]?.trim() ?? ''
  }
  const number = (name: string) => Number(token(name))
  const surface = hexRGB(token('color-surface'))!
  const foregrounds = ['color-fg', 'color-muted'].map(name => hexRGB(token(name))!)
  const valid = seeds.slice(0, 2).map(hexRGB).filter((v): v is RGB => v !== null)
  const endpoints = valid.map(rgb => {
    const bounded = boundedSeed(rgb, number('card-tint-saturation-max'), number(`card-tint-${theme}-min`), number(`card-tint-${theme}-max`))
    return bounded.map((v, i) => v * number(`card-tint-${scale}-color`) + surface[i]! * number(`card-tint-${scale}-surface`)) as RGB
  })
  const a = endpoints[0] ?? surface, b = endpoints[1] ?? a
  const contrast = foregrounds.map(fg => fieldContrast(a, b, fg))
  const accepted = valid.length > 0 && contrast.every(ratio => ratio >= number('card-text-contrast'))
  const pair = accepted ? [a, b] : [surface, surface]
  const color = (rgb: RGB) => `rgb(${rgb.map(c => c * 255).join(' ')})`
  return {
    accepted, pair, contrast: foregrounds.map(fg => fieldContrast(pair[0]!, pair[1]!, fg)),
    background: `linear-gradient(90deg in srgb, ${color(pair[0]!)}, ${color(pair[1]!)})`,
  }
}
