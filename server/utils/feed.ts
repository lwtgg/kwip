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
  detailGeneration?: string
  healthGeneration?: string
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
  fallbackUpstream: 1_000,
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
  duration: number = stage === 'seed' ? FEED_DEADLINES_MS.seed : FEED_DEADLINES_MS.upstream,
): Promise<T> {
  const payload = await withinFeedDeadline(endpoint, stage, duration, async (signal) => {
    let payload: unknown
    if (assets && URL.canParse(url) && new URL(url).origin === requestUrl.origin && !new URL(url).pathname.startsWith('/api/')) {
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
  upstreamOnly?: boolean
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
  // A fallback batch still needs time for the snapshot retry and seed before SSR.
  const upstreamBudget = isGenerationFeed(config.feedBase)
    ? FEED_DEADLINES_MS.identity + FEED_DEADLINES_MS.snapshot + 2 * FEED_DEADLINES_MS.upstream + FEED_DEADLINES_MS.seed + FEED_DEADLINES_MS.cacheMatch
    : snapshotFallback?.upstreamOnly ? FEED_DEADLINES_MS.fallbackUpstream : FEED_DEADLINES_MS.upstream
  let networkFailure = false
  try {
    return await fetchFromBase<T>(fetcher, primaryUrl, requestUrl, host, endpoint.kind, 'primary', assets, () => {
      networkFailure = true
    }, upstreamBudget)
  } catch (err) {
    // The same-origin route owns failover and authoritative omissions.
    if (isGenerationFeed(config.feedBase)) throw err
    let upstreamError = err
    if ((networkFailure || err instanceof FeedTimeoutError) && mirrorUrl && mirrorUrl !== primaryUrl) {
      try {
        return await fetchFromBase<T>(fetcher, mirrorUrl, requestUrl, host, endpoint.kind, 'mirror', assets, undefined, upstreamBudget)
      } catch (error) {
        upstreamError = error
      }
    }
    if (!URL.canParse(config.feedBase) || endpoint.kind === 'ping' || snapshotFallback?.upstreamOnly) {
      throw upstreamError
    }
    const doubleTimeout = err instanceof FeedTimeoutError &&
      upstreamError instanceof FeedTimeoutError && upstreamError.stage === 'mirror'
    if (snapshotFallback?.event && doubleTimeout) {
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

export function isGenerationFeed(base: string): boolean {
  return base.replace(/\/+$/, '') === '/api/feed'
}

export function isExternalFeed(base: string): boolean {
  if (isGenerationFeed(base)) return true
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

type StreamMatch = { match?: { state?: string } }

function scoreBoundary(stream: StreamMatch, now: number) {
  return stream.match?.state === 'in' ? now + 60 : Infinity
}

type StreamCategory = {
  category: string
  always_live?: number
  streams: (StreamMatch & { uri_name: string; always_live?: number; starts_at?: number | string; ends_at?: number | string })[]
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
      const start = Number(stream.starts_at)
      const end = Number(stream.ends_at)
      const showsScore = filter === 'live'
        ? (alwaysLive === 1 || ((!home || alwaysLive === 0) && start <= now && end > now))
        : filter !== 'upcoming' || ((home ? alwaysLive === 0 : alwaysLive !== 1) && start > now)
      if (showsScore) {
        boundary = Math.min(boundary, scoreBoundary(stream, now))
      }
      if (alwaysLive === 1 || (home && alwaysLive !== 0 && (filter === 'live' || filter === 'upcoming'))) continue
      if (start > now && (filter !== 'live' || end > start)) boundary = Math.min(boundary, start)
      if (end > now && filter !== 'upcoming' &&
          (filter !== 'live' || start <= now)) boundary = Math.min(boundary, end)
    }
  }
  return boundary
}

function liveDetailWindow(payloads: Map<string, SnapshotPayload>, streamPath: string, now: number) {
  const stream = payloads.get(streamPath)?.data as (StreamMatch & {
    always_live?: number
    starts_at?: number | string
    start_timestamp?: number | string
    ends_at?: number | string
    end_timestamp?: number | string
  }) | undefined
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
    scoreBoundary: scoreBoundary(stream, now),
    start: Number(stream.starts_at ?? stream.start_timestamp),
    end: Number(stream.ends_at ?? stream.end_timestamp),
  }
}

/**
 * A detail page renders a live score for every related card in its own category, so the page
 * deadline must also follow any live match there.
 */
function relatedScoreBoundary(payload: SnapshotPayload | undefined, streamPath: string, now: number) {
  const uri = streamPath.slice('streams/'.length)
  const categories = payload?.streams as StreamCategory[] | undefined
  const category = categories?.find(candidate => candidate.streams.some(stream => stream.uri_name === uri))
  let boundary = Infinity
  for (const stream of category?.streams ?? []) {
    if (stream.uri_name !== uri) boundary = Math.min(boundary, scoreBoundary(stream, now))
  }
  return boundary
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
    readHealth: reader.readHealth,
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
  let hasHealth = false
  try {
    const manifest = await reader.open()
    identity = manifest.commitId
    hasHealth = manifest.ranges.has('health.json')
    await withinFeedDeadline(endpoints.at(-1)?.kind ?? 'streams', 'snapshot', FEED_DEADLINES_MS.snapshot, async (signal) => {
      const snapshot = await reader.read(paths)
      signal.throwIfAborted()
      for (const [path, entry] of snapshot.payloads) {
        const payload = normalizeSnapshotPayload(path, entry, host)
        if (path === streamPath) {
          payload.detailGeneration = identity
          if (hasHealth) payload.healthGeneration = identity
        }
        payloads.set(path, payload)
      }
      window = streamPath ? liveDetailWindow(payloads, streamPath, now) : undefined
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
  const eventBoundary = window && window.alwaysLive !== 1
    ? Math.min(window.start > now ? window.start : Infinity, window.end > now ? window.end : Infinity)
    : listingBoundary(payloads.get('streams'), requestUrl, now)
  return {
    readable: identity !== undefined,
    cacheBoundary: Math.min(
      eventBoundary,
      window?.scoreBoundary ?? Infinity,
      streamPath ? relatedScoreBoundary(payloads.get('streams'), streamPath, now) : Infinity,
    ),
    cacheIdentity: paths.every(path => payloads.has(path)) ? identity : undefined,
    get<T extends { success: boolean }>(endpoint: FeedEndpoint) {
      return payloads.get(snapshotPath(endpoint)) as (T & FeedProvenance) | undefined
    },
    hasDetail,
  }
}

// Nitro and the Nuxt SSR bundle each compile this module.
const requestGeneration = Symbol.for('kwip.feedGeneration')
const resolvedGeneration = Symbol.for('kwip.resolvedFeedGeneration')
const requestReader = Symbol.for('kwip.snapshotReader')
const requestFallback = Symbol.for('kwip.feedFallback')
const retryReader = Symbol.for('kwip.snapshotRetryReader')

type FeedContext = H3Event['context'] & {
  [requestGeneration]?: ReturnType<typeof readFeedGeneration>
  [resolvedGeneration]?: Awaited<ReturnType<typeof readFeedGeneration>>
  [requestFallback]?: ReturnType<typeof readFeedFallback>
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

async function readFeedFallback(
  event: H3Event,
  binding: string,
  fetcher: typeof $fetch,
  config: FeedConfig,
  requestUrl: URL,
  endpoints: FeedEndpoint[],
  seedDetails: readonly string[],
  now: number,
) {
  const assets = getFeedAssets(event)
  const paths = endpoints.map(snapshotPath)
  const host = requestUrl.host || config.canonicalHost
  const batch = await Promise.allSettled(endpoints.map(endpoint =>
    fetchFeed<SnapshotPayload>(fetcher, isGenerationFeed(config.feedBase)
      ? { ...config, feedBase: 'https://api.ppv.st/api' } : config, requestUrl, endpoint, assets, { event, binding, upstreamOnly: true }),
  ))
  if (batch.every(result => result.status === 'fulfilled')) {
    const payloads = new Map(paths.map((path, index) => [path, batch[index]!.value]))
    return {
      hasDetail: (_path: string) => true,
      get<T extends { success: boolean }>(endpoint: FeedEndpoint) {
        return payloads.get(snapshotPath(endpoint)) as (T & FeedProvenance) | undefined
      },
    }
  }

  const pinned = getRequestReader(event, binding, requestUrl, retryReader)
  if (pinned) {
    const retry = await readFeedGeneration(pinned.bucket, requestUrl, host, endpoints, now, pinned.reader)
    if (retry.readable) return retry
  }

  // Once any required endpoint needs the seed, all consumers use this seed batch.
  const coverage = new Set(seedDetails)
  const payloads = new Map<string, SnapshotPayload>()
  try {
    const seedEndpoints = endpoints.filter(endpoint => {
      const path = snapshotPath(endpoint)
      return !path.includes('/') || coverage.has(path)
    })
    const seed = await Promise.all(seedEndpoints.map(async endpoint => {
      const path = snapshotPath(endpoint)
      const payload = await fetchFeedSnapshot<SnapshotPayload>(fetcher, requestUrl, endpoint, host, assets)
      return [path, compactSnapshotPayload(path, payload)] as const
    }))
    for (const [path, payload] of seed) {
      payloads.set(path, { ...payload, fromCache: true, fromSnapshot: true })
    }
    const streamPath = paths.find(path => path.startsWith('streams/'))
    if (streamPath) {
      const replayPath = endedReplayPath(liveDetailWindow(payloads, streamPath), streamPath, now)
      if (replayPath && coverage.has(replayPath)) {
        const vods = await fetchFeedSnapshot<SnapshotPayload>(fetcher, requestUrl, { kind: 'vods' }, host, assets)
          .then(payload => compactSnapshotPayload('vods', payload))
          .catch(() => undefined)
        if (listsReplay(vods, replayPath)) {
          payloads.get(streamPath)!.hasSnapshotReplay = true
        }
      }
    }
  } catch {
    payloads.clear()
    coverage.clear()
  }
  return {
    hasDetail: (path: string) => coverage.has(path),
    get<T extends { success: boolean }>(endpoint: FeedEndpoint) {
      return payloads.get(snapshotPath(endpoint)) as (T & FeedProvenance) | undefined
    },
  }
}

export function getFeedFallback(
  event: H3Event | undefined,
  binding: string,
  fetcher: typeof $fetch,
  config: FeedConfig,
  requestUrl: URL,
  seedDetails: readonly string[],
  now = Math.floor(Date.now() / 1000),
) {
  if (!event || (!URL.canParse(config.feedBase) && !isGenerationFeed(config.feedBase))) return
  const context: FeedContext = event.context
  return context[requestFallback] ??= readFeedFallback(
    event, binding, fetcher, config, requestUrl, pageRequirements(requestUrl), seedDetails, now,
  )
}

export async function getFeedCacheIdentity(event: H3Event, binding: string, config: FeedConfig, requestUrl: URL) {
  if (!isExternalFeed(config.feedBase)) return
  const pinned = getRequestReader(event, binding, requestUrl)
  if (!pinned) return
  try {
    const manifest = await pinned.reader.open()
    return manifest.commitId
  } catch {
    // A failed identity read may still render live upstream data.
    return
  }
}

export function getRenderedFeedGeneration(event: H3Event) {
  const context: FeedContext = event.context
  return context[requestGeneration]
}

export function getResolvedFeedGeneration(event: H3Event) {
  return (event.context as FeedContext)[resolvedGeneration]
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
  ).then(generation => {
    context[resolvedGeneration] = generation
    return generation
  })
}

export async function hasSnapshotPath(event: H3Event, binding: string, requestUrl: URL, path: string) {
  const pinned = getRequestReader(event, binding, requestUrl)
  return pinned ? (await pinned.reader.open()).ranges.has(path) : false
}

export async function getSnapshotHealth(event: H3Event, binding: string, requestUrl: URL, commitId: string) {
  if (!/^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}$/.test(commitId)) return {}
  const pinned = getRequestReader(event, binding, requestUrl)
  if (!pinned) return {}
  try {
    return await withinFeedDeadline('stream', 'snapshot', FEED_DEADLINES_MS.snapshot,
      () => pinned.reader.readHealth(commitId))
  } catch {
    return {}
  }
}
