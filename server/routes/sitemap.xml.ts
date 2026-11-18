import type { H3Event } from 'h3'
import type { FeedStreamsResponse, FeedVodsResponse } from '../../app/composables/useFeed'

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

// Mirrors useFeed.ts endpoint resolution; that composable is Vue-only and can't run in a Nitro route.
function feedUrl(event: H3Event, base: string, name: 'streams' | 'vods'): string {
  const trimmed = (base || '/fixtures').replace(/\/+$/, '')
  const isFixture = trimmed === '/fixtures' || trimmed.endsWith('/fixtures')
  const path = isFixture ? `${trimmed}/${name}.json` : `${trimmed}/${name}`
  return trimmed.startsWith('/') ? `${getRequestURL(event).origin}${path}` : path
}

async function fetchFeed<T extends { success: boolean }>(event: H3Event, name: 'streams' | 'vods'): Promise<T | null> {
  const { feedBase, feedMirrorBase } = useRuntimeConfig(event).public
  for (const base of [feedBase, feedMirrorBase].filter(Boolean)) {
    try {
      const data = await $fetch<T>(feedUrl(event, base, name), { responseType: 'json' })
      if (data && data.success) return data
    } catch {
      // try the next base; fail soft below
    }
  }
  return null
}

export default defineEventHandler(async (event) => {
  const origin = canonicalOrigin(event)
  const entries: Entry[] = STATIC_PATHS.map((path) => ({ path }))

  const [streams, vods] = await Promise.all([
    fetchFeed<FeedStreamsResponse>(event, 'streams'),
    fetchFeed<FeedVodsResponse>(event, 'vods'),
  ])

  const seen = new Set(entries.map((e) => e.path))
  const push = (path: string, lastmod?: string) => {
    if (seen.has(path)) return
    seen.add(path)
    entries.push({ path, lastmod })
  }

  for (const cat of streams?.streams ?? []) {
    for (const s of cat.streams ?? []) {
      if (s.uri_name) push(`/live/${encodePath(s.uri_name)}`, toLastmod(s.starts_at))
    }
  }
  for (const cat of vods?.vods ?? []) {
    for (const v of cat.vods ?? []) {
      if (v.uri_name) push(`/vods/${encodePath(v.uri_name)}`, toLastmod(v.added))
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
