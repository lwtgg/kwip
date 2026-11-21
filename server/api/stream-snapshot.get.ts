import { getFeedGeneration } from '../utils/feed'
import { validFeedPath } from '../utils/feed-path'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const { uri } = getQuery(event)
  if (typeof uri !== 'string' || !validFeedPath('streams', uri)) return {}
  const { feedSnapshotBinding, public: config } = useRuntimeConfig(event)
  const endpoint = { kind: 'stream', uriName: uri } as const
  const url = getRequestURL(event)
  url.pathname = '/live/' + uri.split('/').map(encodeURIComponent).join('/')
  const generation = await getFeedGeneration(event, feedSnapshotBinding, config, url, [{ kind: 'streams' }, endpoint])
  if (!generation?.readable) return {}
  return generation.get(endpoint) ?? { snapshotOmitted: true }
})
