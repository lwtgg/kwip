import type { H3Event } from 'h3'
import { compactSnapshotPayload, containsHostToken, createSnapshotReader, type SnapshotBucket } from './snapshot.ts'
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
  snapshot: 1_000,
  seed: 500,
} as const

type FeedStage = 'primary' | 'mirror' | 'identity' | 'snapshot' | 'seed'

class FeedTimeoutError extends Error {
  constructor(stage: FeedStage) {
    super(`Feed deadline exceeded at ${stage}`)
    this.name = 'FeedTimeoutError'
  }
}

async function withinFeedDeadline<T>(
  endpoint: FeedEndpoint['kind'],
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

export async function fetchFeed<T extends { success: boolean }>(
  fetcher: typeof $fetch,
  config: FeedConfig,
  requestUrl: URL,
  endpoint: FeedEndpoint,
  assets?: FeedAssets,
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
    if (!URL.canParse(config.feedBase) || endpoint.kind === 'ping') {
      throw upstreamError
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

export async function readFeedGeneration(
  bucket: SnapshotBucket,
  fetcher: typeof $fetch,
  requestUrl: URL,
  host: string,
  endpoints: FeedEndpoint[],
  assets?: FeedAssets,
  seedDetails: readonly string[] = [],
  now = Math.floor(Date.now() / 1000),
  reader = createRequestSnapshotReader(bucket, endpoints.at(-1)?.kind ?? 'streams'),
) {
  const paths = endpoints.map(snapshotPath)
  const streamPath = paths.find(path => path.startsWith('streams/'))
  let payloads = new Map<string, SnapshotPayload>()
  let window: ReturnType<typeof liveDetailWindow>
  let hasDetail: (path: string) => boolean = () => false
  let identity: string | undefined
  try {
    identity = 'seed'
    identity = (await reader.open()).commitId
    await withinFeedDeadline(endpoints.at(-1)?.kind ?? 'streams', 'snapshot', FEED_DEADLINES_MS.snapshot, async (signal) => {
      const snapshot = await reader.read(paths)
      signal.throwIfAborted()
      for (const [path, { payload, hasHostToken }] of snapshot.payloads) {
        const resolved = hasHostToken ? replaceHostTokens(payload, host) : payload
        const slash = path.indexOf('/')
        const normalized = slash !== -1
          ? { ...resolved, data: { ...resolved.data as object, uri_name: path.slice(slash + 1) } }
          : resolved
        payloads.set(path, { ...normalized, fromCache: true, fromSnapshot: true })
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
    // A failed payload read can recover while this manifest remains current.
    if (identity !== 'seed') identity = undefined
    payloads.clear()
    window = undefined
    // Wait for the complete seed batch before making any payload visible to SSR.
    try {
      const seed = await Promise.all(endpoints.map(endpoint =>
        fetchFeedSnapshot<{ success: true }>(fetcher, requestUrl, endpoint, host, assets),
      ))
      const seedPayloads = new Map<string, SnapshotPayload>(paths.map((path, index) => [
        path, { ...compactSnapshotPayload(path, seed[index]), fromCache: true, fromSnapshot: true },
      ]))
      const coverage = new Set(seedDetails)
      window = streamPath ? liveDetailWindow(seedPayloads, streamPath) : undefined
      const replayPath = streamPath ? endedReplayPath(window, streamPath, now) : undefined
      if (streamPath && replayPath && coverage.has(replayPath)) {
        const vods = await fetchFeedSnapshot<SnapshotPayload>(fetcher, requestUrl, { kind: 'vods' }, host, assets)
        if (listsReplay(compactSnapshotPayload('vods', vods), replayPath)) {
          seedPayloads.get(streamPath)!.hasSnapshotReplay = true
        }
      }
      payloads = seedPayloads
      hasDetail = path => coverage.has(path)
    } catch {
      // SSR can mount with unavailable data and let the browser try the provider.
    }
  }
  // Compare against the same clock SSR used, even if rendering crosses a boundary.
  const cacheBoundary = window && window.alwaysLive !== 1
    ? Math.min(window.start > now ? window.start : Infinity, window.end > now ? window.end : Infinity)
    : listingBoundary(payloads.get('streams'), requestUrl, now)
  return {
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

type FeedContext = H3Event['context'] & {
  [requestGeneration]?: ReturnType<typeof readFeedGeneration>
  [requestReader]?: { bucket: SnapshotBucket; reader: ReturnType<typeof createRequestSnapshotReader> }
}

function getRequestReader(event: H3Event, binding: string, config: FeedConfig, requestUrl: URL) {
  if (!isExternalFeed(config.feedBase)) return
  const context: FeedContext = event.context
  if (context[requestReader]) return context[requestReader]
  const candidate = getCloudflareEnv(event)?.[binding] as Partial<SnapshotBucket> | undefined
  if (typeof candidate?.get !== 'function') return
  const bucket = candidate as SnapshotBucket
  return context[requestReader] = { bucket, reader: createRequestSnapshotReader(bucket, pageRequirements(requestUrl).at(-1)!.kind) }
}

export async function getFeedCacheIdentity(event: H3Event, binding: string, config: FeedConfig, requestUrl: URL) {
  const pinned = getRequestReader(event, binding, config, requestUrl)
  if (!pinned) return
  try {
    return (await pinned.reader.open()).commitId
  } catch {
    return 'seed'
  }
}

export function getRenderedFeedGeneration(event: H3Event) {
  const context: FeedContext = event.context
  return context[requestGeneration]
}

export function getFeedGeneration(
  event: H3Event | undefined,
  binding: string,
  fetcher: typeof $fetch,
  config: FeedConfig,
  requestUrl: URL,
  endpoints?: FeedEndpoint[],
  seedDetails?: readonly string[],
  now?: number,
) {
  if (!event) return
  const pinned = getRequestReader(event, binding, config, requestUrl)
  if (!pinned) return

  const context: FeedContext = event.context
  return context[requestGeneration] ??= readFeedGeneration(
    pinned.bucket, fetcher, requestUrl, requestUrl.host || config.canonicalHost,
    endpoints ?? pageRequirements(requestUrl), getFeedAssets(event), seedDetails, now, pinned.reader,
  )
}
