import { serveFeedPath } from '../../../utils/feed-route'

export default defineEventHandler(async event => {
  if (event.method !== 'GET' && event.method !== 'HEAD') {
    setResponseHeader(event, 'cache-control', 'no-store')
    setResponseStatus(event, 405)
    return { success: false, error: 'Method not allowed' }
  }
  const path = getRouterParam(event, 'path', { decode: true }) ?? ''
  const result = await serveFeedPath(event, path, $fetch, useRuntimeConfig(event), getRequestURL(event))
  setResponseStatus(event, result.status)
  for (const [name, value] of Object.entries(result.headers)) setResponseHeader(event, name, value)
  setResponseHeader(event, 'content-type', 'application/json; charset=utf-8')
  return event.method === 'HEAD' ? '' : result.body
})
