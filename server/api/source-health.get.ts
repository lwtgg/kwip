import { getFeedCacheIdentity, getSnapshotHealth } from '../utils/feed'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const { current, generation } = getQuery(event)
  const { feedSnapshotBinding, public: config } = useRuntimeConfig(event)
  const url = getRequestURL(event)
  if (current === '1') {
    const commitId = await getFeedCacheIdentity(event, feedSnapshotBinding, config, url)
    return { commitId }
  }
  if (typeof generation !== 'string') return {}
  return getSnapshotHealth(event, feedSnapshotBinding, url, generation)
})
