import { enrichScoreboards, scoreboardEligible } from './scoreboard.mjs'
import { createHash, randomBytes } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadEnvFile } from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { parseArgs } from 'node:util'
import { candidates, collectSourceHealth, nearbyEvent, supplementProbeCap } from './probe-source-health.mjs'
import {
  dedupePublishedSources, fetchPitSportListing, fetchSupplementListing, fetchSupplementStatuses, matchPublishedSupplement,
  fetchZliveListing, matchZliveSources, publishedSupplementSources, supplementEvent,
} from './publish-supplements.mjs'
import { AwsClient } from 'aws4fetch'
import { feedDetailPath, isSnapshotPath } from '../server/utils/feed-path.ts'

// Collection starts after the publisher pins the manifest ETag.
// For an upstream failure, run with --provider-status
// 429 [--retry-after VALUE], or --provider-status blocked, instead of publishing.
// Set R2_BUCKET alongside the R2_* credential variables to identify their scope.
const previewBucket = 'kwip-feed-preview'
const buckets = [previewBucket, 'kwip-feed-prod']
const runLimitMs = 230_000
const stateReserveMs = 20_000
const probeBudgetMs = 30_000
const packReserveMs = 10_000
const providerGapMs = 250
const providerRequestLimit = 400
const fileLimit = 2 * 1024 ** 2
const snapshotLimit = 40 * 1024 ** 2
const manifestKey = 'current.json'
const stateKey = 'collector-state.json'
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const json = (value) => Buffer.from(JSON.stringify(value))
const precondition = (object) => object ? { 'If-Match': object.etag } : { 'If-None-Match': '*' }

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}'
  }
  return JSON.stringify(value)
}

function validateSources(value) {
  if (!value || typeof value !== 'object') return
  if ('sources' in value) {
    if (!Array.isArray(value.sources)) throw new Error('Invalid sources')
    for (const source of value.sources) validateSource(source)
  }
  if (value.source != null) validateSource(value.source)
  if (value.iframe) validateSource({ data: value.iframe })
  for (const child of Object.values(value)) validateSources(child)
}

function validateSource(source) {
  const url = typeof source?.data === 'string' ? URL.parse(source.data) : null
  if (!url || !['https:', 'http:'].includes(url.protocol)) throw new Error('Invalid source URL')
}

class ProviderError extends Error {
  constructor(response) {
    super(`Provider returned HTTP ${response.status}`)
    this.status = response.status
    this.retryAfter = response.headers.get('retry-after')
  }
}

function timeLeft(deadline, message) {
  const remaining = Math.floor(deadline - performance.now())
  if (remaining <= 0) throw new Error(message)
  return remaining
}

async function fetchProvider(base, path, run, deadline, bytesRemaining) {
  if (run.result.providerRequests >= providerRequestLimit) throw new Error('Provider request cap exceeded')
  while (performance.now() < run.nextRequestAt) {
    const gap = Math.ceil(run.nextRequestAt - performance.now())
    if (gap >= timeLeft(deadline, 'Collection deadline exceeded')) throw new Error('Collection deadline exceeded')
    await delay(gap)
  }
  const signal = AbortSignal.timeout(Math.min(15_000, timeLeft(deadline, 'Collection deadline exceeded')))
  const urlPath = path.split('/').map(encodeURIComponent).join('/')
  run.result.providerRequests++
  let response
  try {
    response = await fetch(base + '/' + urlPath, { signal, redirect: 'manual' })
  } finally {
    // Schedule from response headers to keep even network-delayed arrivals spaced.
    run.nextRequestAt = performance.now() + providerGapMs
  }
  if (!response.ok) {
    const error = new ProviderError(response)
    await response.body?.cancel().catch(() => {})
    throw error
  }

  let length = 0
  const chunks = []
  for await (const chunk of response.body) {
    length += chunk.length
    if (length > fileLimit) throw new Error(`Provider file exceeded 2 MiB for ${path}`)
    if (length >= bytesRemaining) throw new Error('Snapshot reached 40 MiB')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks, length)
}

async function collectFeed(base, directory, current, result, deadline, fixture) {
  const run = { result, nextRequestAt: 0 }
  const entries = []
  const hashes = {}
  const details = new Map()
  let size = 0
  const eventTimes = new Map()
  const supplementEvents = []
  const probeItems = []
  const matches = []
  const scoreRecords = []
  let streamListing
  const scoreChanged = new Set()
  const supplementListing = fixture ? undefined : fetchSupplementListing(deadline)
  const pitSportListing = fixture ? undefined : fetchPitSportListing(deadline)
  const zliveListing = fixture ? undefined : fetchZliveListing(deadline)
  if (!fixture) result.scores = { leagues: 0, requests: 0, matched: 0, unmatched: 0 }
  const now = Date.now()

  async function append(path, bytes) {
    if (size + bytes.length >= snapshotLimit) throw new Error('Snapshot reached 40 MiB')
    const endpoint = { path, offset: size, length: bytes.length }
    size += bytes.length
    let stored = bytes
    if (directory) {
      stored = join(directory, String(entries.length))
      await writeFile(stored, bytes, { flag: 'wx' })
    }
    entries.push({ endpoint, stored })
  }

  async function read(path) {
    const bytes = await fetchProvider(base, path, run, deadline, snapshotLimit - size)
    const payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    if (payload?.success !== true) throw new Error(`Unsuccessful payload for ${path}`)
    validateSources(payload)
    await append(path, bytes)
    return { payload, bytes }
  }

  for (const collection of ['streams', 'vods']) {
    const { payload } = await read(collection)
    if (collection === 'streams') streamListing = { payload, entry: entries.at(-1) }
    const { timestamp, performance, ...content } = payload
    hashes[collection] = sha256(canonical(content))
    if (!Array.isArray(payload[collection])) throw new Error(`Invalid ${collection} list`)
    const count = details.size
    for (const category of payload[collection]) {
      if (!Array.isArray(category?.[collection])) throw new Error(`Invalid ${collection} category`)
      for (const item of category[collection]) {
        const path = feedDetailPath(collection, collection === 'vods' ? item?.slug ?? item?.uri_name : item?.uri_name)
        if (!path) throw new Error('Invalid detail path')
        if (!Number.isSafeInteger(item.id) && !(typeof item.id === 'string' && /^\d+$/.test(item.id))) {
          throw new Error(`Invalid list ID for ${path}`)
        }
        const id = String(item.id)
        if (details.has(path) && details.get(path) !== id) throw new Error(`Conflicting list IDs for ${path}`)
        details.set(path, id)
        if (collection === 'streams') {
          eventTimes.set(path, {
            category: item.category_name || category.category,
            starts_at: item.starts_at ?? item.start_timestamp, always_live: item.always_live ?? category.always_live,
          })
        }
      }
    }
    if (details.size === count) throw new Error(`Empty ${collection} list`)
  }

  const [listing, pitSport, zlive] = await Promise.all([supplementListing, pitSportListing, zliveListing])
  if (zlive) result.zlive = { matched: 0, unmatched: 0, admittedEvents: 0, admittedSources: 0 }
  // Older manifests lack detail metadata. A nonempty listing requires one full refresh to populate it.
  const publishedEvents = current?.supplementEvents
  const needsDetails = [...eventTimes.values()].some(item => nearbyEvent(item, now))
    || publishedEvents?.some(event => nearbyEvent(event, now)
      || matchPublishedSupplement(event, listing) || matchPublishedSupplement(event, pitSport)
      || (zlive?.byName.size && event.always_live === 1
        && (!event.channelSlug || matchZliveSources(event, zlive).length)))
    || (!publishedEvents && (listing?.streams.length || pitSport?.streams.length || zlive?.byName.size))
  const needsScores = !fixture && streamListing.payload.streams.some(category => category.streams.some(item =>
    scoreboardEligible({ ...item, always_live: Number(item.always_live ?? category.always_live) })))
  if (current && !needsScores && !current.hasSupplements && !needsDetails && ['streams', 'vods'].every((key) => hashes[key] === current.hashes[key]) &&
      current.endpoints.length === details.size + 2 &&
      current.endpoints.every(({ path }) => path === 'streams' || path === 'vods' || details.has(path))) {
    if (zlive) result.zlive.unmatched = publishedEvents?.filter(event => event.always_live === 1).length ?? 0
    return { unchanged: true }
  }
  if (result.providerRequests + details.size > providerRequestLimit) {
    throw new Error(`Complete snapshot needs more than ${providerRequestLimit} provider requests`)
  }

  const supplementDeadline = deadline - probeBudgetMs - packReserveMs
  const detailHashes = []
  for (const path of [...details.keys()].sort()) {
    const { payload, bytes } = await read(path)
    if (String(payload.data?.id) !== details.get(path)) throw new Error(`Mismatched detail ID for ${path}`)
    const hash = [path, sha256(bytes)]
    detailHashes.push(hash)
    const timing = eventTimes.get(path)
    if (timing) {
      const item = payload.data
      scoreRecords.push({ payload, entry: entries.at(-1), hash, item: {
        ...item, always_live: Number(timing.always_live) === 1 || Number(item.always_live) === 1 ? 1 : 0,
        starts_at: item.starts_at ?? item.start_timestamp ?? timing.starts_at,
      } })
      const event = supplementEvent(item, timing)
      if (zlive?.byName.size && event.always_live === 1) event.channelSlug = path.split('/').at(-1)
      supplementEvents.push(event)
      const probeItem = { ...event, iframe: item.iframe, sources: item.sources, substreams: item.substreams }
      if (!fixture) probeItems.push(probeItem)
      const zliveMatch = matchZliveSources(event, zlive)
      if (zlive && event.always_live === 1) result.zlive[zliveMatch.length ? 'matched' : 'unmatched']++
      const isPrimary = source => source.data && !['supplement', 'pitsport', 'zlive'].includes(source.origin)
      const hasPrimary = zliveMatch.length && (item.sources?.some(isPrimary)
        || (Array.isArray(item.substreams) && item.substreams.some(stream => stream?.sources?.length
          ? stream.sources.some(isPrimary) : stream?.iframe)))
      const zliveSources = hasPrimary ? matchZliveSources(event, zlive, item) : []
      if (performance.now() >= supplementDeadline) continue
      const match = matchPublishedSupplement(event, listing)
      const sources = match ? publishedSupplementSources(item, match) : []
      const pitSportSources = matchPublishedSupplement(event, pitSport)?.sources ?? []
      if (sources.length || pitSportSources.length || zliveSources.length) {
        matches.push({ match, sources, pitSportSources, zliveSources, timing: probeItem, payload, entry: entries.at(-1), hash })
      }
    }
  }
  const statusMatches = matches.filter(({ sources }) => sources.length)
  const withStatus = statusMatches.length ? await fetchSupplementStatuses(statusMatches, now,
    Math.min(performance.now() + 5_000, supplementDeadline)) : undefined
  const primaryProbes = candidates(probeItems, now)
  const supplementProbes = new Map()
  const eligibleSupplementKeys = new Set()
  // Reserve the largest serialized record for each queued key before admitting sources.
  const maxHealthRecordBytes = json({
    embedOk: false, manifestOk: false, sequence: 'advancing',
    checkedAt: '+999999-12-31T23:59:59.999Z', segmentMs: Number.MAX_SAFE_INTEGER, error: 'x'.repeat(32),
  }).length
  const recordReserve = key => json(key).length + maxHealthRecordBytes + 2
  let healthReserve = [...primaryProbes.keys()].reduce((size, key) => size + recordReserve(key), 1)
  let hasSupplements = false
  // Give existing supplements first use of the shared admission and probe budgets.
  const admissions = [
    ...statusMatches.map(match => ({ ...match, supplements: withStatus(match) })),
    ...matches.filter(({ pitSportSources }) => pitSportSources.length)
      .map(match => ({ ...match, supplements: match.pitSportSources })),
    ...matches.filter(({ zliveSources }) => zliveSources.length)
      .map(match => ({ ...match, supplements: match.zliveSources })),
  ]
  for (const [index, { payload, entry, timing, hash, supplements: incoming }] of admissions.entries()) {
    if (performance.now() >= supplementDeadline) {
      result.supplementAdmissionSkippedEvents = admissions.length - index
      break
    }
    const supplements = dedupePublishedSources(payload.data, incoming)
    if (!supplements.length) continue
    const eligible = candidates([{
      starts_at: timing.starts_at, always_live: timing.always_live, sources: supplements,
    }],
      now, { limit: Infinity, exclude: primaryProbes })
    const available = supplementProbeCap - supplementProbes.size
    const pending = new Map()
    for (const [key, source] of eligible) {
      if (pending.size === available) break
      if (!supplementProbes.has(key)) pending.set(key, source)
    }
    const nextReserve = [...pending.keys()].reduce((size, key) => size + recordReserve(key), healthReserve)
    const sources = [...(payload.data.sources ?? []), ...supplements]
    const bytes = json({ ...payload, data: { ...payload.data, sources } })
    const delta = bytes.length - entry.endpoint.length
    if (performance.now() >= supplementDeadline) {
      result.supplementAdmissionSkippedEvents = admissions.length - index
      break
    }
    const hasProbes = primaryProbes.size || supplementProbes.size || pending.size
    if (bytes.length > fileLimit || size + delta + (hasProbes ? nextReserve : 0) >= snapshotLimit) continue
    payload.data.sources = sources
    entry.stored = bytes
    entry.endpoint.length = bytes.length
    size += delta
    hash[1] = sha256(bytes)
    for (const key of eligible.keys()) eligibleSupplementKeys.add(key)
    for (const [key, source] of pending) supplementProbes.set(key, source)
    if (supplements[0].origin === 'zlive') {
      result.zlive.admittedEvents++
      result.zlive.admittedSources += supplements.length
    }
    healthReserve = nextReserve
    hasSupplements = true
  }
  if (!fixture) {
    result.scores = await enrichScoreboards(scoreRecords.map(record => record.item), {
      deadline: Math.min(performance.now() + 8_000, deadline - probeBudgetMs - packReserveMs),
      maxRequests: providerRequestLimit - result.providerRequests,
      onRequest: () => result.providerRequests++,
    })
    const byPath = new Map(scoreRecords.map(record => [record.entry.endpoint.path, record.item.match]))
    for (const record of scoreRecords) {
      if (record.payload.data.match !== undefined || record.item.match) scoreChanged.add(record)
      delete record.payload.data.match
      if (record.item.match) record.payload.data.match = record.item.match
    }
    for (const category of streamListing.payload.streams) {
      for (const item of category.streams) {
        if (item.match !== undefined) scoreChanged.add(streamListing)
        delete item.match
        const match = byPath.get(feedDetailPath('streams', item.uri_name))
        if (match) { item.match = match; scoreChanged.add(streamListing) }
      }
    }
    for (const { payload, entry, hash } of scoreChanged) {
      const bytes = json(payload)
      if (bytes.length > fileLimit) throw new Error('Score enrichment exceeded file limit')
      size += bytes.length - entry.endpoint.length
      if (size >= snapshotLimit) throw new Error('Snapshot reached 40 MiB')
      entry.stored = bytes
      entry.endpoint.length = bytes.length
      if (hash) hash[1] = sha256(bytes)
    }
  }
  hashes.details = sha256(json(detailHashes))

  if (primaryProbes.size || supplementProbes.size) {
    const health = await collectSourceHealth(primaryProbes,
      Math.min(probeBudgetMs, deadline - performance.now() - packReserveMs), supplementProbes)
    const completed = key => Object.hasOwn(health, key)
    result.probes = {
      primary: { queued: primaryProbes.size, deadlineDropped: primaryProbes.size - [...primaryProbes.keys()].filter(completed).length },
      supplement: {
        queued: supplementProbes.size,
        capExcluded: eligibleSupplementKeys.size - supplementProbes.size,
        deadlineDropped: supplementProbes.size - [...supplementProbes.keys()].filter(completed).length,
      },
    }
    const healthBytes = json(health)
    if (size + healthBytes.length < snapshotLimit) await append('health.json', healthBytes)
  }
  const bytes = Buffer.alloc(size)
  let offset = 0
  for (const { endpoint, stored } of entries) {
    endpoint.offset = offset
    offset += endpoint.length
    timeLeft(deadline, 'Collection deadline exceeded')
    const data = typeof stored === 'string' ? await readFile(stored) : stored
    data.copy(bytes, endpoint.offset)
  }
  timeLeft(deadline, 'Collection deadline exceeded')
  return { snapshot: {
    bytes, size, endpoints: entries.map(({ endpoint }) => endpoint), hashes,
    hasSupplements, supplementEvents,
  } }
}

async function credentials(bucket, filename) {
  const env = process.env
  if (!filename && env.R2_BUCKET === bucket) {
    return {
      accountId: env.R2_ACCOUNT_ID,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      endpoint: env.R2_ENDPOINT,
    }
  }
  let file
  try {
    file = JSON.parse(await readFile(filename ?? '.r2-credentials.json', 'utf8'))
  } catch (error) {
    if (filename || error.code !== 'ENOENT') throw error
    return undefined
  }
  const selected = Object.hasOwn(file, 'bucket') ? file : file[bucket]
  if (selected?.bucket !== bucket) throw new Error(`Credential file bucket does not match ${bucket}`)
  return selected
}

function storage(bucket, config, result, deadline) {
  const { accountId, accessKeyId, secretAccessKey, endpoint } = config
  const url = URL.parse(endpoint)
  if (!/^[a-f0-9]{32}$/i.test(accountId ?? '') || !accessKeyId || !secretAccessKey ||
      !url || url.protocol !== 'https:' || url.host !== `${accountId.toLowerCase()}.r2.cloudflarestorage.com` ||
      url.pathname !== '/' || url.username || url.password || url.search || url.hash) {
    throw new Error('Invalid bucket-scoped R2 credentials or endpoint')
  }
  const aws = new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'auto', retries: 0 })

  async function request(method, key, options = {}) {
    const remaining = timeLeft(deadline, 'R2 deadline exceeded')
    const signed = await aws.sign(new URL(`/${bucket}/${key}`, url), {
      method, redirect: 'error', signal: AbortSignal.timeout(Math.min(15_000, remaining)),
      aws: { allHeaders: true }, ...options,
    })
    result.requests++
    return fetch(signed)
  }

  async function get(key) {
    // Compressed R2 responses can carry weak ETags, which fail If-Match.
    const response = await request('GET', key, { headers: { 'Accept-Encoding': 'identity' } })
    if (response.status === 404) {
      const body = await response.text()
      if (body.includes('<Code>NoSuchKey</Code>')) return null
      throw new Error(`R2 could not resolve ${key} (HTTP 404)`)
    }
    if (!response.ok) throw new Error(`R2 GET ${key}: HTTP ${response.status}`)
    const etag = response.headers.get('etag')
    if (!etag || !/^"[\x21\x23-\x7e\x80-\xff]*"$/.test(etag)) {
      throw new Error(`R2 returned an invalid strong ETag for ${key}`)
    }
    return { etag, bytes: Buffer.from(await response.arrayBuffer()) }
  }

  async function put(key, body, original, contentType = 'application/json') {
    let ambiguous = false
    const expectedHash = sha256(body)
    const headers = { ...precondition(original), 'Content-Type': contentType }
    for (let attempt = 0; attempt < 2; attempt++) {
      let response
      try {
        response = await request('PUT', key, { headers, body })
      } catch {
        ambiguous = true
      }
      if (response?.ok) return true
      // A retry can return a precondition error after the original request committed.
      if (response?.status === 412 && !ambiguous) return false
      if (response && response.status < 500 && ![408, 409, 412].includes(response.status)) {
        throw new Error(`R2 PUT ${key}: HTTP ${response.status}`)
      }
      ambiguous = true
      let observed
      try {
        observed = await get(key)
      } catch {
        throw new Error(`Unknown R2 PUT outcome for ${key}`)
      }
      if (observed?.bytes.length === body.length && sha256(observed.bytes) === expectedHash) return true
      if (observed && key === manifestKey) {
        const actual = parseObject(observed)
        const expected = JSON.parse(body)
        if (actual.commitId === expected.commitId && canonical(actual) === canonical(expected)) return true
      }
      if (observed?.etag !== original?.etag) return false
    }
    throw new Error(`Unknown R2 PUT outcome for ${key}`)
  }

  return { get, put }
}

function parseObject(object) {
  if (!object) return null
  const parsed = JSON.parse(object.bytes)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid R2 JSON object')
  return parsed
}

function validateManifest(manifest) {
  const id = '[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}'
  const payloadId = new RegExp(`^snapshots/(${id})\\.bin$`).exec(manifest.payloadKey)?.[1]
  if (manifest.schema !== 1 || !new RegExp(`^${id}$`).test(manifest.commitId) ||
      !payloadId || (manifest.payloadId !== undefined && manifest.payloadId !== payloadId) ||
      !['streams', 'vods', 'details'].every((key) => /^[a-f0-9]{64}$/.test(manifest.hashes?.[key])) ||
      !['publishedAt', 'listsVerifiedAt', 'detailsVerifiedAt'].every((key) => Number.isFinite(Date.parse(manifest[key]))) ||
      !Array.isArray(manifest.endpoints) || !Number.isSafeInteger(manifest.size) ||
      manifest.size <= 0 || manifest.size >= snapshotLimit) {
    throw new Error('Invalid current snapshot manifest')
  }
  let end = 0
  const paths = new Set()
  for (const endpoint of manifest.endpoints) {
    const { path, offset, length } = endpoint
    if (typeof path !== 'string' || !isSnapshotPath(path) || paths.has(path) ||
        offset !== end || !Number.isSafeInteger(length) || length <= 0 || length > fileLimit) {
      throw new Error('Invalid endpoint in current snapshot manifest')
    }
    end += length
    paths.add(path)
  }
  if (end !== manifest.size || !paths.has('streams') || !paths.has('vods')) {
    throw new Error('Invalid endpoint coverage in current snapshot manifest')
  }
  if (manifest.supplementEvents !== undefined && (!Array.isArray(manifest.supplementEvents)
    || !manifest.supplementEvents.every(event => typeof event?.name === 'string' && Number.isFinite(event.starts_at)
      && (event.always_live === 0 || event.always_live === 1) && typeof event.categorySlug === 'string'
      && (event.channelSlug === undefined || typeof event.channelSlug === 'string')))) {
    throw new Error('Invalid supplement events in current snapshot manifest')
  }
  return payloadId
}

function retryTime(retryAfter) {
  const now = Date.now()
  const value = retryAfter?.trim() ?? ''
  let parsed = NaN
  if (/^\d+$/.test(value)) {
    parsed = now + Number(value) * 1000
  } else {
    const date = new Date(value)
    if (date.toUTCString() === value) parsed = date.getTime()
  }
  const time = new Date(Math.max(now, parsed))
  return Number.isFinite(time.getTime()) ? time.toISOString() : new Date(now + 30 * 60_000).toISOString()
}

async function updateState(r2, original, patch, deadline) {
  while (performance.now() < deadline) {
    const state = parseObject(original) ?? {}
    const merged = { ...state, ...patch }
    if (state.paused === true || patch.paused === true) merged.paused = true
    if ((Date.parse(state.retryNotBefore) || 0) > (Date.parse(patch.retryNotBefore) || 0)) {
      merged.retryNotBefore = state.retryNotBefore
    }
    if (await r2.put(stateKey, json(merged), original)) return
    original = await r2.get(stateKey)
    // The manifest decides which publisher owns the bookkeeping after a race.
    if (patch.lastCommit && parseObject(await r2.get(manifestKey))?.commitId !== patch.lastCommit) return
  }
  throw new Error('Collector state update deadline exceeded')
}

async function persistProviderStatus(r2, stateObject, status, retryAfter, dryRun, deadline) {
  const patch = status === 'blocked' ? { paused: true } : { retryNotBefore: retryTime(retryAfter) }
  if (!dryRun) await updateState(r2, stateObject, patch, deadline)
  return patch.paused ? 'paused' : 'backoff'
}

function configuredFeedUrl() {
  try {
    loadEnvFile()
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const url = URL.parse(process.env.NUXT_PUBLIC_FEED_BASE ?? '')
  if (!url || !['http:', 'https:'].includes(url.protocol) || url.search || url.hash) {
    throw new Error('Missing or invalid external feed URL')
  }
  return url
}

function isFixtureBase(url) {
  return /\/fixtures\/?$/.test(url.pathname)
}

async function collectSnapshot(current, result, deadline, dryRun, url = configuredFeedUrl()) {
  const directory = dryRun ? undefined : await mkdtemp(join(tmpdir(), 'kwip-publish-'))
  const started = performance.now()
  try {
    return await collectFeed(url.href.replace(/\/+$/, ''), directory, current, result, deadline, isFixtureBase(url))
  } finally {
    result.durations.collectionMs = Math.round(performance.now() - started)
    if (directory) await rm(directory, { recursive: true, force: true })
  }
}

async function publish(result, deadline) {
  const { values } = parseArgs({ options: {
    bucket: { type: 'string', default: previewBucket },
    'check-freshness': { type: 'boolean' },
    'credentials-file': { type: 'string' },
    'dry-run': { type: 'boolean' },
    'provider-status': { type: 'string' },
    'retry-after': { type: 'string' },
  } })
  const { bucket, 'dry-run': dryRun, 'provider-status': providerStatus, 'retry-after': retryAfter } = values
  if (values['check-freshness'] && (dryRun || providerStatus !== undefined || retryAfter !== undefined)) {
    throw new Error('--check-freshness cannot be combined with --dry-run, --provider-status or --retry-after')
  }
  if (values['check-freshness']) delete result.commitId
  if (!buckets.includes(bucket)) throw new Error('Unknown snapshot bucket')
  if (providerStatus !== undefined && !['429', 'blocked'].includes(providerStatus)) throw new Error('Invalid provider status')
  if (retryAfter !== undefined && providerStatus !== '429') throw new Error('--retry-after requires --provider-status 429')
  const dryRunFeed = dryRun && !providerStatus ? configuredFeedUrl() : undefined
  const config = dryRunFeed && isFixtureBase(dryRunFeed)
    ? undefined : await credentials(bucket, values['credentials-file'])
  if (!config && !dryRun) throw new Error(`Missing bucket-scoped credentials for ${bucket}`)
  const publicationDeadline = deadline - stateReserveMs
  const r2 = config && storage(bucket, config, result, publicationDeadline)
  if (values['check-freshness']) {
    if (!r2) throw new Error('Missing R2 credentials for freshness check')
    const current = parseObject(await r2.get(manifestKey))
    if (!current) return 'missing'
    validateManifest(current)
    result.commitId = current.commitId
    result.listsVerifiedAtAgeMs = Date.now() - Date.parse(current.listsVerifiedAt)
    return result.listsVerifiedAtAgeMs > 45 * 60_000 ? 'stale' : 'fresh'
  }
  const stateStorage = config && storage(bucket, config, result, deadline)
  const stateObject = await r2?.get(stateKey)
  const state = parseObject(stateObject) ?? {}

  if (providerStatus) {
    return persistProviderStatus(stateStorage, stateObject, providerStatus, retryAfter, dryRun, deadline)
  }
  if (state.paused === true) return 'paused'
  if (Date.parse(state.retryNotBefore) > Date.now()) return 'backoff'

  const currentObject = await r2?.get(manifestKey)
  const current = parseObject(currentObject)
  const currentPayloadId = current ? validateManifest(current) : undefined
  let collected
  try {
    collected = await collectSnapshot(current, result, publicationDeadline, dryRun, dryRunFeed)
    timeLeft(publicationDeadline, 'Collection deadline exceeded')
  } catch (error) {
    if (error instanceof ProviderError) {
      result.providerStatus = error.status
      // Only forward the two Retry-After wire formats to public alerts.
      if (/^(?:[0-9]{1,12}|[A-Z][a-z]{2}, [0-9]{2} [A-Z][a-z]{2} [0-9]{4} [0-9]{2}:[0-9]{2}:[0-9]{2} GMT)$/.test(error.retryAfter ?? '')) {
        result.retryAfter = error.retryAfter
      }
      if ([429, 403, 451].includes(error.status)) {
        return persistProviderStatus(stateStorage, stateObject, error.status === 429 ? '429' : 'blocked',
          error.retryAfter, dryRun, deadline)
      }
    }
    throw error
  }
  const { unchanged, snapshot } = collected
  const now = new Date().toISOString()
  const manifest = unchanged
    ? { ...current, commitId: result.commitId, payloadId: currentPayloadId, listsVerifiedAt: now }
    : {
        schema: 1, commitId: result.commitId, payloadId: result.commitId, payloadKey: `snapshots/${result.commitId}.bin`,
        size: snapshot.size, hashes: snapshot.hashes, publishedAt: now,
        ...(snapshot.hasSupplements ? { hasSupplements: true } : {}),
        supplementEvents: snapshot.supplementEvents,
        listsVerifiedAt: now, detailsVerifiedAt: now, endpoints: snapshot.endpoints,
      }

  let body = json(manifest)
  if (!unchanged && body.length > fileLimit) {
    // Readers limit the manifest to 2 MiB. Oversized detail metadata is optional.
    delete manifest.supplementEvents
    body = json(manifest)
  }
  result.bytes = { snapshot: manifest.size, manifest: body.length, payloadPut: 0 }
  if (dryRun) {
    result.dryRun = true
    result.manifest = manifest
  } else {
    const putStarted = performance.now()
    if (!unchanged) {
      result.bytes.payloadPut = snapshot.size
      if (!(await r2.put(manifest.payloadKey, snapshot.bytes, null, 'application/octet-stream'))) return 'conflict'
    }
    if (!(await r2.put(manifestKey, body, currentObject))) return 'conflict'
    result.durations.commitMs = Math.round(performance.now() - putStarted)

    try {
      await updateState(stateStorage, stateObject, { lastCommit: manifest.commitId, hashes: manifest.hashes }, deadline)
    } catch (error) {
      result.manifestCommitted = true
      throw new Error(`Manifest committed but collector state update failed: ${error.message}`)
    }
  }
  return unchanged ? 'unchanged' : 'published'
}

const started = performance.now()
const commitTime = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
const result = {
  commitId: `${commitTime}-${randomBytes(4).toString('hex')}`,
  outcome: 'failed', requests: 0, providerRequests: 0, bytes: { snapshot: 0, manifest: 0, payloadPut: 0 }, durations: {},
}
try {
  result.outcome = await publish(result, started + runLimitMs)
} catch (error) {
  result.error = error.code === 'ENOENT' ? 'A required snapshot file is missing' : error.message
}
result.durations.totalMs = Math.round(performance.now() - started)
console.log(JSON.stringify(result))
process.exitCode = ['failed', 'paused'].includes(result.outcome) ? 1 : 0
