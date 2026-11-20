import { isBannerAssetPath } from '../../shared/utils/banner'
import { lookupEdgePage } from '../utils/edge-cache-handler'

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

  if (canonicalHost && requestHost !== canonicalHost && !localDev) {
    return sendRedirect(event, `https://${canonicalHost}${url.pathname}${url.search}`, 301)
  }

  if (!isBannerAssetPath(url.pathname)) return lookupEdgePage(event)
})
