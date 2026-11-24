import type { H3Event } from 'h3'
import { fetchFeed, getFeedAssets, getFeedCacheIdentity, getFeedGeneration, getSnapshotHealth, hasSnapshotPath, type FeedEndpoint } from './feed.ts'
import { isSnapshotPath } from './feed-path.ts'

// Our API is uncached (decision 11). HTML consumers use the existing generation,
// host and render-query cache key; JSON must never outlive the current manifest.
export async function serveFeedPath(
  event: H3Event,
  path: string,
  fetcher: typeof $fetch,
  config: { feedSnapshotBinding: string; public: { feedMirrorBase: string; canonicalHost: string } },
  url: URL,
) {
  const headers: Record<string, string> = { 'cache-control': 'no-store' }
  const missing = () => ({ status: 404, headers, body: { success: false, error: 'Not found', snapshotOmitted: true } })
  if (path !== 'ping' && !isSnapshotPath(path)) return missing()
  const feedConfig = { ...config.public, feedBase: '/api/feed' }
  if (path === 'health.json') {
    const identity = await getFeedCacheIdentity(event, config.feedSnapshotBinding, feedConfig, url)
    if (!identity) return { status: 503, headers, body: { success: false, error: 'Feed unavailable' } }
    if (!await hasSnapshotPath(event, config.feedSnapshotBinding, url, path)) return missing()
    return { status: 200, headers, body: await getSnapshotHealth(event, config.feedSnapshotBinding, url, identity) }
  }
  const endpoint: FeedEndpoint = path === 'ping' ? { kind: 'ping' }
    : path === 'streams' ? { kind: 'streams' }
      : path === 'vods' ? { kind: 'vods' }
        : path.startsWith('streams/') ? { kind: 'stream', uriName: path.slice(8) }
          : { kind: 'vod', slug: path.slice(5) }
  // Read the matching list too, so detail identity validation remains intact.
  const endpoints: FeedEndpoint[] = endpoint.kind === 'stream' ? [{ kind: 'streams' }, endpoint]
    : endpoint.kind === 'vod' ? [{ kind: 'vods' }, endpoint] : [endpoint]
  const generation = endpoint.kind !== 'ping'
    ? await getFeedGeneration(event, config.feedSnapshotBinding, feedConfig, url, endpoints)
    : undefined
  if (generation?.readable) {
    const body = generation.get(endpoint)
    if (!body) return missing()
    return { status: 200, headers, body }
  }
  try {
    const body = await fetchFeed(fetcher, { ...feedConfig, feedBase: 'https://api.ppv.st/api' }, url, endpoint, getFeedAssets(event))
    return { status: 200, headers, body }
  } catch {
    return { status: 503, headers, body: { success: false, error: 'Feed unavailable' } }
  }
}
