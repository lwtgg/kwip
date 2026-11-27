// @ts-expect-error The original Nuxt renderer is aliased by the Nitro config hook.
import render from '#kwip-nuxt-renderer'
import { finishEdgeLookup, lookupEdgePage } from '../utils/edge-cache-handler'
import { canonicalOrigin } from '../utils/canonical'
import { FEED_DEADLINES_MS, fetchFeedSnapshot, getFeedAssets, getResolvedFeedGeneration, type FeedEndpoint } from '../utils/feed'
import { validFeedPath } from '../utils/feed-path'
import { getPageRequest, isNuxtPayload, logPageBoundary, startPageRequest } from '../utils/page-request'
import { withinPageRender } from '../utils/page-render-deadline'

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

function fallbackDocument(canonical: string, title: string, detail: string) {
  const url = escapeHtml(canonical)
  const heading = escapeHtml(title)
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    `<link rel="canonical" href="${url}"><meta property="og:url" content="${url}"><title>${heading}</title>` +
    `</head><body><main><h1>${heading}</h1><p>${escapeHtml(detail)}</p><p>Please try again shortly.</p></main></body></html>`
}

export default defineEventHandler(async event => {
  const url = getRequestURL(event, { xForwardedHost: true, xForwardedProto: true })
  if (url.pathname === '/__nuxt_error' || isNuxtPayload(url.pathname)) return render(event)

  const request = getPageRequest(event) ?? startPageRequest(event, url.pathname)
  const canonical = canonicalOrigin(event) + request.path
  let seedPath: string | undefined
  let cacheHit: Response | undefined
  try {
    const response = await withinPageRender(
      request.start,
      FEED_DEADLINES_MS.seed + 50,
      async () => {
        cacheHit = await lookupEdgePage(event, request.candidate)
        if (cacheHit || request.cancelled) return cacheHit
        return render(event)
      },
      async () => {
        const match = /^\/(live|vods)\/(.+?)\/?$/i.exec(request.path)
        if (!match) return
        const uri = decodeURIComponent(match[2]!)
        const collection = match[1]!.toLowerCase() === 'live' ? 'streams' : 'vods'
        if (!validFeedPath(collection, uri)) return
        const path = collection + '/' + uri
        if (!useRuntimeConfig(event).seedDetailPaths.includes(path)) return
        seedPath = path

        const endpoint: FeedEndpoint = collection === 'streams' ? { kind: 'stream', uriName: uri } : { kind: 'vod', slug: uri }
        const assets = getFeedAssets(event)
        const seed = await fetchFeedSnapshot<{
          success: true
          data?: { name?: string; match?: { away?: { name?: string }; home?: { name?: string } } }
        }>(
          // The node-server preset serves the seed via its local asset handler.
          assets ? $fetch : ((input, options) => event.$fetch(new URL(String(input)).pathname, options)) as typeof $fetch,
          url, endpoint, url.host, assets,
        )
        const away = seed.data?.match?.away?.name
        const home = seed.data?.match?.home?.name
        const heading = typeof away === 'string' && typeof home === 'string'
          ? `${away} vs. ${home}`
          : seed.data?.name
        if (typeof heading === 'string' && heading) {
          return fallbackDocument(canonical, heading, 'Saved event details are available. The full page took too long to load.')
        }
      },
      seed => {
        request.cancelled = true
        const cached = finishEdgeLookup(event, true)
        if (cached) {
          logPageBoundary(event, 'page_render_timeout', { fallback: 'cache' })
          return cached
        }
        const generation = getResolvedFeedGeneration(event)
        if (seedPath && generation?.readable && !generation.hasDetail(seedPath)) seed = undefined
        logPageBoundary(event, 'page_render_timeout', { fallback: seed ? 'seed' : 'retry' })
        return new Response(seed ?? fallbackDocument(canonical, 'Page temporarily unavailable', 'The page took too long to load.'), {
          status: seed ? 200 : 503,
          headers: {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'no-store',
            ...(seed ? {} : { 'retry-after': '5' }),
          },
        })
      },
    )
    // An accepted hit owns the cached body. The timeout path takes it in finishEdgeLookup.
    if (cacheHit && response === cacheHit) delete request.cachedFallback
    return response
  } finally {
    finishEdgeLookup(event, false)
  }
})
