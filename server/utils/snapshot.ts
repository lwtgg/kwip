import { feedDetailPath, isSnapshotPath, type FeedCollection } from './feed-path.ts'

import type { SnapshotHealth } from '../../app/utils/snapshotHealth.ts'

interface ByteRange {
  offset: number
  length: number
}

export interface SnapshotBucket {
  get(key: string, options?: { range: ByteRange }): Promise<{
    size: number
    etag: string
    body: ReadableStream
    arrayBuffer(): Promise<ArrayBuffer>
  } | null>
}

const commitPattern = /^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}$/
const payloadPattern = /^snapshots\/([0-9]{8}T[0-9]{6}Z-[0-9a-f]{8})\.bin$/
const fileLimit = 2 * 1024 ** 2
const snapshotLimit = 40 * 1024 ** 2
const decoder = new TextDecoder('utf-8', { fatal: true })

function invalid(): never {
  throw new Error('Unreadable feed snapshot')
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid()
  return value as Record<string, unknown>
}

function parseManifest(value: unknown) {
  const { schema, commitId, payloadKey, payloadId: declaredPayloadId, size, endpoints, listsVerifiedAt, detailsVerifiedAt, publishedAt } = record(value)
  if (schema !== 1 || typeof commitId !== 'string' || !commitPattern.test(commitId) ||
      typeof payloadKey !== 'string' || typeof size !== 'number' || !Number.isSafeInteger(size) ||
      size <= 0 || size >= snapshotLimit || !Array.isArray(endpoints)) return invalid()

  const payloadId = payloadPattern.exec(payloadKey)?.[1]
  const dates = [publishedAt, listsVerifiedAt, detailsVerifiedAt]
  if (!payloadId || dates.some(date => typeof date !== 'string' || !Number.isFinite(Date.parse(date)))) return invalid()
  // Older schema-1 manifests already encode the immutable ID in their object key.
  if (declaredPayloadId !== undefined && declaredPayloadId !== payloadId) return invalid()

  const ranges = new Map<string, ByteRange>()
  let end = 0
  for (const entry of endpoints) {
    const { path, offset, length } = record(entry)
    if (typeof path !== 'string' || !isSnapshotPath(path) || ranges.has(path) || offset !== end ||
        typeof length !== 'number' || !Number.isSafeInteger(length) ||
        length <= 0 || length > fileLimit || end + length > size) return invalid()
    ranges.set(path, { offset: end, length })
    end += length
  }
  if (end !== size) return invalid()
  return { commitId, payloadId, payloadKey, size, ranges }
}

type SnapshotPayload = Record<string, unknown> & { success: true }

function sourceUrl(value: unknown) {
  const url = typeof value === 'string' ? URL.parse(value) : null
  if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:')) invalid()
}

function validateItemSources(item: Record<string, unknown>) {
  if (item.iframe) sourceUrl(item.iframe)
  if (item.source != null) sourceUrl(record(item.source).data)
  if (item.sources !== undefined) {
    if (!Array.isArray(item.sources)) invalid()
    for (const entry of item.sources) {
      const source = record(entry)
      if (typeof source.name !== 'string' || (source.type !== 'link' && source.type !== 'iframe')) invalid()
      sourceUrl(source.data)
    }
  }
  if (item.substreams !== undefined) {
    if (!Array.isArray(item.substreams)) invalid()
    for (const entry of item.substreams) {
      const substream = record(entry)
      if (typeof substream.name !== 'string') invalid()
      validateItemSources(substream)
    }
  }
}

function validateDisplayFields(kind: string, item: Record<string, unknown>) {
  if (typeof item.name !== 'string') invalid()
  for (const key of ['tag', 'source_tag', 'category_name', 'blurhash', 'poster']) {
    if (item[key] != null && typeof item[key] !== 'string') invalid()
  }
  if (item.colors != null && (!Array.isArray(item.colors) || item.colors.some(color => typeof color !== 'string'))) invalid()
  if (kind === 'streams') {
    for (const key of ['starts_at', 'ends_at', 'start_timestamp', 'end_timestamp']) {
      const value = item[key]
      if (value == null) continue
      if ((typeof value !== 'number' && typeof value !== 'string') ||
          !Number.isFinite(Number(value)) || Math.abs(Number(value)) > 8.64e12) invalid()
    }
  }
  validateItemSources(item)
}

function id(value: unknown): string {
  if (!Number.isSafeInteger(value) && !(typeof value === 'string' && /^\d+$/.test(value))) return invalid()
  return String(value)
}

function itemPath(kind: FeedCollection, item: Record<string, unknown>): string | undefined {
  const value = kind === 'streams' ? item.uri_name ?? item.uri : item.slug ?? item.uri_name
  if (value === undefined) return
  if (typeof value !== 'string') return invalid()
  return feedDetailPath(kind, value) ?? invalid()
}

const manifests = new Map<string, ReturnType<typeof parseManifest>>()
type ParsedRange = ReturnType<typeof parseRange>
const ranges = new Map<string, { etag: string; length: number; parsed: ParsedRange }>()
let rangeBytes = 0

function parseRange(path: string, text: string) {
  const payload = record(JSON.parse(text))
  if (payload.success !== true) return invalid()
  const ids = new Map<string, string>()
  let detail: { kind: FeedCollection; identity: string | undefined; id: string } | undefined
  if (path === 'streams' || path === 'vods') {
    const categories = payload[path]
    if (!Array.isArray(categories)) return invalid()
    for (const rawCategory of categories) {
      const category = record(rawCategory)
      const items = category[path]
      if (typeof category.category !== 'string' || !Array.isArray(items)) return invalid()
      for (const rawItem of items) {
        const item = record(rawItem)
        const key = itemPath(path, item)
        const itemId = id(item.id)
        if (!key || (ids.has(key) && ids.get(key) !== itemId)) return invalid()
        ids.set(key, itemId)
        validateDisplayFields(path, item)
      }
    }
  } else {
    const item = record(payload.data)
    const kind = path.split('/')[0] as FeedCollection
    const identity = itemPath(kind, item)
    if (identity !== undefined && identity !== path) return invalid()
    detail = { kind, identity, id: id(item.id) }
    validateDisplayFields(kind, item)
    if (item.recommended_vods !== undefined) {
      if (!Array.isArray(item.recommended_vods)) return invalid()
      for (const recommended of item.recommended_vods) validateDisplayFields('vods', record(recommended))
    }
  }

  const compact = compactSnapshotPayload(path, payload as SnapshotPayload)
  // The JSON can spell any token character with a Unicode escape.
  const hasHostToken = (text.includes('{host}') || text.includes('\\u')) && containsHostToken(compact)
  return { payload: compact, hasHostToken, ids, detail }
}

export function containsHostToken(value: unknown): boolean {
  if (typeof value === 'string') return value.includes('{host}')
  return !!value && typeof value === 'object' && Object.values(value).some(containsHostToken)
}

const streamFields = ['id', 'name', 'tag', 'poster', 'blurhash', 'colors', 'uri_name', 'starts_at',
  'ends_at', 'always_live', 'category_name', 'viewers']
const vodFields = ['id', 'name', 'tag', 'poster', 'blurhash', 'colors', 'uri_name', 'slug', 'added', 'event_date', 'views']
function pick(value: Record<string, unknown>, keys: string[]) {
  const result: Record<string, unknown> = {}
  for (const key of keys) {
    if (Object.hasOwn(value, key)) result[key] = value[key]
  }
  return result
}

function compactVod(item: unknown) {
  const vod = record(item)
  const path = feedDetailPath('vods', vod.slug ?? vod.uri_name)
  if (!path) return
  const uri = path.slice('vods/'.length)
  return { ...pick(vod, vodFields), uri_name: uri, ...(vod.slug !== undefined ? { slug: uri } : {}) }
}

export function compactSnapshotPayload(path: string, payload: SnapshotPayload): SnapshotPayload {
  const envelope: SnapshotPayload = { success: true, ...pick(payload, ['timestamp']) }
  if (path === 'streams' || path === 'vods') {
    if (!Array.isArray(payload[path])) return invalid()
    const fields = path === 'streams' ? streamFields : vodFields
    envelope[path] = payload[path].map(entry => {
      const category = record(entry)
      const items = category[path]
      if (!Array.isArray(items)) return invalid()
      const cards = path === 'vods' ? items.map(compactVod).filter(Boolean) : items.map((entry) => {
        const item = record(entry)
        const route = itemPath('streams', item)
        return { ...pick(item, fields), uri_name: route?.slice('streams/'.length) }
      })
      return { ...pick(category, ['category', 'id', 'always_live']), [path]: cards }
    })
  } else {
    const item = record(payload.data)
    envelope.data = path.startsWith('streams/')
      ? pick(item, [...streamFields, 'source_tag', 'locale', 'uri', 'start_timestamp', 'end_timestamp', 'sources', 'substreams'])
      : { ...pick(item, [...vodFields, 'source']),
          recommended_vods: Array.isArray(item.recommended_vods)
            ? item.recommended_vods.map(compactVod).filter(Boolean) : undefined }
  }
  return envelope
}

export function createSnapshotReader(bucket: SnapshotBucket) {
  let manifest: Promise<ReturnType<typeof parseManifest>> | undefined
  const open = () => manifest ??= (async () => {
    const object = await bucket.get('current.json')
    if (!object || object.size > fileLimit) {
      await object?.body.cancel()
      return invalid()
    }
    const cached = manifests.get(object.etag)
    if (cached) {
      await object.body.cancel()
      return cached
    }
    const parsed = parseManifest(JSON.parse(decoder.decode(await object.arrayBuffer())))
    if (manifests.size >= 8) manifests.delete(manifests.keys().next().value!)
    manifests.set(object.etag, parsed)
    return parsed
  })()

  let etag: string | undefined
  async function read(paths: string[]) {
    const generation = await open()
    const payloads = new Map<string, ParsedRange>()
    await Promise.all(paths.map(async (path) => {
      const range = generation.ranges.get(path)
      if (!range) return
      const object = await bucket.get(generation.payloadKey, { range })
      if (!object || object.size !== generation.size || (etag !== undefined && etag !== object.etag)) {
        await object?.body.cancel()
        return invalid()
      }
      etag = object.etag
      const key = `${generation.payloadKey}:${range.offset}:${range.length}:${path}`
      const cached = ranges.get(key)
      if (cached?.etag === etag) {
        await object.body.cancel()
        payloads.set(path, cached.parsed)
        return
      }
      const bytes = await object.arrayBuffer()
      if (bytes.byteLength !== range.length) return invalid()
      const parsed = parseRange(path, decoder.decode(bytes))
      if (ranges.delete(key)) rangeBytes -= range.length
      while (rangeBytes + range.length > 4 * fileLimit || ranges.size >= 256) {
        const oldest = ranges.keys().next().value!
        rangeBytes -= ranges.get(oldest)!.length
        ranges.delete(oldest)
      }
      ranges.set(key, { etag: object.etag, length: range.length, parsed })
      rangeBytes += range.length
      payloads.set(path, parsed)
    }))
    for (const [path, { detail }] of payloads) {
      if (!detail) continue
      if (!generation.ranges.has(detail.kind)) {
        if (detail.identity !== path) payloads.delete(path)
      } else if (payloads.get(detail.kind)?.ids.get(path) !== detail.id) {
        return invalid()
      }
    }
    return { payloads, has: (path: string) => generation.ranges.has(path) }
  }

  async function readHealth(commitId: string): Promise<SnapshotHealth> {
    try {
      const generation = await open()
      const range = generation.ranges.get('health.json')
      if (generation.commitId !== commitId || !range) return {}
      const object = await bucket.get(generation.payloadKey, { range })
      if (!object || object.size !== generation.size) {
        await object?.body.cancel()
        return {}
      }
      const bytes = await object.arrayBuffer()
      if (bytes.byteLength !== range.length) return {}
      const entries = Object.entries(record(JSON.parse(decoder.decode(bytes))))
      for (const [key, value] of entries) {
        const { embedOk, manifestOk, sequence, checkedAt, segmentMs, error } = record(value)
        if (!key || typeof embedOk !== 'boolean' || typeof manifestOk !== 'boolean'
          || (sequence !== 'advancing' && sequence !== 'frozen' && sequence !== 'unknown')
          || typeof checkedAt !== 'string' || !Number.isFinite(Date.parse(checkedAt))
          || (segmentMs !== undefined && (!Number.isSafeInteger(segmentMs) || Number(segmentMs) < 0))
          || (error !== undefined && (typeof error !== 'string' || !/^[a-z][a-z\d-]{1,31}$/.test(error)))) return {}
      }
      return Object.fromEntries(entries) as SnapshotHealth
    } catch {
      return {}
    }
  }

  return { open, read, readHealth }
}
