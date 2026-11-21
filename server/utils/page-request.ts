import type { H3Event } from 'h3'
import type { edgePageCandidate } from './edge-cache-handler'

const pageRequest = Symbol('pageRequest')
type PageRequest = {
  start: number
  ray: string | null
  path: string
  method: string
  candidate: ReturnType<typeof edgePageCandidate>
  cancelled?: boolean
  renderFinished?: boolean
  cachedFallback?: Response
}
type Context = H3Event['context'] & { [pageRequest]?: PageRequest }

export function isNuxtPayload(path: string) {
  return /\/_payload\.(?:js|json)$/.test(path)
}

export function getPageRequest(event: H3Event) {
  return (event.context as Context)[pageRequest]
}

export function startPageRequest(event: H3Event, path: string, candidate?: ReturnType<typeof edgePageCandidate>) {
  const context: Context = event.context
  const request: PageRequest = {
    start: Date.now(), path, method: event.method, candidate,
    ray: event.node.req.headers['cf-ray']?.toString() ?? null,
  }
  context[pageRequest] = request
  logPageBoundary(event, 'page_start', {
    edgeCache: candidate?.eligible === true, ua: event.node.req.headers['user-agent']?.toString().slice(0, 160) ?? '',
  })
  return request
}

export function logPageBoundary(event: H3Event, name: string, fields = {}) {
  const request = getPageRequest(event)
  if (!request) return
  const { start, ray, path, method } = request
  console.log(JSON.stringify({ event: name, ray, path, method, elapsedMs: Date.now() - start, ...fields }))
}
