import { findSupplement, slugifyCategory } from '../app/utils/supplementMatch.ts'
import { applySupplementStatus, sourceQualityBand, supplementSources } from '../app/utils/strmfree.ts'
import { sourceKey } from '../app/utils/sourceIdentity.ts'
import { nearbyEvent, sourceProbeCap, sourceUrls } from './probe-source-health.mjs'

const api = 'https://strmfree.pk/api/v1'

async function fetchJson(url, deadline) {
  const remaining = Math.floor(deadline - performance.now())
  if (remaining <= 0) return
  try {
    const response = await fetch(url, {
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
  const payload = await fetchJson(`${api}/streams`, deadline)
  if (!Array.isArray(payload?.streams) || !payload.streams.every(stream =>
    typeof stream?.name === 'string' && Number.isFinite(stream.match_timestamp)
    && (stream.stream_key == null || (typeof stream.stream_key === 'string' && stream.stream_key.isWellFormed()))
    && (stream.iframe == null || typeof stream.iframe === 'string')
    && (stream.additional_sources == null || (Array.isArray(stream.additional_sources)
      && stream.additional_sources.every(source => typeof source?.url === 'string'))),
  )) return
  return payload
}

const pitSport = 'https://pitsport.st'
const pitSportCategories = new Map([
  ['nba', 'basketball'], ['nfl', 'football'], ['nhl', 'hockey'], ['tennis', 'tennis'],
  ['ufc', 'combat'], ['wrestling', 'combat'],
])
const pitSportVariants = /-(?:(?:uhd|fhd|hd|sd)-.+|spanish|portuguese|multiview)$/

export async function fetchPitSportListing(deadline) {
  const payload = await fetchJson(`${pitSport}/api/v1/home`, deadline)
  const { live, upcoming } = payload?.data ?? {}
  if (payload?.ok !== true || !Array.isArray(live) || !Array.isArray(upcoming)) return

  const programs = new Map()
  for (const program of [...live, ...upcoming]) {
    if (!Number.isSafeInteger(program?.sessionStart) || program.sessionStart <= 0 ||
        !Number.isSafeInteger(program.programId) || program.programId <= 0 ||
        typeof program.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(program.slug)) continue

    const key = `${program.slug}@${program.sessionStart}`
    const existing = programs.get(key)
    if (existing === null || (existing && existing.programId !== program.programId)) {
      programs.set(key, null)
      continue
    }
    const playable = program.hasVideo === true && typeof program.playHref === 'string' &&
      /^\/programs\/(\d+)\/play$/.exec(program.playHref)?.[1] === String(program.programId)
    if (!existing || (playable && !existing.playable)) programs.set(key, { ...program, playable })
  }

  const events = new Map()
  for (const program of programs.values()) {
    if (!program?.playable) continue
    const base = program.slug.replace(pitSportVariants, '')
    const key = `${base}@${program.sessionStart}`
    if (!events.has(key)) {
      events.set(key, {
        name: base.replaceAll('-', ' '),
        category: pitSportCategories.get(program.competitionSlug) ?? 'soccer',
        match_timestamp: program.sessionStart,
        sources: [],
      })
    }
    const label = typeof program.subtitle === 'string' ? program.subtitle.trim() : ''
    const band = sourceQualityBand(label)
    const variant = band ? label.split('|').slice(1).join('|').trim() : label
    events.get(key).sources.push({
      name: variant ? `PitSport · ${variant}` : 'PitSport',
      sourceTag: band,
      origin: 'pitsport',
      type: 'iframe',
      default: false,
      data: pitSport + program.playHref,
    })
  }
  return { streams: [...events.values()] }
}

export function dedupePublishedSources(item, sources) {
  const keys = new Set([...sourceUrls(item), item.source?.data].filter(url => typeof url === 'string').map(sourceKey))
  return sources.filter(source => {
    const key = sourceKey(source.data)
    if (keys.has(key)) return false
    keys.add(key)
    return true
  })
}

export function supplementEvent(item, timing) {
  const category = item.category_name || timing.category
  const start = Number(item.starts_at ?? item.start_timestamp ?? timing.starts_at)
  return {
    name: typeof item.name === 'string' ? item.name : '',
    starts_at: Number.isFinite(start) ? start : 0,
    always_live: Number(timing.always_live) === 1 || Number(item.always_live) === 1 ? 1 : 0,
    categorySlug: typeof category === 'string' ? slugifyCategory(category) : '',
  }
}

export function matchPublishedSupplement(event, listing) {
  if (!listing || event.always_live === 1) return
  return findSupplement(event, event.categorySlug, listing)
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
      statuses.set(key, await fetchJson(`${api}/sources/${encodeURIComponent(key)}`, deadline))
    }
  }))
  return ({ match, sources, timing }) => applySupplementStatus(
    sources, nearbyEvent(timing, now) ? statuses.get(match.stream_key) : undefined,
  )
}
