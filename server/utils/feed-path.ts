export type FeedCollection = 'streams' | 'vods'

export function validFeedPath(collection: FeedCollection, path: string): boolean {
  return !(collection === 'vods' && path.includes('/')) &&
    !/[\\\x00-\x1f\x7f]/.test(path) &&
    path.split('/').every(segment => segment && segment !== '.' && segment !== '..')
}

export function feedDetailPath(collection: FeedCollection, value: unknown): string | undefined {
  if (typeof value !== 'string') return
  const path = value.replace(/^\/+/, '')
  if (validFeedPath(collection, path)) return collection + '/' + path
}

export function isSnapshotPath(path: string): boolean {
  if (path === 'health.json') return true
  const slash = path.indexOf('/')
  if (slash === -1) return path === 'streams' || path === 'vods'
  const collection = path.slice(0, slash)
  return (collection === 'streams' || collection === 'vods') && validFeedPath(collection, path.slice(slash + 1))
}
