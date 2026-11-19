import type { FeedStreamDetail, FeedStreamSource } from '../composables/useFeed'

export interface SupplementSource extends FeedStreamSource {
  origin: 'supplement'
  substreamName: ''
  sourceTag?: string
  live: boolean
}

interface StrmfreeStream {
  name: string
  category: string
  match_timestamp: number
  iframe?: string
  additional_sources?: { quality: string; url: string; live: boolean }[]
}

const categories = new Map([
  ['basketball', 'basketball'],
  ['football', 'american-football'],
  ['soccer', 'football'],
  ['hockey', 'hockey'],
  ['tennis', 'tennis'],
  ['cricket', 'cricket'],
  ['racing', 'motorsport'],
  ['combat', 'boxing'],
])
const hosts = ['strmfree.st', 'streamfree.top', 'strmfree.pk']
const qualities = ['4K', 'FHD', 'HD', 'SD']

function teams(name: string): string[] {
  return name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .split(/\s+(?:vs|at|v)\s+/)
    .map(team => team.replace(/\b(?:fc|afc|cf|sc)\b/g, '').trim().replace(/\s+/g, ' '))
    .sort()
}

export function isSupplementHost(host: string): boolean {
  return hosts.some(domain => host === domain || host.endsWith('.' + domain))
}

function allowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url.startsWith('//') ? 'https:' + url : url)
    return ['https:', 'http:'].includes(parsed.protocol) && isSupplementHost(parsed.hostname)
  } catch {
    return false
  }
}

export function matchSupplement(
  event: Pick<FeedStreamDetail, 'name' | 'starts_at'>,
  categorySlug: string,
  payload: { streams: StrmfreeStream[] },
): SupplementSource[] | null {
  const pair = teams(event.name)
  if (pair.length !== 2 || !pair[0] || !pair[1]) return null

  const candidates = payload.streams.filter((stream) => {
    if (!(Math.abs(stream.match_timestamp - event.starts_at) <= 3 * 3600)) return false
    const other = teams(stream.name)
    return other.length === 2 && other[0] === pair[0] && other[1] === pair[1]
  })
  const tied = candidates.length > 1
    ? candidates.filter(stream => categories.get(stream.category) === categorySlug)
    : candidates
  const match = tied.length === 1 ? tied[0] : undefined
  if (!match) return null

  const sources = [
    ...(match.additional_sources ?? []),
    ...(match.iframe ? [{ url: match.iframe, live: true, quality: undefined }] : []),
  ]
  function rank(quality?: string) {
    const index = quality === undefined ? -1 : qualities.indexOf(quality)
    return index === -1 ? qualities.length : index
  }

  return sources.filter(source => allowedUrl(source.url))
    .sort((a, b) => rank(a.quality) - rank(b.quality) || Number(b.live) - Number(a.live))
    .map(source => ({
      name: '',
      substreamName: '',
      sourceTag: source.quality,
      origin: 'supplement',
      live: source.live,
      default: false,
      type: 'iframe',
      data: source.url,
    }))
}
