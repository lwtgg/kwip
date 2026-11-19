import type { H3Event } from 'h3'
import { getCookie, getRequestURL, getResponseHeaders, getResponseStatus, setResponseHeader } from 'h3'
import { edgeCacheKey, edgeCacheMaxAge, isEdgeCacheable, renderSearch } from './edge-cache'
import { getFeedCacheIdentity, getRenderedFeedGeneration } from './feed'

const cacheRequest = Symbol('edgeCacheRequest')
type EdgeCacheContext = H3Event['context'] & {
  [cacheRequest]?: { cache: Cache; key: Request; identity: string; search: string; timed: boolean }
}
const expiryHeader = 'x-kwip-cache-until'
const feedPage = /^\/(?:c\/[^/]+\/?|live\/.+|vods(?:\/.*)?|sitemap\.xml)?$/i

export async function lookupEdgePage(event: H3Event) {
  const cache = (globalThis.caches as (CacheStorage & { default?: Cache }) | undefined)?.default
  const request: Request | undefined = event.context.cloudflare?.request
  // Wrangler can emulate caches.default. Only use the edge cache for Cloudflare ingress.
  if (!cache || request?.method !== 'GET' || !request.headers.has('cf-ray') || !event.context.waitUntil) return
  const url = new URL(request.url)
  if (!feedPage.test(url.pathname)) return

  setResponseHeader(event, 'cache-control', 'no-store')
  // Layout SSR writes appearance preferences into HTML and the hydration state.
  if (url.pathname !== '/sitemap.xml' &&
      (getCookie(event, 'theme') !== undefined || getCookie(event, 'density') !== undefined)) return
  if (getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }).origin !== url.origin) return

  const { feedSnapshotBinding, public: config } = useRuntimeConfig(event)
  const identity = await getFeedCacheIdentity(event, feedSnapshotBinding, config)
  if (!identity) return
  const query = renderSearch(url)
  const key = edgeCacheKey(url, identity, query)
  const timed = /^(?:\/$|\/(?:live|c)\/)/i.test(url.pathname)
  try {
    const cached = await cache.match(key)
    // The absolute deadline also excludes entries written before the current TTL rules.
    if (cached && (!timed || Number(cached.headers.get(expiryHeader)) > Date.now() / 1000)) {
      const response = new Response(cached.body, cached)
      response.headers.delete(expiryHeader)
      response.headers.set('x-kwip-cache', 'hit')
      response.headers.set('cache-control', 'no-store')
      return response
    }
    if (cached?.body) event.waitUntil(cached.body.cancel().catch(() => {}))
  } catch {
    // A cache failure must leave the normal render available.
  }

  const context: EdgeCacheContext = event.context
  context[cacheRequest] = { cache, key, identity, search: query.toString(), timed }
  setResponseHeader(event, 'x-kwip-cache', 'miss')
}

export function normalizeEdgeRenderPath(event: H3Event) {
  const context: EdgeCacheContext = event.context
  const pending = context[cacheRequest]
  if (!pending) return
  // Nuxt serializes the SSR request path into its hydration payload.
  const pathname = event.path.split('?', 1)[0]
  event._path = event.node.req.url = pending.search ? pathname + '?' + pending.search : pathname
}

export async function storeEdgePage(event: H3Event, body: unknown) {
  const context: EdgeCacheContext = event.context
  const pending = context[cacheRequest]
  if (!pending || typeof body !== 'string') return
  try {
    const status = getResponseStatus(event)
    const headers = new Headers()
    for (const [name, value] of Object.entries(getResponseHeaders(event))) {
      if (value !== undefined) headers.set(name, String(value))
    }
    if (!isEdgeCacheable(status, headers)) return
    const generation = await getRenderedFeedGeneration(event)
    if (generation?.cacheIdentity !== pending.identity) return

    const now = Date.now() / 1000
    const maxAge = edgeCacheMaxAge(generation.cacheBoundary, now)
    if (!maxAge) return
    headers.delete('x-kwip-cache')
    headers.set('cache-control', `public, max-age=${maxAge}`)
    if (pending.timed) headers.set(expiryHeader, String(now + maxAge))
    const response = new Response(body, { status, headers })
    event.waitUntil(pending.cache.put(pending.key, response).catch(() => {}))
  } catch {
    // Cache construction and scheduling are best-effort, just like the write.
  }
}
