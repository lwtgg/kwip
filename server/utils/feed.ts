import type { H3Event } from 'h3'
import { containsHostToken, createSnapshotReader, type SnapshotBucket } from './snapshot.ts'
import { feedDetailPath, validFeedPath } from './feed-path.ts'

interface FeedAssets {
  fetch(request: Request): Promise<Response>
}

type CloudflareEnv = Record<string, unknown> & { ASSETS?: FeedAssets }

function getCloudflareEnv(event?: H3Event): CloudflareEnv | undefined {
  return event?.context.cloudflare?.env ?? (globalThis as typeof globalThis & { __env__?: CloudflareEnv }).__env__
}

export function getFeedAssets(event?: H3Event): FeedAssets | undefined {
  return getCloudflareEnv(event)?.ASSETS
}

export class FeedResponseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FeedResponseError'
  }
}

export type FeedEndpoint =
  | { kind: 'ping' }
  | { kind: 'streams' }
  | { kind: 'stream'; uriName: string }
  | { kind: 'vods' }
  | { kind: 'vod'; slug: string }

interface FeedConfig {
  feedBase: string
  feedMirrorBase: string
  canonicalHost: string
}

export interface FeedProvenance {
  fromCache?: true
  fromSnapshot?: true
  hasSnapshotReplay?: true
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

function resolveEndpointUrl(base: string, requestUrl: URL, endpoint: FeedEndpoint): string {
  return new URL(buildEndpointUrl(base.replace(/\/+$/, ''), endpoint), requestUrl.origin).href
}

export function isCrossOriginFeed(base: string, requestUrl: URL, endpoint: FeedEndpoint): boolean {
  return new URL(resolveEndpointUrl(base || '/fixtures', requestUrl, endpoint)).origin !== requestUrl.origin
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
    const out: Record<string, unknown> = Object.create(null)
    for (const [k, v] of Object.entries(value)) {
      out[k] = replaceHostTokens(v, host)
    }
    return out as T
  }
  return value
}

// Keep sequential attempts well inside the edge timeout, with time reserved
// for seed reads and SSR after the upstream or R2 budgets are exhausted.
export const FEED_DEADLINES_MS = {
  upstream: 1_500,
  identity: 300,
  cacheMatch: 250,
  snapshot: 1_000,
  seed: 500,
} as const

type FeedStage = 'primary' | 'mirror' | 'identity' | 'snapshot' | 'seed' | 'cache-match'

class FeedTimeoutError extends Error {
  readonly stage: FeedStage

  constructor(stage: FeedStage) {
    super(`Feed deadline exceeded at ${stage}`)
    this.name = 'FeedTimeoutError'
    this.stage = stage
  }
}

export async function withinFeedDeadline<T>(
  endpoint: FeedEndpoint['kind'] | 'page' | 'sitemap',
  stage: FeedStage,
  duration: number,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const start = Date.now()
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new FeedTimeoutError(stage)
      console.warn(JSON.stringify({ event: 'feed_timeout', endpoint, stage, elapsedMs: Date.now() - start }))
      reject(error)
      controller.abort(error)
    }, duration)
  })
  try {
    // The race also bounds clients and R2 reads that cannot honor the signal.
    return await Promise.race([deadline, run(controller.signal)])
  } finally {
    clearTimeout(timer)
  }
}

async function fetchFromBase<T extends { success: boolean }>(
  fetcher: typeof $fetch,
  url: string,
  requestUrl: URL,
  host: string,
  endpoint: FeedEndpoint['kind'],
  stage: 'primary' | 'mirror' | 'seed',
  assets?: FeedAssets,
  onRequestError?: () => void,
): Promise<T> {
  const duration = stage === 'seed' ? FEED_DEADLINES_MS.seed : FEED_DEADLINES_MS.upstream
  const payload = await withinFeedDeadline(endpoint, stage, duration, async (signal) => {
    let payload: unknown
    if (assets && URL.canParse(url) && new URL(url).origin === requestUrl.origin) {
      const request = new Request(url, { signal })
      let response: Response
      try {
        response = await assets.fetch(request)
      } catch (error) {
        onRequestError?.()
        throw error
      }
      if (!response.ok) {
        throw new FeedResponseError(`Feed request failed with HTTP ${response.status}`)
      }
      payload = await response.json()
    } else {
      payload = await fetcher(url, { responseType: 'json', retry: 0, signal, onRequestError })
    }
    return payload
  })

  if (!payload || typeof payload !== 'object' || !('success' in payload) || payload.success !== true) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : 'Feed did not return a successful response'
    throw new FeedResponseError(message)
  }

  return host && containsHostToken(payload) ? replaceHostTokens(payload as T, host) : payload as T
}

export function fetchBrowserFeed<T extends { success: boolean }>(
  fetcher: typeof $fetch,
  config: FeedConfig,
  requestUrl: URL,
  endpoint: FeedEndpoint,
): Promise<T> {
  const url = resolveEndpointUrl(config.feedBase, requestUrl, endpoint)
  return fetchFromBase<T>(fetcher, url, requestUrl, requestUrl.host || config.canonicalHost, endpoint.kind, 'primary')
}

export async function fetchFeedSnapshot<T extends { success: boolean }>(
  fetcher: typeof $fetch,
  requestUrl: URL,
  endpoint: FeedEndpoint,
  host: string,
  assets?: FeedAssets,
  onRequestError?: () => void,
): Promise<T & FeedProvenance> {
  const url = resolveEndpointUrl('/feed-cache', requestUrl, endpoint)
  const cached = await fetchFromBase<T>(fetcher, `${url}.json`, requestUrl, host, endpoint.kind, 'seed', assets, onRequestError)
  return { ...cached, fromCache: true }
}

interface FeedSnapshotFallback {
  event: H3Event | undefined
  binding: string
  generation?: 'unreadable' | 'omitted'
  onCoverage?: (hasDetail: (path: string) => boolean) => void
}

export async function fetchFeed<T extends { success: boolean }>(
  fetcher: typeof $fetch,
  config: FeedConfig,
  requestUrl: URL,
  endpoint: FeedEndpoint,
  assets?: FeedAssets,
  snapshotFallback?: FeedSnapshotFallback,
): Promise<T & FeedProvenance> {
  const host = requestUrl.host || config.canonicalHost
  const resolveUrl = (base: string) => resolveEndpointUrl(base, requestUrl, endpoint)
  const primaryUrl = resolveUrl(config.feedBase || '/fixtures')
  const mirrorUrl = config.feedMirrorBase ? resolveUrl(config.feedMirrorBase) : null
  let networkFailure = false
  try {
    return await fetchFromBase<T>(fetcher, primaryUrl, requestUrl, host, endpoint.kind, 'primary', assets, () => {
      networkFailure = true
    })
  } catch (err) {
    let upstreamError = err
    if ((networkFailure || err instanceof FeedTimeoutError) && mirrorUrl && mirrorUrl !== primaryUrl) {
      try {
        return await fetchFromBase<T>(fetcher, mirrorUrl, requestUrl, host, endpoint.kind, 'mirror', assets)
      } catch (error) {
        upstreamError = error
      }
    }
    if (!URL.canParse(config.feedBase) || endpoint.kind === 'ping' || snapshotFallback?.generation === 'omitted') {
      throw upstreamError
    }
    const doubleTimeout = err instanceof FeedTimeoutError &&
      upstreamError instanceof FeedTimeoutError && upstreamError.stage === 'mirror'
    if (snapshotFallback?.event && snapshotFallback.generation === 'unreadable') {
      const generation = await getRetryFeedGeneration(snapshotFallback.event, snapshotFallback.binding, requestUrl, host)
      if (generation?.readable) {
        const entry = generation.get<T>(endpoint)
        if (!entry) throw new FeedResponseError('Feed endpoint unavailable in snapshot')
        snapshotFallback.onCoverage?.(generation.hasDetail)
        return entry
      }
    } else if (snapshotFallback?.event && doubleTimeout) {
      const pinned = getRequestReader(snapshotFallback.event, snapshotFallback.binding, requestUrl, retryReader)
      if (pinned) {
        const path = snapshotPath(endpoint)
        const paths = endpoint.kind === 'stream' ? ['streams', path] :
          endpoint.kind === 'vod' ? ['vods', path] : [path]
        const manifest = await pinned.reader.open().catch(() => undefined)
        if (manifest) {
          if (!manifest.ranges.has(path)) throw new FeedResponseError('Feed endpoint unavailable in snapshot')
          const snapshot = await withinFeedDeadline(endpoint.kind, 'snapshot', FEED_DEADLINES_MS.snapshot, () => pinned.reader.read(paths))
            .catch(() => undefined)
          if (snapshot) {
            const entry = snapshot.payloads.get(path)
            if (!entry) throw new FeedResponseError('Feed endpoint unavailable in snapshot')
            snapshotFallback.onCoverage?.(snapshot.has)
            return normalizeSnapshotPayload(path, entry, host) as T & FeedProvenance
          }
        }
      }
    }
    let cacheUnreachable = false
    try {
      return await fetchFeedSnapshot<T>(fetcher, requestUrl, endpoint, host, assets, () => {
        cacheUnreachable = true
      })
    } catch (cacheError) {
      const cacheMissing = cacheError instanceof Error && 'statusCode' in cacheError && cacheError.statusCode === 404
      if (!assets && (cacheMissing || cacheUnreachable || cacheError instanceof FeedTimeoutError)) throw upstreamError
      throw cacheError
    }
  }
}

export function isExternalFeed(base: string): boolean {
  const url = URL.parse(base)
  return !!url && (url.protocol === 'http:' || url.protocol === 'https:') &&
    !url.pathname.replace(/\/+$/, '').endsWith('/fixtures')
}

function snapshotPath(endpoint: FeedEndpoint): string {
  return decodeURIComponent(buildEndpointUrl('', endpoint).slice(1))
}

function pageRequirements(requestUrl: URL): FeedEndpoint[] {
  // The default layout also needs streams for its category navigation.
  const endpoints: FeedEndpoint[] = [{ kind: 'streams' }]
  const path = requestUrl.pathname.replace(/\/+$/, '')
  const route = path.split('/')[1]?.toLowerCase()
  try {
    if (route === 'live') {
      const uriName = decodeURIComponent(path.slice('/live/'.length))
      if (validFeedPath('streams', uriName)) endpoints.push({ kind: 'stream', uriName })
    } else if (route === 'sitemap.xml') {
      endpoints.push({ kind: 'vods' })
    } else if (route === 'vods') {
      endpoints.push({ kind: 'vods' })
      const slug = decodeURIComponent(path.slice('/vods/'.length))
      if (validFeedPath('vods', slug)) endpoints.push({ kind: 'vod', slug })
    }
  } catch {
    // Malformed route encoding cannot select a detail from either generation.
  }
  return endpoints
}

type StreamCategory = {
  category: string
  always_live?: number
  streams: { uri_name: string; always_live?: number; starts_at?: number | string; ends_at?: number | string }[]
}

function listingBoundary(payload: SnapshotPayload | undefined, url: URL, now: number) {
  const path = url.pathname.replace(/\/+$/, '')
  const home = path === ''
  const categoryPath = /^\/c\/([^/]+)$/i.exec(path)
  if (!home && !categoryPath) return Infinity

  const categories = payload?.streams as StreamCategory[] | undefined
  if (!categories) return Infinity
  let selected = categories
  if (categoryPath) {
    const slugify = (name: string) => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    let slug: string
    try {
      slug = slugify(decodeURIComponent(categoryPath[1]!))
    } catch {
      slug = slugify(categoryPath[1]!)
    }
    const category = categories.find(candidate => slugify(candidate.category) === slug)
    if (!category) return Infinity
    selected = [category]
  }

  const filter = url.searchParams.get('filter')
  let boundary = Infinity
  for (const category of selected) {
    for (const stream of category.streams) {
      const alwaysLive = stream.always_live ?? category.always_live ?? 0
      if (alwaysLive === 1 || (home && alwaysLive !== 0 && (filter === 'live' || filter === 'upcoming'))) continue
      const start = Number(stream.starts_at)
      const end = Number(stream.ends_at)
      if (start > now && (filter !== 'live' || end > start)) boundary = Math.min(boundary, start)
      if (end > now && filter !== 'upcoming' &&
          (filter !== 'live' || start <= now)) boundary = Math.min(boundary, end)
    }
  }
  return boundary
}

function liveDetailWindow(payloads: Map<string, SnapshotPayload>, streamPath: string) {
  const stream = payloads.get(streamPath)?.data as {
    always_live?: number
    starts_at?: number | string
    start_timestamp?: number | string
    ends_at?: number | string
    end_timestamp?: number | string
  } | undefined
  if (!stream) return

  let alwaysLive = stream.always_live
  if (alwaysLive == null) {
    const uri = streamPath.slice('streams/'.length)
    const categories = payloads.get('streams')?.streams as StreamCategory[] | undefined
    for (const category of categories ?? []) {
      const item = category.streams.find(item => item.uri_name === uri)
      if (!item) continue
      alwaysLive = item.always_live ?? category.always_live
      break
    }
  }

  return {
    alwaysLive,
    start: Number(stream.starts_at ?? stream.start_timestamp),
    end: Number(stream.ends_at ?? stream.end_timestamp),
  }
}

function endedReplayPath(window: ReturnType<typeof liveDetailWindow>, streamPath: string, now: number) {
  if (window?.alwaysLive === 0 && window.end > 0 && now >= window.end) {
    return feedDetailPath('vods', streamPath.slice('streams/'.length))
  }
}

function listsReplay(payload: SnapshotPayload | undefined, path: string): boolean {
  const categories = payload?.vods as { vods: { uri_name: string }[] }[] | undefined
  return categories?.some(category => category.vods.some(vod => feedDetailPath('vods', vod.uri_name) === path)) ?? false
}

type SnapshotPayload = Record<string, unknown> & { success: true } & FeedProvenance

function createRequestSnapshotReader(bucket: SnapshotBucket, endpoint: FeedEndpoint['kind']) {
  const reader = createSnapshotReader(bucket)
  let identity: ReturnType<typeof reader.open> | undefined
  return {
    open: () => identity ??= withinFeedDeadline(endpoint, 'identity', FEED_DEADLINES_MS.identity, reader.open),
    read: reader.read,
  }
}

function normalizeSnapshotPayload(
  path: string,
  { payload, hasHostToken }: { payload: SnapshotPayload; hasHostToken: boolean },
  host: string,
): SnapshotPayload {
  const resolved = hasHostToken ? replaceHostTokens(payload, host) : payload
  const slash = path.indexOf('/')
  const normalized = slash !== -1
    ? { ...resolved, data: { ...resolved.data as object, uri_name: path.slice(slash + 1) } }
    : resolved
  return { ...normalized, fromCache: true, fromSnapshot: true }
}

export async function readFeedGeneration(
  bucket: SnapshotBucket,
  requestUrl: URL,
  host: string,
  endpoints: FeedEndpoint[],
  now = Math.floor(Date.now() / 1000),
  reader = createRequestSnapshotReader(bucket, endpoints.at(-1)?.kind ?? 'streams'),
) {
  const paths = endpoints.map(snapshotPath)
  const streamPath = paths.find(path => path.startsWith('streams/'))
  const payloads = new Map<string, SnapshotPayload>()
  let window: ReturnType<typeof liveDetailWindow>
  let hasDetail: (path: string) => boolean = () => false
  let identity: string | undefined
  try {
    identity = (await reader.open()).commitId
    await withinFeedDeadline(endpoints.at(-1)?.kind ?? 'streams', 'snapshot', FEED_DEADLINES_MS.snapshot, async (signal) => {
      const snapshot = await reader.read(paths)
      signal.throwIfAborted()
      for (const [path, entry] of snapshot.payloads) {
        payloads.set(path, normalizeSnapshotPayload(path, entry, host))
      }
      window = streamPath ? liveDetailWindow(payloads, streamPath) : undefined
      const replayPath = streamPath ? endedReplayPath(window, streamPath, now) : undefined
      if (streamPath && replayPath && snapshot.has(replayPath)) {
        const vods = (await reader.read(['vods'])).payloads.get('vods')?.payload
        signal.throwIfAborted()
        if (listsReplay(vods, replayPath)) payloads.get(streamPath)!.hasSnapshotReplay = true
      }
      hasDetail = snapshot.has
    })
  } catch {
    // Return an unusable batch so the request can try the live upstream.
    identity = undefined
    payloads.clear()
    window = undefined
  }
  // Compare against the same clock SSR used, even if rendering crosses a boundary.
  const cacheBoundary = window && window.alwaysLive !== 1
    ? Math.min(window.start > now ? window.start : Infinity, window.end > now ? window.end : Infinity)
    : listingBoundary(payloads.get('streams'), requestUrl, now)
  return {
    readable: identity !== undefined,
    cacheBoundary,
    cacheIdentity: paths.every(path => payloads.has(path)) ? identity : undefined,
    get<T extends { success: boolean }>(endpoint: FeedEndpoint) {
      return payloads.get(snapshotPath(endpoint)) as (T & FeedProvenance) | undefined
    },
    hasDetail,
  }
}

// Nitro and the Nuxt SSR bundle each compile this module.
const requestGeneration = Symbol.for('kwip.feedGeneration')
const requestReader = Symbol.for('kwip.snapshotReader')
const requestRetryGeneration = Symbol.for('kwip.feedRetryGeneration')
const retryReader = Symbol.for('kwip.snapshotRetryReader')

type FeedContext = H3Event['context'] & {
  [requestGeneration]?: ReturnType<typeof readFeedGeneration>
  [requestRetryGeneration]?: ReturnType<typeof readFeedGeneration>
  [requestReader]?: { bucket: SnapshotBucket; reader: ReturnType<typeof createRequestSnapshotReader> }
  [retryReader]?: FeedContext[typeof requestReader]
}

function getRequestReader(event: H3Event, binding: string, requestUrl: URL, slot: typeof requestReader | typeof retryReader = requestReader) {
  const context: FeedContext = event.context
  if (context[slot]) return context[slot]
  const candidate = getCloudflareEnv(event)?.[binding] as Partial<SnapshotBucket> | undefined
  if (typeof candidate?.get !== 'function') return
  const bucket = candidate as SnapshotBucket
  return context[slot] = { bucket, reader: createRequestSnapshotReader(bucket, pageRequirements(requestUrl).at(-1)!.kind) }
}

function getRetryFeedGeneration(event: H3Event, binding: string, requestUrl: URL, host: string) {
  const pinned = getRequestReader(event, binding, requestUrl, retryReader)
  if (!pinned) return
  const context: FeedContext = event.context
  // Revalidate the whole page batch before any consumer uses a fresh R2 payload.
  return context[requestRetryGeneration] ??= readFeedGeneration(
    pinned.bucket, requestUrl, host, pageRequirements(requestUrl), undefined, pinned.reader,
  )
}

export async function getFeedCacheIdentity(event: H3Event, binding: string, config: FeedConfig, requestUrl: URL) {
  if (!isExternalFeed(config.feedBase)) return
  const pinned = getRequestReader(event, binding, requestUrl)
  if (!pinned) return
  try {
    return (await pinned.reader.open()).commitId
  } catch {
    // A failed identity read may still render live upstream data.
    return
  }
}

export function getRenderedFeedGeneration(event: H3Event) {
  const context: FeedContext = event.context
  return context[requestGeneration]
}

export function getFeedGeneration(
  event: H3Event | undefined,
  binding: string,
  config: FeedConfig,
  requestUrl: URL,
  endpoints?: FeedEndpoint[],
  now?: number,
) {
  if (!event || !isExternalFeed(config.feedBase)) return
  const pinned = getRequestReader(event, binding, requestUrl)
  if (!pinned) return

  const context: FeedContext = event.context
  return context[requestGeneration] ??= readFeedGeneration(
    pinned.bucket, requestUrl, requestUrl.host || config.canonicalHost,
    endpoints ?? pageRequirements(requestUrl), now, pinned.reader,
  )
}
