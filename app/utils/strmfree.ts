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
  stream_key?: string
  iframe?: string
  additional_sources?: { url: string }[]
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
const variantQualities = new Map([
  ['2160p', '4K'], ['4k', '4K'], ['1080p', 'FHD'], ['720p', 'HD'],
  ['540p', 'SD'], ['480p', 'SD'], ['360p', 'SD'],
])

export function sourceQualityBand(tag: unknown) {
  if (typeof tag !== 'string') return
  const label = /^(4k|uhd|fhd|hd|sd|\d{3,4}p)\b/i.exec(tag.trim())?.[1]?.toLowerCase()
  if (label) return variantQualities.get(label) ?? (label === 'uhd' ? '4K' : label.toUpperCase())
}

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

function findSupplement(
  event: Pick<FeedStreamDetail, 'name' | 'starts_at'>,
  categorySlug: string,
  payload: { streams: StrmfreeStream[] },
): StrmfreeStream | undefined {
  const pair = teams(event.name)
  if (pair.length !== 2 || !pair[0] || !pair[1]) return

  const candidates = payload.streams.filter((stream) => {
    if (!(Math.abs(stream.match_timestamp - event.starts_at) <= 3 * 3600)) return false
    const other = teams(stream.name)
    return other.length === 2 && other[0] === pair[0] && other[1] === pair[1]
  })
  const tied = candidates.length > 1
    ? candidates.filter(stream => categories.get(stream.category) === categorySlug)
    : candidates
  return tied.length === 1 ? tied[0] : undefined
}

function embedVariant(url: string, streamKey?: string) {
  const path = url.split(/[?#]/, 1)[0] ?? ''
  const id = path.replace(/\/+$/, '').split('/').pop() ?? ''
  const suffix = streamKey && id.startsWith(streamKey) ? id.slice(streamKey.length) : id
  const resolution = /(?<!\d)(2160p|4k|1080p|720p|540p|480p|360p)$/i.exec(suffix)?.[1]?.toLowerCase()
  // The embed uses the full ID for liveness, including any provider suffix.
  return { id, resolution }
}

function supplementSources(match: StrmfreeStream): SupplementSource[] {
  const sources = [
    ...(match.additional_sources ?? []),
    ...(match.iframe ? [{ url: match.iframe }] : []),
  ]
  function rank(quality?: string) {
    const index = quality === undefined ? -1 : qualities.indexOf(quality)
    return index === -1 ? qualities.length : index
  }

  return sources.filter(source => allowedUrl(source.url))
    .map(source => {
      const { resolution } = embedVariant(source.url, match.stream_key)
      const quality = variantQualities.get(resolution ?? '')
      return { ...source, quality }
    })
    .sort((a, b) => rank(a.quality) - rank(b.quality))
    .map(source => ({
      name: '',
      substreamName: '',
      sourceTag: source.quality,
      origin: 'supplement',
      live: false,
      default: false,
      type: 'iframe',
      data: source.url,
    }))
}

export function matchSupplement(
  event: Pick<FeedStreamDetail, 'name' | 'starts_at'>,
  categorySlug: string,
  payload: { streams: StrmfreeStream[] },
): SupplementSource[] | null {
  const match = findSupplement(event, categorySlug, payload)
  return match ? supplementSources(match) : null
}

export async function loadSupplementSources(
  event: Pick<FeedStreamDetail, 'name' | 'starts_at'>,
  categorySlug: string,
  payload: { streams: StrmfreeStream[] },
  fetchStatus?: (key: string) => Promise<Response>,
): Promise<SupplementSource[] | null> {
  if (!fetchStatus) return matchSupplement(event, categorySlug, payload)
  const match = findSupplement(event, categorySlug, payload)
  if (!match) return null
  const sources = supplementSources(match)
  if (!match.stream_key || !sources.length) return sources

  try {
    const response = await fetchStatus(match.stream_key)
    if (response.ok) {
      const payload = await response.json()
      if (Array.isArray(payload?.sources)) {
        const liveVariants = new Set<string>()
        for (const entry of payload.sources) {
          if (entry?.live !== true || typeof entry.url !== 'string') continue
          const { id } = embedVariant(entry.url)
          if (id) liveVariants.add(id)
        }
        return sources.map(source => ({
          ...source,
          live: liveVariants.has(embedVariant(source.data).id),
        }))
      }
    }
  } catch {
    // Keep the matched sources selectable if the status request fails.
  }
  return sources
}
