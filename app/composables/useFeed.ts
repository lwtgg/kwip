import { toValue, type MaybeRefOrGetter } from 'vue'
import {
  fetchBrowserFeed,
  fetchFeed,
  fetchFeedSnapshot,
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
  const nuxtApp = useNuxtApp()
  const config = useRuntimeConfig()
  const fetcher = useRequestFetch()
  const requestUrl = useRequestURL()
  const event = import.meta.server ? useRequestEvent() : undefined
  const cacheKey = useSixtySecondCacheKey(keyPrefix)
  const browserRefresh = import.meta.client
    && isCrossOriginFeed(config.public.feedBase, requestUrl, resolveEndpoint())
  const feed = useAsyncData<T & FeedProvenance>(
    cacheKey,
    async (_app, { signal }) => {
      const endpoint = resolveEndpoint()
      const key = cacheKey.value
      const previous = import.meta.client
        ? nuxtApp.payload.data[key] as (T & FeedProvenance) | undefined
        : undefined
      try {
        if (browserRefresh) {
          return await fetchBrowserFeed<T>(fetcher, config.public, requestUrl, endpoint)
        }
        const assets = import.meta.server ? getFeedAssets(event) : undefined
        return await fetchFeed<T>(fetcher, config.public, requestUrl, endpoint, assets)
      } catch (error) {
        if (signal.aborted || key !== cacheKey.value) throw error
        if (previous) return { ...previous, fromCache: true }
        if (browserRefresh && endpoint.kind !== 'ping') {
          return fetchFeedSnapshot<T>(fetcher, requestUrl, endpoint, requestUrl.host).catch(() => {
            throw error
          })
        }
        throw error
      }
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

  if (browserRefresh) {
    onMounted(() => {
      if (!nuxtApp.isHydrating) return
      if (!feed.data.value?.fromCache) return
      // Paint the hydrated snapshot first; replacing data mid-hydration reads as a DOM mismatch.
      if (nuxtApp.isHydrating) {
        nuxtApp.hooks.hookOnce('app:mounted', () => { void feed.refresh({ dedupe: 'defer' }) })
      }
    })
  }

  return feed
}

export function usePing() {
  return useFeedEndpoint<FeedPingResponse>('feed:ping', () => ({ kind: 'ping' }))
}

export function useStreams() {
  return useFeedEndpoint<FeedStreamsResponse>('feed:streams', () => ({ kind: 'streams' }))
}

type RawStreamDetail = Omit<FeedStreamDetail,
  'uri_name' | 'starts_at' | 'ends_at' | 'viewers' | 'category_name' | 'colors' | 'blurhash' | 'substreams'
> & {
  uri_name?: string
  uri?: string
  starts_at?: number | string
  ends_at?: number | string
  start_timestamp?: number | string
  end_timestamp?: number | string
  viewers: number | string
  category_name?: string
  colors?: string[]
  blurhash?: string
  substreams?: (Pick<FeedSubstream, 'name'> & {
    iframe?: string
    source_tag?: string
    sources?: FeedStreamSource[]
  })[]
}

export function useStream(uriName: MaybeRefOrGetter<string>) {
  const list = useStreams()
  const feed = useFeedEndpoint<{ success: true; data: RawStreamDetail }>(
    () => `feed:stream:${toValue(uriName)}`,
    () => ({ kind: 'stream', uriName: toValue(uriName) }),
  )
  const isFixture = /(?:^|\/)fixtures\/?$/.test(useRuntimeConfig().public.feedBase)
  const matchingListItem = computed(() => {
    for (const category of list.data.value?.streams ?? []) {
      const item = category.streams.find((stream) => stream.uri_name === toValue(uriName))
      if (item) {
        return {
          ...item,
          always_live: item.always_live ?? category.always_live,
          category_name: item.category_name || category.category,
        }
      }
    }
  })

  const detail = computed<FeedStreamDetail | null>(() => {
    const raw = feed.data.value?.data
    if (!raw) return null
    const uri = raw.uri_name ?? raw.uri
    const matched = matchingListItem.value
    const fixtureItem = isFixture && uri !== toValue(uriName) ? matched : undefined
    if (uri !== toValue(uriName) && !fixtureItem) return null

    const substreams: RawStreamDetail['substreams'] = fixtureItem?.substreams?.length
      ? fixtureItem.substreams : raw.substreams
    const alternatives = (substreams ?? []).flatMap((substream) => {
      const name = [substream.name, substream.source_tag].filter(Boolean).join(' · ')
      if (substream.sources?.length) {
        return substream.sources.map((source) => ({ ...source, name, default: false }))
      }
      return substream.iframe
        ? [{ name, type: 'iframe' as const, data: substream.iframe, default: false }]
        : []
    })

    return {
      ...raw,
      ...fixtureItem,
      uri_name: toValue(uriName),
      starts_at: Number(fixtureItem?.starts_at ?? raw.starts_at ?? raw.start_timestamp),
      ends_at: Number(fixtureItem?.ends_at ?? raw.ends_at ?? raw.end_timestamp),
      viewers: String(fixtureItem?.viewers ?? raw.viewers ?? '0'),
      always_live: fixtureItem?.always_live ?? raw.always_live ?? matched?.always_live,
      category_name: fixtureItem?.category_name || raw.category_name || matched?.category_name || '',
      poster: fixtureItem?.poster || raw.poster,
      colors: fixtureItem?.colors?.length ? fixtureItem.colors : raw.colors ?? [],
      blurhash: fixtureItem?.blurhash || raw.blurhash || '',
      sources: [...(raw.sources ?? []), ...alternatives],
      substreams: undefined,
    }
  })
  return { feed, list, detail, matchingListItem }
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
