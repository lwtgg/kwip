import { lookupEdgePage } from '../utils/edge-cache-handler'

const LOCAL_DEV_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]'])

export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event)
  const canonicalHost = (config.public.canonicalHost || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '')

  if (!canonicalHost) {
    return lookupEdgePage(event)
  }

  const url = getRequestURL(event, { xForwardedHost: true, xForwardedProto: true })
  const requestHost = url.host.toLowerCase()
  const requestHostname = url.hostname.toLowerCase()

  if (requestHost === canonicalHost) {
    return lookupEdgePage(event)
  }

  if (!LOCAL_DEV_HOSTNAMES.has(canonicalHost) && LOCAL_DEV_HOSTNAMES.has(requestHostname)) {
    return lookupEdgePage(event)
  }

  return sendRedirect(event, `https://${canonicalHost}${url.pathname}${url.search}`, 301)
})
