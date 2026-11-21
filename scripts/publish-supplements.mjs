import { findSupplement, slugifyCategory } from '../app/utils/supplementMatch.ts'
import { applySupplementStatus, supplementSources } from '../app/utils/strmfree.ts'
import { sourceKey } from '../app/utils/sourceIdentity.ts'
import { nearbyEvent, sourceProbeCap, sourceUrls } from './probe-source-health.mjs'

const api = 'https://strmfree.pk/api/v1'

async function fetchJson(path, deadline) {
  const remaining = Math.floor(deadline - performance.now())
  if (remaining <= 0) return
  try {
    const response = await fetch(`${api}/${path}`, {
      redirect: 'manual',
      signal: AbortSignal.timeout(Math.min(3000, remaining)),
    })
    if (!response.ok) {
      await response.body?.cancel()
      return
    }
    const chunks = []
    let length = 0
    for await (const chunk of response.body) {
      length += chunk.length
      if (length > 2 * 1024 ** 2) return
      chunks.push(chunk)
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)))
  } catch {
    // An unavailable supplement provider does not affect the primary feed.
  }
}

export async function fetchSupplementListing(deadline) {
  const payload = await fetchJson('streams', deadline)
  if (!Array.isArray(payload?.streams) || !payload.streams.every(stream =>
    typeof stream?.name === 'string' && Number.isFinite(stream.match_timestamp)
    && (stream.stream_key == null || (typeof stream.stream_key === 'string' && stream.stream_key.isWellFormed()))
    && (stream.iframe == null || typeof stream.iframe === 'string')
    && (stream.additional_sources == null || (Array.isArray(stream.additional_sources)
      && stream.additional_sources.every(source => typeof source?.url === 'string'))),
  )) return
  return payload
}

export function matchPublishedSupplement(item, timing, listing) {
  if (!listing || Number(timing.always_live) === 1) return
  const category = item.category_name || timing.category
  return findSupplement(
    { name: item.name, starts_at: Number(timing.starts_at) },
    typeof category === 'string' ? slugifyCategory(category) : '',
    listing,
  )
}

export function publishedSupplementSources(item, match) {
  const keys = new Set(Array.from(sourceUrls(item), sourceKey))
  return supplementSources(match, true).flatMap(source => {
    const key = sourceKey(source.data)
    if (keys.has(key)) return []
    keys.add(key)
    return [{
      ...source,
      name: 'Strmfree',
      substreamName: 'Strmfree',
      data: source.data.startsWith('//') ? `https:${source.data}` : source.data,
    }]
  })
}

export async function fetchSupplementStatuses(matches, now, deadline) {
  const statuses = new Map()
  const keys = new Set()
  for (const { match, timing } of matches) {
    if (keys.size === sourceProbeCap) break
    if (match.stream_key && nearbyEvent(timing, now)) keys.add(match.stream_key)
  }
  const queue = keys.values()
  await Promise.all(Array.from({ length: Math.min(4, keys.size) }, async () => {
    for (const key of queue) {
      if (performance.now() >= deadline) break
      statuses.set(key, await fetchJson(`sources/${encodeURIComponent(key)}`, deadline))
    }
  }))
  return ({ match, sources, timing }) => applySupplementStatus(
    sources, nearbyEvent(timing, now) ? statuses.get(match.stream_key) : undefined,
  )
}
