import type { FeedStreamsResponse, FeedVodsResponse } from '../../app/composables/useFeed'
import { fetchFeed, getFeedAssets, getFeedFallback, getFeedGeneration } from '../utils/feed.ts'

import { feedDetailPath } from '../utils/feed-path.ts'

const STATIC_PATHS = ['/', '/vods', '/mirrors', '/about']

interface Entry {
  path: string
  lastmod?: string
}

const xmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

const encodePath = (p: string) => p.split('/').map(encodeURIComponent).join('/')

function toLastmod(value: number | string | undefined): string | undefined {
  if (value === undefined || value === '') return undefined
  const n = typeof value === 'number' ? value : Number(value)
  if (Number.isFinite(n) && n <= 0) return undefined // 24/7 entries carry starts_at 0
  const date = Number.isFinite(n) ? new Date(n * 1000) : new Date(String(value))
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

export default defineEventHandler(async (event) => {
  const origin = canonicalOrigin(event)
  const entries: Entry[] = STATIC_PATHS.map((path) => ({ path }))

  const { public: config, feedSnapshotBinding, seedDetailPaths } = useRuntimeConfig(event)
  const requestUrl = getRequestURL(event)
  const assets = getFeedAssets(event)
  const generation = await getFeedGeneration(event, feedSnapshotBinding, config, requestUrl, [
    { kind: 'streams' }, { kind: 'vods' },
  ])
  const resolved = generation?.readable ? generation :
    await getFeedFallback(event, feedSnapshotBinding, $fetch, config, requestUrl, seedDetailPaths)
  const [streams, vods] = resolved ? [
    resolved.get<FeedStreamsResponse>({ kind: 'streams' }),
    resolved.get<FeedVodsResponse>({ kind: 'vods' }),
  ] : await Promise.all([
    fetchFeed<FeedStreamsResponse>($fetch, config, requestUrl, { kind: 'streams' }, assets).catch(() => null),
    fetchFeed<FeedVodsResponse>($fetch, config, requestUrl, { kind: 'vods' }, assets).catch(() => null),
  ])
  const covered = (path: string) => resolved?.hasDetail(path) ?? true

  const seen = new Set(entries.map((e) => e.path))
  const push = (path: string, lastmod?: string) => {
    if (seen.has(path)) return
    seen.add(path)
    entries.push({ path, lastmod })
  }

  for (const cat of streams?.streams ?? []) {
    for (const s of cat.streams ?? []) {
      const path = feedDetailPath('streams', s.uri_name)
      if (path && covered(path)) {
        push(`/live/${encodePath(path.slice('streams/'.length))}`, toLastmod(s.starts_at))
      }
    }
  }
  for (const cat of vods?.vods ?? []) {
    for (const v of cat.vods ?? []) {
      const path = feedDetailPath('vods', v.slug ?? v.uri_name)
      if (path && covered(path)) {
        push(`/vods/${encodePath(path.slice('vods/'.length))}`, toLastmod(v.added))
      }
    }
  }

  const body = entries
    .map(({ path, lastmod }) =>
      `  <url><loc>${xmlEscape(origin + path)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`,
    )
    .join('\n')

  setResponseHeader(event, 'content-type', 'application/xml; charset=utf-8')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`
})
