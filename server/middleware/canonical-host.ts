// Rule 13: every non-canonical host (mirrors, www) 301s to the canonical host, path + query kept.
export default defineEventHandler((event) => {
  if (import.meta.dev) return
  const { canonicalHost } = useRuntimeConfig(event).public
  const host = (getRequestHost(event, { xForwardedHost: true }) || '').toLowerCase()
  if (!canonicalHost || !host || host === canonicalHost) return
  const url = getRequestURL(event)
  return sendRedirect(event, `https://${canonicalHost}${url.pathname}${url.search}`, 301)
})
