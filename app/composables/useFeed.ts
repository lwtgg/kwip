import { toValue, type MaybeRefOrGetter } from 'vue'

export interface FeedErrorPayload {
  success: false
  error: string
}

export interface FeedPingResponse {
  success: true
  domains: string[]
  status: unknown[]
}

export interface FeedSubstream {
  id: number
  name: string
  uri_name: string
  iframe: string
}

export interface FeedStreamItem {
  id: number
  name: string
  tag: string
  source_tag?: string
  poster?: string
  blurhash: string
  colors: string[]
  uri_name: string
  starts_at: number
  ends_at: number
  always_live?: number
  locale: string
  category_name: string
  iframe?: string
  substreams?: FeedSubstream[]
  viewers: string
}

export interface FeedStreamCategory {
  category: string
  id: number
  always_live: number
  streams: FeedStreamItem[]
}

export interface FeedStreamsResponse {
  success: true
  timestamp: number
  performance: number
  streams: FeedStreamCategory[]
}

export type FeedSourceKind = 'iframe' | 'link'

export interface FeedStreamSource {
  name: string
  default: boolean
  type: FeedSourceKind
  data: string
}

export interface FeedStreamDetail extends FeedStreamItem {
  m3u8: string
  source_type: string
  sources: FeedStreamSource[]
  category: number
  auth: boolean
  vip_stream: boolean
  uuid: string
  token: string
}

export interface FeedStreamDetailResponse {
  success: true
  data: FeedStreamDetail
}

export interface FeedVodItem {
  id: number
  name: string
  tag: string
  poster?: string
  blurhash?: string
  colors?: string[]
  uri_name: string
  added: number | string
  event_date: number | string
  views: string | number
}

export interface FeedVodCategory {
  category: string
  id: number
  vods: FeedVodItem[]
}

export interface FeedVodsResponse {
  success: true
  timestamp?: number
  performance?: number
  vods: FeedVodCategory[]
}

export interface FeedVodSource {
  type: 'playlist' | FeedSourceKind | string
  data: string
}

export interface FeedVodDetail extends FeedVodItem {
  source: FeedVodSource
  recommended_vods: FeedVodItem[]
}

export interface FeedVodDetailResponse {
  success: true
  data: FeedVodDetail
}

export class FeedResponseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FeedResponseError'
  }
}

const FEED_CACHE_WINDOW_MS = 60_000

type FeedEndpoint =
  | { kind: 'ping' }
  | { kind: 'streams' }
  | { kind: 'stream'; uriName: string }
  | { kind: 'vods' }
  | { kind: 'vod'; slug: string }

function resolveFeedBases(configuredBase: string, configuredMirrorBase: string): [string, string] {
  const primary = (configuredBase || '/fixtures').replace(/\/+$/, '')
  const mirror = (configuredMirrorBase || '').replace(/\/+$/, '') || primary
  return [primary, mirror]
}

function encodePathSegments(value: string): string {
  return value
    .replace(/^\/+/, '')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

function buildEndpointUrl(base: string, endpoint: FeedEndpoint): string {
  const isFixtureBase = base === '/fixtures' || base.endsWith('/fixtures')
  switch (endpoint.kind) {
    case 'ping':
      return isFixtureBase ? `${base}/ping.json` : `${base}/ping`
    case 'streams':
      return isFixtureBase ? `${base}/streams.json` : `${base}/streams`
    case 'stream':
      return isFixtureBase
        ? `${base}/stream.json`
        : `${base}/streams/${encodePathSegments(endpoint.uriName)}`
    case 'vods':
      return isFixtureBase ? `${base}/vods.json` : `${base}/vods`
    case 'vod':
      return isFixtureBase
        ? `${base}/vod.json`
        : `${base}/vods/${encodePathSegments(endpoint.slug)}`
  }
}

function isNetworkFailure(err: unknown): boolean {
  if (err instanceof FeedResponseError) {
    return false
  }
  if (err && typeof err === 'object' && 'response' in err && (err as { response?: unknown }).response) {
    return false
  }
  return true
}

function replaceHostTokens<T>(value: T, host: string): T {
  if (!host) return value
  if (typeof value === 'string') {
    return (value.includes('{host}') ? value.replaceAll('{host}', host) : value) as T
  }
  if (Array.isArray(value)) {
    return value.map((item) => replaceHostTokens(item, host)) as T
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = replaceHostTokens(v, host)
    }
    return out as T
  }
  return value
}

async function fetchFromBase<T extends { success: boolean }>(
  fetcher: typeof $fetch,
  url: string,
  host: string,
): Promise<T> {
  const payload = await fetcher<T | FeedErrorPayload>(url, {
    responseType: 'json',
  })

  if (!payload || typeof payload !== 'object' || payload.success === false) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : 'Feed returned success: false'
    throw new FeedResponseError(message)
  }

  return replaceHostTokens(payload as T, host)
}

async function fetchWithMirrorFallback<T extends { success: boolean }>(
  fetcher: typeof $fetch,
  primaryBase: string,
  mirrorBase: string,
  endpoint: FeedEndpoint,
  host: string,
): Promise<T> {
  const primaryUrl = buildEndpointUrl(primaryBase, endpoint)
  try {
    return await fetchFromBase<T>(fetcher, primaryUrl, host)
  } catch (err) {
    if (!isNetworkFailure(err)) {
      throw err
    }
    const mirrorUrl = buildEndpointUrl(mirrorBase, endpoint)
    return await fetchFromBase<T>(fetcher, mirrorUrl, host)
  }
}

function useSixtySecondCacheKey(prefix: MaybeRefOrGetter<string>) {
  const nuxtApp = useNuxtApp()
  const initialBucket = Math.floor(Date.now() / FEED_CACHE_WINDOW_MS)
  const bucket = useState<number>(`feed-cache-bucket:${toValue(prefix)}`, () => initialBucket)

  if (import.meta.client && !nuxtApp.isHydrating) {
    const nowBucket = Math.floor(Date.now() / FEED_CACHE_WINDOW_MS)
    if (nowBucket !== bucket.value) {
      bucket.value = nowBucket
    }
  }

  return computed(() => `${toValue(prefix)}:${bucket.value}`)
}

function useFeedEndpoint<T extends { success: boolean }>(
  keyPrefix: MaybeRefOrGetter<string>,
  resolveEndpoint: () => FeedEndpoint,
) {
  const config = useRuntimeConfig()
  const fetcher = useRequestFetch()
  const requestUrl = useRequestURL()
  const host = requestUrl.host || config.public.canonicalHost
  const [primaryBase, mirrorBase] = resolveFeedBases(config.public.feedBase, config.public.feedMirrorBase)
  const cacheKey = useSixtySecondCacheKey(keyPrefix)

  return useAsyncData<T>(
    cacheKey,
    () => fetchWithMirrorFallback<T>(fetcher, primaryBase, mirrorBase, resolveEndpoint(), host),
    {
      server: true,
      getCachedData(key, nuxtApp) {
        return nuxtApp.payload.data[key] ?? nuxtApp.static.data[key]
      },
    },
  )
}

export function usePing() {
  return useFeedEndpoint<FeedPingResponse>('feed:ping', () => ({ kind: 'ping' }))
}

export function useStreams() {
  return useFeedEndpoint<FeedStreamsResponse>('feed:streams', () => ({ kind: 'streams' }))
}

export function useStream(uriName: MaybeRefOrGetter<string>) {
  return useFeedEndpoint<FeedStreamDetailResponse>(
    () => `feed:stream:${toValue(uriName)}`,
    () => ({ kind: 'stream', uriName: toValue(uriName) }),
  )
}

export function useVods() {
  return useFeedEndpoint<FeedVodsResponse>('feed:vods', () => ({ kind: 'vods' }))
}

export function useVod(slug: MaybeRefOrGetter<string>) {
  return useFeedEndpoint<FeedVodDetailResponse>(
    () => `feed:vod:${toValue(slug)}`,
    () => ({ kind: 'vod', slug: toValue(slug) }),
  )
}

export function useFeed() {
  return {
    usePing,
    useStreams,
    useStream,
    useVods,
    useVod,
  }
}
