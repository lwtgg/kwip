import type { H3Event } from 'h3'

interface FeedAssets {
  fetch(request: Request): Promise<Response>
}

interface CloudflareEnv {
  ASSETS?: FeedAssets
}

export function getFeedAssets(event?: H3Event): FeedAssets | undefined {
  const env = event?.context.cloudflare?.env as CloudflareEnv | undefined
  return env?.ASSETS ?? (globalThis as typeof globalThis & { __env__?: CloudflareEnv }).__env__?.ASSETS
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

  return replaceHostTokens(payload as T, host)
}

export async function fetchFeed<T extends { success: boolean }>(
  fetcher: typeof $fetch,
  config: FeedConfig,
  requestUrl: URL,
  endpoint: FeedEndpoint,
  assets?: FeedAssets,
): Promise<T> {
  const host = requestUrl.host || config.canonicalHost
  // Use absolute URLs for public fixtures, which Vite serves separately in dev.
  const resolveUrl = (base: string) => {
    const path = buildEndpointUrl(base.replace(/\/+$/, ''), endpoint)
    return path.startsWith('/') ? new URL(path, requestUrl.origin).href : path
  }
  const primaryUrl = resolveUrl(config.feedBase || '/fixtures')
  const mirrorUrl = config.feedMirrorBase ? resolveUrl(config.feedMirrorBase) : null
  let networkFailure = false
  try {
    return await fetchFromBase<T>(fetcher, primaryUrl, requestUrl, host, assets, () => {
      networkFailure = true
    })
  } catch (err) {
    if (!networkFailure || !mirrorUrl || mirrorUrl === primaryUrl) {
      throw err
    }
    return await fetchFromBase<T>(fetcher, mirrorUrl, requestUrl, host, assets)
  }
}
