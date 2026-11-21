import { getSnapshotHealth } from '../utils/feed'

export default defineEventHandler((event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const { generation } = getQuery(event)
  if (typeof generation !== 'string') return {}
  const { feedSnapshotBinding } = useRuntimeConfig(event)
  return getSnapshotHealth(event, feedSnapshotBinding, getRequestURL(event), generation)
})
