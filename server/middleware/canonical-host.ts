import { isBannerAssetPath } from '../../shared/utils/banner'
import { edgePageCandidate, lookupEdgePage } from '../utils/edge-cache-handler'
import { isNuxtPayload, startPageRequest } from '../utils/page-request'

const pagePath = /^\/(?:about\/?|mirrors\/?|c(?:\/.*)?|live(?:\/.*)?|vods(?:\/.*)?|sitemap\.xml)?$/i
const LOCAL_DEV_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]'])

export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event)
  const canonicalHost = (config.public.canonicalHost || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '')

  const url = getRequestURL(event, { xForwardedHost: true, xForwardedProto: true })
  const requestHost = url.host.toLowerCase()
  const requestHostname = url.hostname.toLowerCase()
  const localDev = !LOCAL_DEV_HOSTNAMES.has(canonicalHost) && LOCAL_DEV_HOSTNAMES.has(requestHostname)

  const redirect = canonicalHost && requestHost !== canonicalHost && !localDev
  const candidate = !redirect && !isBannerAssetPath(url.pathname) ? edgePageCandidate(event, url) : undefined
  const payload = isNuxtPayload(url.pathname)
  if (!payload && pagePath.test(url.pathname)) startPageRequest(event, url.pathname, candidate)

  if (redirect) {
    return sendRedirect(event, `https://${canonicalHost}${url.pathname}${url.search}`, 301)
  }

  // The HTML renderer owns the total deadline, including its cache lookup.
  if (url.pathname.toLowerCase() === '/sitemap.xml' || payload) {
    return lookupEdgePage(event, candidate)
  }
})
