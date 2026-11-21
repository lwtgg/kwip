import type { H3Event } from 'h3'
import { getCookie, getRequestURL, getResponseHeaders, getResponseStatus, setResponseHeader } from 'h3'
import { edgeCacheKey, edgeCacheMaxAge, isEdgeCacheable, renderSearch } from './edge-cache'
import { FEED_DEADLINES_MS, getFeedCacheIdentity, getRenderedFeedGeneration, withinFeedDeadline } from './feed'

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
  const identity = await getFeedCacheIdentity(event, feedSnapshotBinding, config, url)
  if (!identity) return
  const query = renderSearch(url)
  const timed = /^(?:\/$|\/(?:live|c)\/)/i.test(url.pathname)
  // Nuxt serializes public runtime config on every page, including navigation entry points.
  const cacheQuery = new URLSearchParams(query)
  if (config.ads === true) cacheQuery.set('ads', '1')
  const key = edgeCacheKey(url, identity, cacheQuery)
  try {
    const endpoint = url.pathname === '/sitemap.xml' ? 'sitemap' : 'page'
    const cached = await withinFeedDeadline(endpoint, 'cache-match', FEED_DEADLINES_MS.cacheMatch, async (signal) => {
      const response = await cache.match(key)
      // A late hit has no consumer after SSR starts.
      if (signal.aborted) {
        await response?.body?.cancel()
        return
      }
      return response
    })
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
