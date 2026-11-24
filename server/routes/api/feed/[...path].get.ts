import { serveFeedPath } from '../../../utils/feed-route'

export default defineEventHandler(async event => {
  const path = getRouterParam(event, 'path', { decode: true }) ?? ''
  const result = await serveFeedPath(event, path, $fetch, useRuntimeConfig(event), getRequestURL(event))
  setResponseStatus(event, result.status)
  for (const [name, value] of Object.entries(result.headers)) setResponseHeader(event, name, value)
  return result.body
})
