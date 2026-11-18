// Served from a route, not public/, so the Sitemap line follows runtimeConfig (rule 13).
export default defineEventHandler((event) => {
  setResponseHeader(event, 'content-type', 'text/plain; charset=utf-8')
  return `User-agent: *\nAllow: /\n\nSitemap: ${canonicalOrigin(event)}/sitemap.xml\n`
})
