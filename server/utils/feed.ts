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

async function fetchFromBase<T extends { success: boolean }>(
  fetcher: typeof $fetch,
  url: string,
  requestUrl: URL,
  host: string,
  assets?: FeedAssets,
  onRequestError?: () => void,
): Promise<T> {
  let payload: unknown
  if (assets && URL.canParse(url) && new URL(url).origin === requestUrl.origin) {
    const request = new Request(url)
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
    payload = await fetcher(url, { responseType: 'json', retry: 0, onRequestError })
  }

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
  return fetchFromBase<T>(fetcher, url, requestUrl, requestUrl.host || config.canonicalHost)
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
  const cached = await fetchFromBase<T>(fetcher, `${url}.json`, requestUrl, host, assets, onRequestError)
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
    return await fetchFromBase<T>(fetcher, primaryUrl, requestUrl, host, assets, () => {
      networkFailure = true
    })
  } catch (err) {
    let upstreamError = err
    if (networkFailure && mirrorUrl && mirrorUrl !== primaryUrl) {
      try {
        return await fetchFromBase<T>(fetcher, mirrorUrl, requestUrl, host, assets)
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
      if (!assets && (cacheMissing || cacheUnreachable)) throw upstreamError
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

function endedReplayPath(payloads: Map<string, SnapshotPayload>, streamPath: string | undefined, now: number) {
  if (!streamPath) return
  const stream = payloads.get(streamPath)?.data as {
    always_live?: number; ends_at?: number | string; end_timestamp?: number | string
  } | undefined
  if (!stream) return
  const end = Number(stream.ends_at ?? stream.end_timestamp)
  if (!(end > 0 && now >= end)) return
  const uri = streamPath.slice('streams/'.length)
  const categories = payloads.get('streams')?.streams as {
    always_live?: number; streams: { uri_name: string; always_live?: number }[]
  }[] | undefined
  let alwaysLive = stream.always_live
  if (alwaysLive == null) {
    for (const category of categories ?? []) {
      const item = category.streams.find(item => item.uri_name === uri)
      if (!item) continue
      alwaysLive = item.always_live ?? category.always_live
      break
    }
  }
  if (alwaysLive === 0) return feedDetailPath('vods', uri)
}

function listsReplay(payload: SnapshotPayload | undefined, path: string): boolean {
  const categories = payload?.vods as { vods: { uri_name: string }[] }[] | undefined
  return categories?.some(category => category.vods.some(vod => feedDetailPath('vods', vod.uri_name) === path)) ?? false
}

type SnapshotPayload = Record<string, unknown> & { success: true } & FeedProvenance

export async function readFeedGeneration(
  bucket: SnapshotBucket,
  fetcher: typeof $fetch,
  requestUrl: URL,
  host: string,
  endpoints: FeedEndpoint[],
  assets?: FeedAssets,
  seedDetails: readonly string[] = [],
  now = Math.floor(Date.now() / 1000),
) {
  const paths = endpoints.map(snapshotPath)
  const streamPath = paths.find(path => path.startsWith('streams/'))
  let payloads = new Map<string, SnapshotPayload>()
  let hasDetail: (path: string) => boolean = () => false
  const reader = createSnapshotReader(bucket)
  try {
    const snapshot = await reader.read(paths)
    for (const [path, { payload, hasHostToken }] of snapshot.payloads) {
      const resolved = hasHostToken ? replaceHostTokens(payload, host) : payload
      const slash = path.indexOf('/')
      const normalized = slash !== -1
        ? { ...resolved, data: { ...resolved.data as object, uri_name: path.slice(slash + 1) } }
        : resolved
      payloads.set(path, { ...normalized, fromCache: true, fromSnapshot: true })
    }
    const replayPath = endedReplayPath(payloads, streamPath, now)
    if (streamPath && replayPath && snapshot.has(replayPath)) {
      const vods = (await reader.read(['vods'])).payloads.get('vods')?.payload
      if (listsReplay(vods, replayPath)) payloads.get(streamPath)!.hasSnapshotReplay = true
    }
    hasDetail = snapshot.has
  } catch {
    payloads.clear()
    // Wait for the complete seed batch before making any payload visible to SSR.
    try {
      const seed = await Promise.all(endpoints.map(endpoint =>
        fetchFeedSnapshot<{ success: true }>(fetcher, requestUrl, endpoint, host, assets),
      ))
      const seedPayloads = new Map<string, SnapshotPayload>(paths.map((path, index) => [
        path, { ...compactSnapshotPayload(path, seed[index]), fromCache: true, fromSnapshot: true },
      ]))
      const coverage = new Set(seedDetails)
      const replayPath = endedReplayPath(seedPayloads, streamPath, now)
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
  return {
    get<T extends { success: boolean }>(endpoint: FeedEndpoint) {
      return payloads.get(snapshotPath(endpoint)) as (T & FeedProvenance) | undefined
    },
    hasDetail,
  }
}

const requestGeneration = Symbol('feedGeneration')

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
  if (!event || !isExternalFeed(config.feedBase)) return
  const bucket = getCloudflareEnv(event)?.[binding] as Partial<SnapshotBucket> | undefined
  if (typeof bucket?.get !== 'function') return

  const context = event.context as H3Event['context'] & {
    [requestGeneration]?: ReturnType<typeof readFeedGeneration>
  }
  return context[requestGeneration] ??= readFeedGeneration(
    bucket as SnapshotBucket, fetcher, requestUrl, requestUrl.host || config.canonicalHost,
    endpoints ?? pageRequirements(requestUrl), getFeedAssets(event), seedDetails, now,
  )
}
