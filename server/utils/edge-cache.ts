export function renderSearch(url: URL): URLSearchParams {
  const query = new URLSearchParams()
  const filter = url.searchParams.get('filter')
  if (filter !== null) query.set('filter', filter)
  const sources = url.searchParams.getAll('source')
  // Live detail treats repeated source values as an unselected source.
  if (sources.length) query.set('source', sources.length === 1 ? sources[0]! : '')
  return query
}

export function edgeCacheKey(url: URL, generation: string, query = renderSearch(url)): Request {
  const key = new URL(url.origin)
  key.pathname = url.pathname
  key.searchParams.set('generation', generation)
  key.searchParams.set('host', url.host)
  for (const [name, value] of query) key.searchParams.set(name, value)
  return new Request(key)
}

export function isEdgeCacheable(status: number, headers: Headers): boolean {
  const type = headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  return status === 200 && (type === 'text/html' || type === 'application/xml') &&
    !headers.has('set-cookie') && !headers.has('vary')
}

export function edgeCacheMaxAge(boundary: number, now: number): number {
  return Math.max(0, Math.min(900, Math.floor(boundary - now)))
}
