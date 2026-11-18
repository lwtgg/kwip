// Rule 13: every non-canonical host (mirrors, www) 301s to the canonical host, path + query kept.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1'])

function normaliseHost(value: string): string {
  return value.trim().toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/\/+$/, '')
}

function stripPort(host: string): string {
  return host.replace(/:\d+$/, '')
}

export default defineEventHandler((event) => {
  if (import.meta.dev) return
  const canonicalHost = normaliseHost(String(useRuntimeConfig(event).public.canonicalHost || ''))
  const host = normaliseHost(getRequestHost(event, { xForwardedHost: true }) || '')
  if (!canonicalHost || !host || host === canonicalHost) return
  if (LOCAL_HOSTS.has(stripPort(host)) && !LOCAL_HOSTS.has(stripPort(canonicalHost))) return
  const url = getRequestURL(event)
  return sendRedirect(event, `https://${canonicalHost}${url.pathname}${url.search}`, 301)
})
