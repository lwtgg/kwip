// Blurhash algorithm — MIT, from woltapp/blurhash
const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~'

function fromBase83(hash: string, start: number, length: number): number {
  let value = 0
  for (let i = start; i < start + length; i++) {
    const digit = alphabet.indexOf(hash[i]!)
    if (digit < 0) return -1
    value = value * 83 + digit
  }
  return value
}

function toLinear(byte: number): number {
  const s = byte / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

function toSrgb(linear: number): number {
  const v = Math.max(0, Math.min(1, linear))
  return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055))
}

export function decodeBlurhash(hash: string, width: number, height: number): Uint8ClampedArray | null {
  if (typeof hash !== 'string' || hash.length < 6 ||
      !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) return null

  const size = fromBase83(hash, 0, 1)
  if (size < 0 || size > 80) return null
  const columns = size % 9 + 1
  const rows = Math.floor(size / 9) + 1
  const count = columns * rows
  if (hash.length !== 4 + 2 * count) return null

  const quantizedMax = fromBase83(hash, 1, 1)
  const dc = fromBase83(hash, 2, 4)
  if (quantizedMax < 0 || dc < 0 || dc > 0xffffff) return null
  const max = (quantizedMax + 1) / 166
  const linearAc = (value: number) => {
    const signed = (value - 9) / 9
    return signed * Math.abs(signed) * max
  }

  const colors = [[toLinear(dc >> 16), toLinear((dc >> 8) & 255), toLinear(dc & 255)]]
  for (let i = 1; i < count; i++) {
    const ac = fromBase83(hash, 4 + 2 * i, 2)
    if (ac < 0 || ac >= 19 ** 3) return null
    colors.push([linearAc(Math.floor(ac / 361)), linearAc(Math.floor(ac / 19) % 19), linearAc(ac % 19)])
  }

  const xBasis = Array.from({ length: width * columns }, (_, i) =>
    Math.cos(Math.PI * Math.floor(i / columns) * (i % columns) / width))
  const yBasis = Array.from({ length: height * rows }, (_, i) =>
    Math.cos(Math.PI * Math.floor(i / rows) * (i % rows) / height))

  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0
      let g = 0
      let b = 0
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < columns; i++) {
          const basis = xBasis[x * columns + i]! * yBasis[y * rows + j]!
          const color = colors[j * columns + i]!
          r += color[0]! * basis
          g += color[1]! * basis
          b += color[2]! * basis
        }
      }
      const offset = (y * width + x) * 4
      pixels[offset] = toSrgb(r)
      pixels[offset + 1] = toSrgb(g)
      pixels[offset + 2] = toSrgb(b)
      pixels[offset + 3] = 255
    }
  }
  return pixels
}
