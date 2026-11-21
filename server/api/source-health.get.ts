import { getSnapshotHealth } from '../utils/feed'

export default defineEventHandler((event) => {
  const { generation } = getQuery(event)
  if (typeof generation !== 'string') return {}
  const { feedSnapshotBinding } = useRuntimeConfig(event)
  return getSnapshotHealth(event, feedSnapshotBinding, getRequestURL(event), generation)
})
