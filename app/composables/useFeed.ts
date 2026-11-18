import { toValue, type MaybeRefOrGetter } from 'vue'
import {
  fetchBrowserFeed,
  fetchFeed,
  getFeedAssets,
  isCrossOriginFeed,
  type FeedEndpoint,
  type FeedProvenance,
} from '../../server/utils/feed'

export { FeedResponseError } from '../../server/utils/feed'

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

const FEED_CACHE_WINDOW_MS = 60_000

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
  const event = import.meta.server ? useRequestEvent() : undefined
  const cacheKey = useSixtySecondCacheKey(keyPrefix)
  const browserRefresh = import.meta.client
    && isCrossOriginFeed(config.public.feedBase, requestUrl, resolveEndpoint())
  const retries = browserRefresh
    ? useState<Record<string, 'pending' | 'done'>>('feed-browser-retries', () => ({}))
    : undefined

  const feed = useAsyncData<T & FeedProvenance>(
    cacheKey,
    async () => {
      if (browserRefresh) {
        const cached = retries?.value[cacheKey.value] === 'pending' ? feed.data.value : undefined
        try {
          return await fetchBrowserFeed<T>(fetcher, config.public, requestUrl, resolveEndpoint())
        } catch (error) {
          if (cached?.fromCache) return cached
          throw error
        }
      }
      const assets = import.meta.server ? getFeedAssets(event) : undefined
      return fetchFeed<T>(fetcher, config.public, requestUrl, resolveEndpoint(), assets)
    },
    {
      server: true,
      getCachedData(key, nuxtApp, { cause }) {
        if (cause === 'initial') {
          return nuxtApp.payload.data[key] ?? nuxtApp.static.data[key]
        }
      },
    },
  )

  if (!retries) return feed

  onMounted(async () => {
    const key = cacheKey.value
    if (retries.value[key] || (!feed.error.value && !feed.data.value?.fromCache)) return

    retries.value[key] = 'pending'
    try {
      await feed.refresh({ dedupe: 'defer' })
    } finally {
      retries.value[key] = 'done'
    }
  })

  const { pending, status, error, refresh, execute, clear } = feed
  const data = computed({
    get: () => retries.value[cacheKey.value] === 'pending' ? undefined : feed.data.value,
    set: (value) => { feed.data.value = value },
  })
  const result = { data, pending, status, error, refresh, execute, clear }
  return Object.assign(feed.then(() => result), result)
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
