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
    .split(/(?<![\p{L}\p{N}])(?:vs|v|at)(?![\p{L}\p{N}])/u)
    .map(team => team.trim().split(/\s+/)
      .map(token => token.replace(/[^\p{L}\p{N}]/gu, ''))
      .filter(token => token && !/^(?:fc|afc|cf|sc)$/.test(token))
      .join(' '))
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

export function isCachedSupplement(value: unknown, now: number): value is {
  status: 'merged'
  fetchedAt: number
  sources: SupplementSource[]
} {
  if (typeof value !== 'object' || value === null) return false
  const { status, fetchedAt, sources } = value as Record<string, unknown>
  return status === 'merged' && typeof fetchedAt === 'number' && Number.isSafeInteger(fetchedAt)
    && fetchedAt > 0 && fetchedAt <= now && now - fetchedAt < 600_000
    && Array.isArray(sources) && sources.every((source) =>
      source !== null && typeof source === 'object' && !Array.isArray(source)
      && typeof source.data === 'string' && allowedUrl(source.data)
      && source.origin === 'supplement' && source.type === 'iframe' && source.default === false
      && source.name === '' && source.substreamName === '' && typeof source.live === 'boolean'
      && (source.sourceTag === undefined || typeof source.sourceTag === 'string'),
    )
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
