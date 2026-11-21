import { setTimeout as delay } from 'node:timers/promises'
import { sourceKey } from '../app/utils/sourceIdentity.ts'

const strmfree = {
  path: /^\/embed\/[\w-]+\/[\w-]+\/?$/,
  markers: [/<div id="jwplayer">/, /const _0x\s*=/],
  manifest: strmfreeManifest,
  concurrency: 2,
}

export const probeHosts = new Map([
  ['taifood-blog.asia', {
    path: /^\/embed\/(?:[\w-]+\/\d{4}(?:-\d{2}-\d{2})?\/)?[\w/-]+$/,
    markers: [/<div id="player"\s/, /<meta name="referrer" content="no-referrer"/],
    concurrency: 2,
  }],
  ['strmfree.st', strmfree],
  ['streamfree.top', strmfree],
  ['embed.st', { path: /^\/embed\/admin\/ppv-[\w-]+\/[135]\/?$/, unverified: true }],
])

function registered(url) {
  const parsed = typeof url === 'string' ? URL.parse(url) : null
  if (!parsed || parsed.protocol !== 'https:' || parsed.port || parsed.username || parsed.password) return
  const host = probeHosts.get(parsed.hostname)
  if (host && !host.unverified && host.path.test(parsed.pathname)) return { url: parsed, host }
}

export function nearbyEvent(item, now = Date.now()) {
  const start = Number(item?.starts_at ?? item?.start_timestamp) * 1000
  return Number(item?.always_live) !== 1 && start > 0 && start >= now - 30 * 60_000 && start <= now + 3 * 3600_000
}

export function* sourceUrls(item) {
  const substreams = Array.isArray(item.substreams) ? item.substreams : []
  for (const stream of [item, ...substreams]) {
    if (stream?.iframe) yield stream.iframe
    if (Array.isArray(stream?.sources)) {
      for (const source of stream.sources) yield source?.data
    }
  }
}

export const sourceProbeCap = 40
export const supplementProbeCap = 24

export function candidates(items, now = Date.now(), { limit = sourceProbeCap, exclude } = {}) {
  const unique = new Map()
  for (const item of items) {
    if (!nearbyEvent(item, now)) continue
    for (const raw of sourceUrls(item)) {
      const entry = registered(raw)
      if (!entry) continue
      const key = sourceKey(raw)
      if (!unique.has(key) && !exclude?.has(key)) unique.set(key, entry)
      if (unique.size === limit) return unique
    }
  }
  return unique
}

function failure(tag) {
  throw new Error(tag)
}

async function get(url, label, { signal, headers, type, body = true }) {
  const response = await fetch(url, { redirect: 'manual', headers, signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]) })
    .catch(error => failure(`${label}-${error.name === 'TimeoutError' ? 'timeout' : 'network'}`))
  if (response.status !== 200 && !(label === 'segment' && response.status === 206)) {
    await response.body?.cancel().catch(() => {})
    failure(`${label}-${response.status}`)
  }
  if (type && response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== type) {
    await response.body?.cancel().catch(() => {})
    failure(`${label}-type`)
  }
  if (!body) {
    await response.body?.cancel().catch(() => {})
    return
  }
  let size = 0
  const chunks = []
  try {
    for await (const chunk of response.body) {
      size += chunk.length
      if (size > 1024 * 1024) failure(`${label}-size`)
      chunks.push(chunk)
    }
  } catch (error) {
    failure(error.message === `${label}-size` ? error.message : `${label}-body`)
  }
  return { text: Buffer.concat(chunks).toString(), cookies: response.headers.getSetCookie() }
}

async function strmfreeManifest(embed, url, options) {
  const map = JSON.parse(/const _0x\s*=\s*(\{[^\r\n]+\});/.exec(embed)?.[1] ?? 'null')
  const variant = url.pathname.split('/').filter(Boolean).at(-1)
  const token = map?.[variant]
  const streamKey = /const STREAM_KEY = '([\w-]+)';/.exec(embed)?.[1]
  if (!streamKey || typeof token?._t !== 'string' || !Number.isSafeInteger(token._e)) failure('token-map')
  const { text } = await get(new URL(`/get-stream-key/${streamKey}`, url), 'stream-key', options)
  const metadata = JSON.parse(text)
  if (metadata.is_external) failure('manifest-external')
  const path = { origin: 'live', externalcdn: 'live-externalcdn' }[metadata.server_name || 'origin'] ?? 'live-cdn'
  const manifest = new URL(`/${path}/${variant}/index.m3u8`, url)
  for (const key of ['_t', '_ta', '_e', '_s', '_sa']) manifest.searchParams.set(key, token[key] ?? '')
  return manifest
}

function parseMediaPlaylist(text, manifest) {
  const [header, ...lines] = text.split(/\r?\n/)
  if (header !== '#EXTM3U') failure('manifest-invalid')

  let hasTarget = false
  let needsSegment = false
  let segment
  let sequence
  for (const line of lines) {
    if (!line) continue
    if (line.startsWith('#EXT-X-TARGETDURATION:')) {
      if (hasTarget || !/^#EXT-X-TARGETDURATION:[1-9]\d*$/.test(line)) failure('manifest-invalid')
      hasTarget = true
    } else if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
      const value = line.slice('#EXT-X-MEDIA-SEQUENCE:'.length)
      if (sequence !== undefined || segment || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
        failure('manifest-invalid')
      }
      sequence = Number(value)
    } else if (line.startsWith('#EXTINF:')) {
      if (needsSegment || !/^#EXTINF:\d+(?:\.\d*)?,/.test(line)) failure('manifest-invalid')
      needsSegment = true
    } else if (!line.startsWith('#')) {
      const uri = !/[\s<>"\u0000-\u001f]/.test(line) && URL.parse(line, manifest)
      if (!needsSegment || !uri || !['https:', 'http:'].includes(uri.protocol)) failure('manifest-invalid')
      segment ??= uri
      needsSegment = false
    }
  }
  if (!hasTarget || !segment || needsSegment) failure('manifest-invalid')
  return { segment, sequence }
}

export async function probeSource(url, { signal = new AbortController().signal, observe = () => {} } = {}) {
  const entry = registered(url)
  if (!entry) return
  const result = { embedOk: false, manifestOk: false, sequence: 'unknown', checkedAt: new Date().toISOString() }
  try {
    const embed = await get(entry.url, 'embed', { signal })
    if (!entry.host.markers.every(marker => marker.test(embed.text))) failure('embed-markers')
    result.embedOk = true
    observe('embed', 'HTTP 200, expected markers present')
    if (!entry.host.manifest) failure('manifest-unverified')
    const headers = { referer: entry.url.href }
    const cookie = embed.cookies.map(value => value.split(';')[0]).join('; ')
    if (cookie) headers.cookie = cookie
    const options = { signal, headers }
    const manifest = await entry.host.manifest(embed.text, entry.url, options)
    observe('token', `parsed signed map entry for ${manifest.pathname}`)
    const sample = async () => {
      const { text } = await get(manifest, 'manifest', { ...options, type: 'application/vnd.apple.mpegurl' })
      return parseMediaPlaylist(text, manifest)
    }
    const { sequence: first } = await sample()
    result.manifestOk = true
    if (first === undefined) failure('sequence-missing')
    observe('manifest', `HTTP 200 application/vnd.apple.mpegurl, #EXT-X-MEDIA-SEQUENCE:${first}`)
    await delay(6000, undefined, { signal })
    result.manifestOk = false
    const { sequence: next, segment } = await sample()
    result.manifestOk = true
    if (next === undefined) failure('sequence-missing')
    observe('manifest', `HTTP 200 application/vnd.apple.mpegurl, #EXT-X-MEDIA-SEQUENCE:${next}`)
    if (next < first) failure('sequence-reset')
    result.sequence = next > first ? 'advancing' : 'frozen'
    if (segment.protocol === 'https:' && !segment.port && !segment.username && !segment.password &&
        (segment.origin === manifest.origin || segment.hostname.endsWith('.ttcdn-us.com'))) {
      const start = performance.now()
      await get(segment, 'segment', { signal, headers: { range: 'bytes=0-0' }, body: false })
      result.segmentMs = Math.round(performance.now() - start)
    }
  } catch (error) {
    if (signal.aborted) return
    result.error = /^[a-z][a-z\d-]{1,31}$/.test(error.message) ? error.message : 'manifest-parse'
  }
  return result
}

export async function collectSourceHealth(entries, timeoutMs, supplements = new Map()) {
  if ((!entries.size && !supplements.size) || timeoutMs < 3000) return {}
  const signal = AbortSignal.timeout(Math.floor(timeoutMs))
  const queues = new Map()
  for (const [sources, side] of [[entries, 'primary'], [supplements, 'supplement']]) {
    for (const [key, entry] of sources) {
      const hostname = entry.url.hostname
      if (!queues.has(hostname)) queues.set(hostname, { host: entry.host, primary: [], supplement: [] })
      queues.get(hostname)[side].push([key, entry.url.href])
    }
  }
  const health = {}
  await Promise.all([...queues.values()].flatMap(({ host, primary, supplement }) => {
    // Alternate within each host so neither side has to wait for the other queue to drain.
    const entries = []
    for (let index = 0; index < Math.max(primary.length, supplement.length); index++) {
      if (primary[index]) entries.push(primary[index])
      if (supplement[index]) entries.push(supplement[index])
    }
    const queue = entries.values()
    return Array.from({ length: host.concurrency }, async () => {
      for (const [key, url] of queue) {
        if (signal.aborted) break
        const result = await probeSource(url, { signal })
        if (result) health[key] = result
      }
    })
  }))
  return health
}
