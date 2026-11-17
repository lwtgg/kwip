// Feed client. Shapes are API.md verbatim; the feed is fetched here only (CONTRACT.md).

export interface Substream {
  id: number
  name: string
  uri_name: string
  iframe: string
}

export interface StreamItem {
  id: number
  name: string
  tag: string
  source_tag: string
  poster: string
  blurhash: string
  colors: string[]
  uri_name: string
  starts_at: number
  ends_at: number
  always_live: number
  locale: string
  category_name: string
  iframe: string
  substreams: Substream[]
  viewers: string
}

export interface StreamCategory {
  category: string
  id: number
  always_live: number
  streams: StreamItem[]
}

export interface PlayerSource {
  name: string
  default: boolean
  type: 'iframe' | 'link'
  data: string
}

export interface StreamDetail extends Omit<StreamItem, 'source_tag' | 'iframe' | 'substreams' | 'always_live'> {
  source_tag?: string
  iframe?: string
  substreams?: Substream[]
  always_live?: number
  m3u8: string
  source_type: string
  sources: PlayerSource[]
  category: number
  auth: boolean
  vip_stream: boolean
  uuid: string
  token: string
}

export interface VodItem {
  id: number
  name: string
  tag: string
  poster: string
  uri_name: string
  added: number
  event_date: number
  views: number | string
}

export interface VodCategory {
  category: string
  id: number
  vods: VodItem[]
}

export interface VodDetail extends VodItem {
  source: { type: string; data: string }
  recommended_vods: VodItem[]
}

interface Envelope { success: boolean; error?: string }
export interface PingResponse extends Envelope { domains: string[]; status: unknown[] }
export interface StreamsResponse extends Envelope { timestamp: number; performance: number; streams: StreamCategory[] }
export interface StreamResponse extends Envelope { data: StreamDetail }
export interface VodsResponse extends Envelope { vods: VodCategory[] }
export interface VodResponse extends Envelope { data: VodDetail }

export class FeedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FeedError'
  }
}

const CACHE_SECONDS = 60

/** Network error = no HTTP response at all. HTTP errors and success:false never fall back. */
function isNetworkError(err: unknown): boolean {
  const e = err as { response?: unknown; statusCode?: number } | null
  return !!e && e.response === undefined && e.statusCode === undefined
}

/** Fixture base serves static files, so `/streams/{uri}` maps to `stream.json`. */
function resolvePath(base: string, path: string): string {
  if (!base.startsWith('/fixtures')) return `${base}${path}`
  if (path === '/streams' || path === '/ping' || path === '/vods') return `${base}${path === '/streams' ? '/streams.json' : `${path}.json`}`
  if (path.startsWith('/streams/')) return `${base}/stream.json`
  if (path.startsWith('/vods/')) return `${base}/vod.json`
  return `${base}${path}.json`
}

export async function feedFetch<T extends Envelope>(path: string): Promise<T> {
  const { feedBase, feedMirrorBase } = useRuntimeConfig().public
  let res: T
  try {
    res = await $fetch<T>(resolvePath(feedBase, path))
  } catch (err) {
    if (!isNetworkError(err) || !feedMirrorBase || feedMirrorBase === feedBase) throw err
    res = await $fetch<T>(resolvePath(feedMirrorBase, path))
  }
  if (!res.success) throw new FeedError(res.error || 'Feed returned success: false')
  return res
}

/** Key is bucketed to 60s so SSR and client share a payload and refetches respect API.md's poll limit. */
function feedKey(path: string): string {
  return `feed:${path}:${Math.floor(Date.now() / 1000 / CACHE_SECONDS)}`
}

function useFeedData<T extends Envelope>(path: string) {
  return useAsyncData<T>(feedKey(path), () => feedFetch<T>(path), { server: true })
}

export function useFeed() {
  return {
    ping: () => useFeedData<PingResponse>('/ping'),
    streams: () => useFeedData<StreamsResponse>('/streams'),
    stream: (uriName: string) => useFeedData<StreamResponse>(`/streams/${uriName}`),
    vods: () => useFeedData<VodsResponse>('/vods'),
    vod: (slug: string) => useFeedData<VodResponse>(`/vods/${slug}`),
  }
}
