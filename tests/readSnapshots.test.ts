import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { createSnapshotReader, type SnapshotBucket } from '../server/utils/snapshot.ts'
import { FEED_DEADLINES_MS, fetchFeed, getFeedCacheIdentity, getFeedFallback, getFeedGeneration, readFeedGeneration } from '../server/utils/feed.ts'

const commitId = '20261119T000000Z-01234567'
const time = '2026-11-19T00:00:00.000Z'
const channels = {
  success: true, timestamp: 123, streams: [{
    category: 'Sports', streams: [
      { id: 1, uri: 'sport/example', name: 'Example', iframe: 'https://example.com/player', unused: 'large' },
      { id: 2, uri_name: 'missing', name: 'Missing' },
    ],
  }],
}
const detail = { success: true, data: {
  id: '1', uri: 'sport/example', name: 'Example',
  sources: [{ name: 'Main', type: 'iframe', data: 'https://example.com/?host={host}' }],
} }
const endpoints = [{ kind: 'streams' }, { kind: 'stream', uriName: 'sport/example' }] as const
const requestUrl = new URL('https://kwip.fyi/live/sport/example')

const replayList = { success: true, vods: [{ category: 'Archive', vods: [
  { id: 3, uri_name: 'replay', name: 'Replay' },
  { id: 4, uri_name: 'omitted', name: 'Omitted' },
] }] }

function fixture(includeDetail = true, detailPayload: object = detail, includeReplay = false, liveUri = 'sport/example', includeVodList = true, streams: object = channels, health?: object) {
  const data = [
    ['streams', liveUri === 'sport/example' ? streams : { ...channels, streams: [{
      category: 'Sports', always_live: 0, streams: [{ id: 1, name: 'Example', uri: liveUri }],
    }] }],
    ...(includeVodList ? [['vods', replayList]] as const : []),
    ...(includeReplay ? [['vods/replay', { success: true, data: { id: 3, slug: 'replay', uri_name: 'different', name: 'Replay' } }]] : []),
    ...(includeDetail ? [['streams/' + liveUri, detailPayload]] : []),
    ...(health ? [['health.json', health]] : []),
  ] as const
  const packed = Buffer.concat(data.map(([, value]) => Buffer.from(JSON.stringify(value))))
  let size = 0
  const ranges = data.map(([path, value]) => {
    const length = Buffer.byteLength(JSON.stringify(value))
    const offset = size
    size += length
    return { path, offset, length }
  })
  const manifest = {
    schema: 1, commitId, payloadId: commitId, payloadKey: 'snapshots/' + commitId + '.bin',
    publishedAt: time, listsVerifiedAt: time, detailsVerifiedAt: time, size, endpoints: ranges,
  }
  const calls: string[] = []
  let decoded = 0
  let corruptOffset = -1
  function object(bytes: Buffer, size: number, etag: string) {
    const response = new Response(new Uint8Array(bytes))
    return { size, etag, body: response.body!, arrayBuffer: () => { decoded++; return response.arrayBuffer() } }
  }
  const bucket: SnapshotBucket = {
    async get(key, options) {
      calls.push(key)
      if (key === 'current.json') {
        const bytes = Buffer.from(JSON.stringify(manifest))
        return object(bytes, bytes.length, createHash('sha256').update(bytes).digest('hex'))
      }
      if (!options || key !== manifest.payloadKey) return null
      const { offset, length } = options.range
      const end = offset + length - Number(offset === corruptOffset)
      return object(packed.subarray(offset, end), packed.length, createHash('sha256').update(packed).update(String(corruptOffset)).digest('hex'))
    },
  }
  return { manifest, bucket, calls, decoded: () => decoded, corrupt: (offset: number) => { corruptOffset = offset } }
}

test('shares a single manifest and resolves the validated byte ranges', async () => {
  const { bucket, calls } = fixture()
  const reader = createSnapshotReader(bucket)
  const [first, second, result] = await Promise.all([
    reader.open(), reader.open(), reader.read(['streams', 'streams/sport/example']),
  ])
  assert.equal(first, second)
  assert.deepEqual(result.payloads.get('streams/sport/example')?.payload, detail)
  assert.deepEqual(calls, ['current.json', first.payloadKey, first.payloadKey])
})

test('reads optional health only for the selected generation', async () => {
  const health = {
    'example.com/player': { embedOk: false, manifestOk: false, sequence: 'unknown', checkedAt: time, error: 'embed-404' },
  }
  const { bucket, manifest, corrupt } = fixture(true, detail, false, 'sport/example', true, channels, health)
  assert.deepEqual(await createSnapshotReader(bucket).readHealth(commitId, Date.parse(time)), health)
  assert.deepEqual(await createSnapshotReader(bucket).readHealth('20261119T000000Z-01234568', Date.parse(time)), {})
  assert.deepEqual(await createSnapshotReader(bucket).readHealth(commitId, Date.parse(time) + 30 * 60_000), {})
  assert.deepEqual(await createSnapshotReader(bucket).readHealth(commitId, Date.parse(time) - 1), {})
  assert.deepEqual(await createSnapshotReader(fixture().bucket).readHealth(commitId, Date.parse(time)), {})
  corrupt(manifest.endpoints.at(-1)!.offset)
  const reader = createSnapshotReader(bucket)
  assert.deepEqual(await reader.readHealth(commitId, Date.parse(time)), {})
  const generation = await readFeedGeneration(bucket, requestUrl, requestUrl.host, [...endpoints])
  assert.equal(generation.readable, true)
  assert.equal(generation.get(endpoints[1])?.data.name, 'Example')
})

test('request consumers share the whole batch and keep origin and cache provenance', async () => {
  const { bucket, calls } = fixture()
  const event = { context: { cloudflare: { env: { FEED_SNAPSHOTS: bucket } } } }
  const read = () => getFeedGeneration(event, 'FEED_SNAPSHOTS', {
    feedBase: 'https://upstream.example', feedMirrorBase: '', canonicalHost: requestUrl.host,
  }, requestUrl)
  assert.equal(read(), read())
  const generation = await read()
  assert.equal(generation.get(endpoints[0]).timestamp, 123)
  assert.equal(generation.get({ kind: 'vods' }), undefined)
  assert.equal(calls.length, 3)
  assert.deepEqual(generation.get(endpoints[0]).streams[0].streams[0], {
    id: 1, uri_name: 'sport/example', name: 'Example',
  })
  assert.equal(generation.get(endpoints[1]).fromCache, true)
  assert.equal(generation.get(endpoints[1]).data.sources[0].data, 'https://example.com/?host=kwip.fyi')
  assert.equal(calls.filter(key => key === 'current.json').length, 1)
})

const unreachable = async () => { throw new Error('Unexpected network access') }

test('normalizes a validated live detail to the pinned route', async () => {
  for (const uri of ['/sport/example', undefined]) {
    const { bucket } = fixture(true, { ...detail, data: { ...detail.data, uri } })
    const generation = await readFeedGeneration(bucket, requestUrl, requestUrl.host, [...endpoints])
    assert.equal(generation.get(endpoints[1])?.data.uri_name, 'sport/example')
  }
})

test('normalizes a validated VOD slug when the manifest omits the list', async () => {
  const { bucket } = fixture(false, detail, true, 'sport/example', false)
  const vod = { kind: 'vod', slug: 'replay' } as const
  const generation = await readFeedGeneration(
    bucket, requestUrl, requestUrl.host, [{ kind: 'vods' }, vod],
  )
  assert.equal(generation.get({ kind: 'vods' }), undefined)
  assert.equal(generation.get(vod)?.data.uri_name, 'replay')
})

const endedDetail = { ...detail, data: { ...detail.data, uri: '/replay', start_timestamp: 400, end_timestamp: 500 } }
const replayEndpoints = [{ kind: 'streams' }, { kind: 'stream', uriName: 'replay' }] as const

test('listing deadlines follow home and category filters and ignore 24/7 schedules', async () => {
  const event = (id: number, start: number, end: number, alwaysLive?: number) => ({
    id, uri: `sport/${id}`, name: `Event ${id}`, starts_at: start, ends_at: end, always_live: alwaysLive,
  })
  const streams = { ...channels, streams: [
    { category: 'Match Day', streams: [event(1, 130, 160)] },
    { category: 'Other Sport', streams: [event(2, 110, 180), event(3, 101, 102, 1)] },
    { category: 'Always On', always_live: 1, streams: [event(4, 103, 104)] },
  ] }
  const { bucket } = fixture(false, detail, false, 'sport/example', true, streams)
  for (const [path, now, boundary] of [
    ['/', 100, 110],
    ['/c/Match%20Day/', 100, 130],
    ['/c/match-day?filter=upcoming', 130, Infinity],
    ['/c/match-day?filter=live', 100, 130],
    ['/c/match-day?filter=live', 130, 160],
    ['/c/match-day?filter=live', 160, Infinity],
    ['/c/match-day', 130, 160],
    ['/c/always-on', 100, Infinity],
    ['/sitemap.xml', 100, Infinity],
  ] as const) {
    const generation = await readFeedGeneration(
      bucket, new URL(path, requestUrl), requestUrl.host, [{ kind: 'streams' }], now,
    )
    assert.equal(generation.cacheBoundary, boundary, path)
  }
})

test('live cache coverage moves from kickoff to the whistle to ended replay', async () => {
  for (const [now, boundary, replay] of [
    [399, 400, undefined], [400, 500, undefined], [499, 500, undefined], [500, Infinity, true],
  ] as const) {
    const { bucket } = fixture(true, endedDetail, true, 'replay')
    const generation = await readFeedGeneration(
      bucket, requestUrl, requestUrl.host, [...replayEndpoints], now,
    )
    assert.equal(generation.cacheBoundary, boundary)
    assert.equal(generation.get(replayEndpoints[1])?.hasSnapshotReplay, replay)
  }
})

test('reads the replay range only for ended streams with detail coverage', async () => {
  for (const [covered, now, hasReplay] of [[true, 499, false], [false, 500, false], [true, 500, true]] as const) {
    const { bucket, calls } = fixture(true, endedDetail, covered, 'replay')
    const generation = await readFeedGeneration(
      bucket, requestUrl, requestUrl.host, [...replayEndpoints], now,
    )
    assert.equal(!!generation.get(replayEndpoints[1])?.hasSnapshotReplay, hasReplay)
    assert.equal(calls.length, hasReplay ? 4 : 3)
    assert.equal(calls.filter(key => key === 'current.json').length, 1)
  }
})

test('a corrupt required replay range invalidates the whole snapshot batch', async () => {
  const { bucket, manifest, corrupt } = fixture(true, endedDetail, true, 'replay')
  corrupt(manifest.endpoints.find(endpoint => endpoint.path === 'vods')!.offset)
  const generation = await readFeedGeneration(bucket, requestUrl, requestUrl.host, [...replayEndpoints], 500)
  assert.equal(generation.readable, false)
  assert.equal(generation.get(replayEndpoints[0]), undefined)
  assert.equal(generation.get(replayEndpoints[1]), undefined)
})

test('an authoritative omission leaves the generation readable', async () => {
  const { bucket } = fixture(false)
  const generation = await readFeedGeneration(bucket, requestUrl, requestUrl.host, [...endpoints])
  assert.equal(generation.readable, true)
  assert.equal(generation.get(endpoints[0]).fromCache, true)
  assert.equal(generation.get(endpoints[1]), undefined)
})

test('a corrupt range invalidates every endpoint in the batch', async () => {
  const { bucket, manifest, corrupt } = fixture()
  corrupt(manifest.endpoints.at(-1)!.offset)
  const generation = await readFeedGeneration(bucket, requestUrl, requestUrl.host, [...endpoints])
  assert.equal(generation.readable, false)
  assert.equal(generation.get(endpoints[0]), undefined)
  assert.equal(generation.get(endpoints[1]), undefined)
})

type Manifest = ReturnType<typeof fixture>['manifest']
const invalid: Record<string, (manifest: Manifest) => void> = {
  schema: m => { m.schema = 2 },
  commitId: m => { m.commitId = 'bad' },
  payloadKey: m => { m.payloadKey = '../example.bin' },
  payloadIdentity: m => { m.payloadKey = m.payloadKey.replace('01234567', '00000000') },
  size: m => { m.size++ },
  sizeLimit: m => { m.size = 40 * 1024 ** 2 },
  firstOffset: m => { m.endpoints[0].offset = 1 },
  offsetGap: m => { m.endpoints[1].offset++ },
  offsetOverlap: m => { m.endpoints[1].offset-- },
  emptyLength: m => { m.endpoints[1].length = 0 },
  fractionalLength: m => { m.endpoints[1].length = 1.5 },
  invalidPath: m => { m.endpoints[1].path = 'streams/../vods' },
  nestedVod: m => { m.endpoints[1].path = 'vods/a/b' },
  unknownPath: m => { m.endpoints[1].path = 'ping' },
  duplicatePath: m => { m.endpoints[1].path = 'streams' },
  publishedAt: m => { m.publishedAt = 'invalid' },
  listsVerifiedAt: m => { m.listsVerifiedAt = 'invalid' },
  detailsVerifiedAt: m => { m.detailsVerifiedAt = 'invalid' },
}

for (const [rule, mutate] of Object.entries(invalid)) {
  test('rejects invalid ' + rule, async () => {
    const { bucket, manifest, calls } = fixture()
    mutate(manifest)
    await assert.rejects(createSnapshotReader(bucket).open(), /Unreadable feed snapshot/)
    assert.deepEqual(calls, ['current.json'])
  })
}

test('rejects a detail with an unexpected ID, path, success flag, or source scheme', async () => {
  const data = detail.data
  const invalidDetails = [
    { ...detail, success: false },
    { ...detail, data: { ...data, id: '2' } },
    { ...detail, data: { ...data, uri: 'missing' } },
    { ...detail, data: { ...data, sources: [{ ...data.sources[0], data: 'javascript:void(0)' }] } },
  ]
  for (const payload of invalidDetails) {
    const { bucket } = fixture(true, payload)
    await assert.rejects(createSnapshotReader(bucket).read(['streams', 'streams/sport/example']))
  }
})

test('an unchanged poll keeps the original payload and timestamp', async () => {
  const { bucket, manifest } = fixture()
  manifest.commitId = '20261119T000500Z-89abcdef'
  manifest.listsVerifiedAt = '2026-11-19T00:05:00Z'
  const result = await createSnapshotReader(bucket).read(['streams'])
  assert.equal(result.payloads.get('streams')?.payload.timestamp, 123)
})

test('new requests reuse decoded ranges across unchanged publications', async () => {
  const { bucket, manifest, decoded } = fixture(true, { ...detail, timestamp: 300 })
  const paths = ['streams', 'vods', 'streams/sport/example']
  const before = await createSnapshotReader(bucket).read(paths)
  const initial = decoded()
  await createSnapshotReader(bucket).read(paths)
  assert.equal(decoded(), initial)
  manifest.commitId = '20261119T000500Z-cafebabe'
  const after = await createSnapshotReader(bucket).read(paths)
  assert.equal(decoded(), initial + 1)
  assert.equal(after.payloads.get('streams/sport/example'), before.payloads.get('streams/sport/example'))
})

test('sitemap omits a detail missing from the pinned manifest', async () => {
  const { bucket } = fixture()
  Object.assign(globalThis, {
    defineEventHandler: handler => handler,
    canonicalOrigin: () => requestUrl.origin,
    useRuntimeConfig: () => ({
      feedSnapshotBinding: 'FEED_SNAPSHOTS',
      seedDetailPaths: ['streams/sport/example'],
      public: { feedBase: 'https://upstream.example', feedMirrorBase: '', canonicalHost: requestUrl.host },
    }),
    getRequestURL: () => new URL('/sitemap.xml', requestUrl),
    setResponseHeader: () => {},
    $fetch: unreachable,
  })
  const { default: sitemap } = await import('../server/routes/sitemap.xml.ts')
  const xml = await sitemap({ context: { cloudflare: { env: { FEED_SNAPSHOTS: bucket } } } })
  assert.match(xml, /<loc>https:\/\/kwip\.fyi\/live\/sport\/example<\/loc>/)
  assert.doesNotMatch(xml, /\/live\/missing/)

  const seed = await sitemap({ context: { cloudflare: { env: {
    FEED_SNAPSHOTS: { get: async () => null },
    ASSETS: { fetch: async (request: Request) => Response.json(
      new URL(request.url).pathname.endsWith('/streams.json') ? channels : { success: true, vods: [] },
    ) },
  } } } })
  assert.match(seed, /\/live\/sport\/example/)
  assert.doesNotMatch(seed, /\/live\/missing/)
})

const deadlineConfig = {
  feedBase: 'https://primary.example', feedMirrorBase: 'https://mirror.example', canonicalHost: requestUrl.host,
}
const never = () => new Promise<never>(() => {})
const nextTurn = () => new Promise<void>(resolve => setImmediate(resolve))

function trackTimeouts(context) {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  return context.mock.method(console, 'warn', () => {})
}

test('a hung primary is aborted and logs once before the mirror and bundled snapshot', async (context) => {
  const warnings = trackTimeouts(context)
  const calls: string[] = []
  let primarySignal: AbortSignal | undefined
  const result = fetchFeed(async (url, options) => {
    calls.push(url)
    if (url.startsWith(deadlineConfig.feedBase)) {
      primarySignal = options.signal
      return never()
    }
    if (url.startsWith(deadlineConfig.feedMirrorBase)) throw new Error('Mirror unreachable')
    return channels
  }, deadlineConfig, requestUrl, endpoints[0])

  context.mock.timers.tick(FEED_DEADLINES_MS.upstream)
  assert.deepEqual(await result, { ...channels, fromCache: true })
  assert.equal(primarySignal?.aborted, true)
  assert.deepEqual(calls, [
    'https://primary.example/streams', 'https://mirror.example/streams', 'https://kwip.fyi/feed-cache/streams.json',
  ])
  assert.deepEqual(warnings.mock.calls.map(call => JSON.parse(call.arguments[0])), [{
    event: 'feed_timeout', endpoint: 'streams', stage: 'primary', elapsedMs: FEED_DEADLINES_MS.upstream,
  }])
})

test('fast network errors retain failover order without timeout logs', async (context) => {
  const warnings = trackTimeouts(context)
  const calls: string[] = []
  const result = await fetchFeed(async (url, options) => {
    calls.push(url)
    if (calls.length < 3) {
      options.onRequestError?.()
      throw new Error('Network failure')
    }
    return channels
  }, deadlineConfig, requestUrl, endpoints[0])
  assert.deepEqual(result, { ...channels, fromCache: true })
  assert.deepEqual(calls, [
    'https://primary.example/streams', 'https://mirror.example/streams', 'https://kwip.fyi/feed-cache/streams.json',
  ])
  context.mock.timers.runAll()
  assert.equal(warnings.mock.callCount(), 0)
})

test('the mirror and bundled assets get their own budgets after a primary timeout', async (context) => {
  const warnings = trackTimeouts(context)
  const signals: AbortSignal[] = []
  const result = fetchFeed(async (_url, options) => {
    signals.push(options.signal)
    return never()
  }, deadlineConfig, requestUrl, endpoints[0], { async fetch() { return never() } })
  context.mock.timers.tick(FEED_DEADLINES_MS.upstream)
  await nextTurn()
  assert.equal(signals[1].aborted, false)
  context.mock.timers.tick(FEED_DEADLINES_MS.upstream)
  await nextTurn()
  assert.equal(signals[1].aborted, true)
  assert.equal(warnings.mock.callCount(), 2)
  context.mock.timers.tick(FEED_DEADLINES_MS.seed)
  await assert.rejects(result, { name: 'FeedTimeoutError', message: 'Feed deadline exceeded at seed' })
  assert.deepEqual(warnings.mock.calls.map(call => JSON.parse(call.arguments[0]).stage), ['primary', 'mirror', 'seed'])
})

test('a stalled R2 identity is shared by cache lookup and SSR, which leaves the generation unusable', async (context) => {
  const warnings = trackTimeouts(context)
  let opens = 0
  const event = { context: { cloudflare: { env: {
    FEED_SNAPSHOTS: { get() { opens++; return never() } },
    ASSETS: { async fetch() { return Response.json({ ...channels, timestamp: 42 }) } },
  } } } }
  const url = new URL('/', requestUrl)
  const identity = getFeedCacheIdentity(event, 'FEED_SNAPSHOTS', deadlineConfig, url)
  context.mock.timers.tick(FEED_DEADLINES_MS.identity)
  assert.equal(await identity, undefined)
  const generation = await getFeedGeneration(event, 'FEED_SNAPSHOTS', deadlineConfig, url)
  assert.equal(generation.cacheIdentity, undefined)
  assert.equal(generation.readable, false)
  assert.equal(generation.get(endpoints[0]), undefined)
  assert.equal(opens, 1)
  assert.deepEqual(warnings.mock.calls.map(call => JSON.parse(call.arguments[0])), [{
    event: 'feed_timeout', endpoint: 'streams', stage: 'identity', elapsedMs: FEED_DEADLINES_MS.identity,
  }])
})

test('stalled R2 ranges leave the batch unusable and uncacheable', async (context) => {
  const warnings = trackTimeouts(context)
  const { bucket } = fixture()
  const result = readFeedGeneration({
    get(key, options) { return options ? never() : bucket.get(key) },
  }, requestUrl, requestUrl.host, [...endpoints])
  await nextTurn()
  context.mock.timers.tick(FEED_DEADLINES_MS.snapshot)
  const generation = await result
  assert.equal(generation.cacheIdentity, undefined)
  assert.equal(generation.readable, false)
  assert.equal(generation.get(endpoints[0]), undefined)
  assert.equal(generation.get(endpoints[1]), undefined)
  assert.deepEqual(warnings.mock.calls.map(call => JSON.parse(call.arguments[0])), [{
    event: 'feed_timeout', endpoint: 'stream', stage: 'snapshot', elapsedMs: FEED_DEADLINES_MS.snapshot,
  }])
})

for (const mode of ['readable', 'omitted', 'stalled'] as const) {
  test(`double upstream timeout tries R2 before the seed with a ${mode} snapshot`, async (context) => {
    const warnings = trackTimeouts(context)
    const { bucket } = fixture(mode !== 'omitted')
    const calls: string[] = []
    const event = { context: { cloudflare: { env: { FEED_SNAPSHOTS: {
      get(key, options) {
        calls.push(options ? 'range' : 'identity')
        return options && mode === 'stalled' ? never() : bucket.get(key, options)
      },
    } } } } }
    const result = fetchFeed(async url => {
      calls.push(new URL(url).hostname)
      return never()
    }, deadlineConfig, requestUrl, endpoints[1], {
      async fetch() {
        calls.push('seed')
        return Response.json({ ...detail, data: { ...detail.data, name: 'Bundled' } })
      },
    }, { event, binding: 'FEED_SNAPSHOTS' })

    context.mock.timers.tick(FEED_DEADLINES_MS.upstream)
    await nextTurn()
    assert.deepEqual(calls, ['primary.example', 'mirror.example'])
    const expected = mode === 'omitted'
      ? assert.rejects(result, { message: 'Feed endpoint unavailable in snapshot' })
      : result
    context.mock.timers.tick(FEED_DEADLINES_MS.upstream)
    await nextTurn()

    if (mode === 'stalled') {
      assert.deepEqual(calls, ['primary.example', 'mirror.example', 'identity', 'range', 'range'])
      context.mock.timers.tick(FEED_DEADLINES_MS.snapshot)
    }
    const payload = await expected
    assert.deepEqual(calls, [
      'primary.example', 'mirror.example', 'identity',
      ...(mode === 'omitted' ? [] : ['range', 'range']),
      ...(mode === 'stalled' ? ['seed'] : []),
    ])
    assert.deepEqual(warnings.mock.calls.map(call => JSON.parse(call.arguments[0]).stage), [
      'primary', 'mirror', ...(mode === 'stalled' ? ['snapshot'] : []),
    ])
    if (mode !== 'omitted') {
      assert.equal(payload?.data.name, mode === 'stalled' ? 'Bundled' : 'Example')
      assert.equal(payload?.fromCache, true)
      assert.equal(payload?.fromSnapshot, mode === 'readable' ? true : undefined)
    }
  })
}

test('sitemap direct-feed fallback uses R2 coverage after both upstreams time out', async (context) => {
  trackTimeouts(context)
  const { bucket } = fixture()
  const attempts: string[] = []
  context.mock.method(globalThis, '$fetch', url => {
    attempts.push(url)
    return never()
  })
  context.mock.method(globalThis, 'useRuntimeConfig', () => ({
    feedSnapshotBinding: 'FEED_SNAPSHOTS',
    seedDetailPaths: ['streams/missing'],
    // An absolute fixture base uses the direct feed path and still has an R2 binding.
    public: { ...deadlineConfig, feedBase: deadlineConfig.feedBase + '/fixtures' },
  }))
  const { default: sitemap } = await import('../server/routes/sitemap.xml.ts')
  const result = sitemap({ context: { cloudflare: { env: { FEED_SNAPSHOTS: bucket } } } })
  await nextTurn()
  context.mock.timers.tick(FEED_DEADLINES_MS.upstream)
  await nextTurn()
  context.mock.timers.tick(FEED_DEADLINES_MS.upstream)

  const xml = await result
  assert.equal(attempts.length, 4)
  assert.match(xml, /\/live\/sport\/example/)
  assert.doesNotMatch(xml, /\/live\/missing/)
})

test('one healthy upstream endpoint cannot mix with seed data in the sitemap', async (context) => {
  trackTimeouts(context)
  const { bucket, manifest } = fixture()
  let opens = 0
  const calls: string[] = []
  context.mock.method(globalThis, '$fetch', url => {
    calls.push(new URL(url).hostname)
    if (new URL(url).pathname === '/streams') return { success: true, streams: [{
      category: 'Sports', streams: [{ id: 9, uri_name: 'upstream-only', name: 'Upstream' }],
    }] }
    return never()
  })
  context.mock.method(globalThis, 'useRuntimeConfig', () => ({
    feedSnapshotBinding: 'FEED_SNAPSHOTS',
    seedDetailPaths: ['streams/missing', 'vods/seed-replay'],
    public: deadlineConfig,
  }))
  const { default: sitemap } = await import('../server/routes/sitemap.xml.ts')
  const result = sitemap({ context: { cloudflare: { env: {
    FEED_SNAPSHOTS: {
      get(key, options) {
        if (!options) {
          opens++
          calls.push('manifest')
        } else if (opens === 1 || options.range.offset === manifest.endpoints[1].offset) {
          return never()
        }
        return bucket.get(key, options)
      },
    },
    ASSETS: {
      async fetch(request: Request) {
        const path = new URL(request.url).pathname
        calls.push(path)
        return Response.json(path.endsWith('/streams.json') ? channels : {
          success: true, vods: [{ category: 'Replays', vods: [{ id: 11, uri_name: 'seed-replay', name: 'Seed replay' }] }],
        })
      },
    },
  } } } })
  await nextTurn()
  for (const budget of [FEED_DEADLINES_MS.snapshot, FEED_DEADLINES_MS.fallbackUpstream, FEED_DEADLINES_MS.fallbackUpstream]) {
    context.mock.timers.tick(budget)
    await nextTurn()
  }
  assert.deepEqual(calls, [
    'manifest', 'primary.example', 'primary.example', 'mirror.example', 'manifest',
  ])
  context.mock.timers.tick(FEED_DEADLINES_MS.snapshot)
  const xml = await result
  assert.match(xml, /\/live\/missing/)
  assert.match(xml, /\/vods\/seed-replay/)
  assert.doesNotMatch(xml, /\/live\/(?:sport\/example|upstream-only)/)
  assert.deepEqual(calls.slice(-2), ['/feed-cache/streams.json', '/feed-cache/vods.json'])
})

test('sitemap respects an omitted listing in a readable generation', async (context) => {
  const { bucket } = fixture(false, detail, false, 'sport/example', false)
  const upstream = context.mock.method(globalThis, '$fetch', unreachable)
  const { default: sitemap } = await import('../server/routes/sitemap.xml.ts')
  const xml = await sitemap({ context: { cloudflare: { env: { FEED_SNAPSHOTS: bucket } } } })
  assert.doesNotMatch(xml, /\/vods\//)
  assert.equal(upstream.mock.callCount(), 0)
})

test('healthy sitemap ignores upstream listings without uri_name', async (context) => {
  context.mock.method(globalThis, '$fetch', async url =>
    new URL(url).pathname.endsWith('/streams') ? channels : { success: true, vods: [] },
  )
  const { default: sitemap } = await import('../server/routes/sitemap.xml.ts')
  const xml = await sitemap({ context: { cloudflare: { env: {} } } })
  assert.doesNotMatch(xml, /\/live\/sport\/example/)
  assert.match(xml, /\/live\/missing/)
})

test('seed fallback keeps its listing when the requested live detail is absent from the seed', async () => {
  const calls: string[] = []
  const event = { context: { cloudflare: { env: {
    ASSETS: {
      async fetch(request: Request) {
        const path = new URL(request.url).pathname
        calls.push(path)
        return path.endsWith('/streams.json') ? Response.json(channels) : new Response(null, { status: 404 })
      },
    },
  } } } }
  const seed = await getFeedFallback(event, 'FEED_SNAPSHOTS', unreachable, deadlineConfig, requestUrl, [])
  assert.equal(seed?.get(endpoints[0])?.fromCache, true)
  assert.equal(seed?.get(endpoints[1]), undefined)
  assert.deepEqual(calls, ['/feed-cache/streams.json'])
})

test('score matches survive list and detail compaction and invalid match fields reject the generation', async () => {
  const side = { name: 'Team', abbreviation: 'TEAM', color: '#abcdef', logo: 'https://example.com/team.png', score: 12 }
  const match = { state: 'in', detail: 'Q3 7:42', away: side, home: side }
  const check = async (value: unknown) => {
    const streams = { ...channels, streams: [{ category: 'Sports', streams: [
      { id: 1, uri: 'sport/example', name: 'Example', match: value },
    ] }] }
    const payload = { ...detail, data: { ...detail.data, match: value } }
    return createSnapshotReader(fixture(true, payload, false, 'sport/example', true, streams).bucket)
      .read(['streams', 'streams/sport/example'])
  }
  const result = await check(match)
  assert.deepEqual(result.payloads.get('streams')?.payload.streams[0].streams[0].match, match)
  assert.deepEqual(result.payloads.get('streams/sport/example')?.payload.data.match, match)
  for (const value of [null, [], { ...match, state: 'live' }, { ...match, detail: 'x'.repeat(25) },
    { ...match, away: null }, ...[
      { name: 'x'.repeat(61) }, { name: 1 }, { abbreviation: 'TOOLONG' }, { abbreviation: null },
      { color: '#oops' }, { color: undefined }, { logo: 'http://example.com/logo' }, { logo: undefined },
      { score: 1.5 }, { score: -1 }, { score: 1000 }, { score: '12' },
    ].map(patch => ({ ...match, away: { ...side, ...patch } }))]) {
    await assert.rejects(check(value), /Unreadable feed snapshot/)
  }
  await check({ state: 'pre', detail: '', away: { ...side, color: null, logo: null, score: null }, home: side })
})

// Same-origin API and SSR share the validated generation reader.
const { serveFeedPath } = await import('../server/utils/feed-route.ts')
const { isCrossOriginFeed } = await import('../server/utils/feed.ts')
const localConfig = { feedSnapshotBinding: 'FEED_SNAPSHOTS', public: {
  feedBase: '/api/feed', feedMirrorBase: 'https://mirror.example', canonicalHost: 'kwip.fyi',
} }
function routeFixture(includeDetail = true) {
  const data = fixture(includeDetail)
  data.manifest.listsVerifiedAt = new Date(Date.now() - 1000).toISOString()
  const event = { context: { cloudflare: { env: { FEED_SNAPSHOTS: data.bucket } } } } as never
  return { ...data, event }
}

test('same-origin feed route reads ranges and replaces host tokens without proxying', async () => {
  const { event, calls } = routeFixture()
  const response = await serveFeedPath(event, 'streams/sport/example', (() => { throw Error('proxy') }) as never, localConfig, requestUrl)
  assert.equal(response.status, 200)
  assert.equal(response.headers['cache-control'], 'no-store')
  assert.equal(response.body.data.sources[0].data, 'https://example.com/?host=kwip.fyi')
  assert.equal(response.body.detailGeneration, commitId)
  assert.equal(calls.length, 3)
  assert.equal(isCrossOriginFeed('/api/feed', requestUrl, { kind: 'streams' }), false)
})

test('readable generation omissions return JSON 404 without provider or seed', async () => {
  const { event } = routeFixture(false)
  const response = await serveFeedPath(event, 'streams/sport/example', (() => { throw Error('proxy') }) as never, localConfig, requestUrl)
  assert.equal(response.status, 404)
  assert.deepEqual(response.body, { success: false, error: 'Not found', snapshotOmitted: true })
})

for (const state of ['missing', 'unreadable', 'ping']) {
  test(`feed route proxies ${state} with bounded upstream fetching`, async () => {
    const data = routeFixture()
    const event = state === 'missing' ? { context: {} } as never : state === 'unreadable'
      ? { context: { cloudflare: { env: { FEED_SNAPSHOTS: { get: async () => { throw Error('bad manifest') } } } } } } as never
      : data.event
    const urls: string[] = []
    const fetcher = async (url: string, options: { signal: AbortSignal }) => {
      assert.ok(options.signal instanceof AbortSignal)
      urls.push(url)
      return { success: true, timestamp: 123, streams: [] }
    }
    const response = await serveFeedPath(event, state === 'ping' ? 'ping' : 'streams', fetcher as never, localConfig, requestUrl)
    assert.equal(response.status, 200)
    assert.deepEqual(urls, [`https://api.ppv.st/api/${state === 'ping' ? 'ping' : 'streams'}`])
    if (state === 'ping') assert.deepEqual(data.calls, [])
  })
}

test('same-origin SSR reads the generation with a local feed base', async () => {
  const data = routeFixture()
  const generation = await getFeedGeneration(data.event, 'FEED_SNAPSHOTS', localConfig.public, requestUrl)
  assert.equal(generation?.readable, true)
  assert.equal(generation?.get(endpoints[1])?.detailGeneration, commitId)
})

test('same-origin SSR falls through provider, mirror and whole seed in order', async () => {
  const calls: string[] = []
  const fetcher = async (url: string, options: { onRequestError?: () => void }) => {
    calls.push(url)
    if (url.includes('/feed-cache/')) return channels
    options.onRequestError?.()
    throw new TypeError('network down')
  }
  const event = { context: {} } as never
  const fallback = await getFeedFallback(event, 'FEED_SNAPSHOTS', fetcher as never, localConfig.public, new URL('https://kwip.fyi/'), [])
  assert.ok(fallback?.get({ kind: 'streams' })?.fromCache)
  assert.deepEqual(calls, ['https://api.ppv.st/api/streams', 'https://mirror.example/streams', 'https://kwip.fyi/feed-cache/streams.json'])
})

test('same-origin browser leaves authoritative API errors intact and never tries mirror or seed', async () => {
  const calls: string[] = []
  const error = Object.assign(new Error('Not found'), { data: { snapshotOmitted: true } })
  await assert.rejects(fetchFeed(async (url) => { calls.push(url); throw error }, localConfig.public,
    requestUrl, { kind: 'stream', uriName: 'missing' }), candidate => candidate === error)
  assert.deepEqual(calls, ['https://kwip.fyi/api/feed/streams/missing'])
})

for (const age of [1, 46]) {
  test(`readable generation remains authoritative at ${age} minutes`, async () => {
    for (const included of [true, false]) {
      const data = routeFixture(included)
      data.manifest.listsVerifiedAt = new Date(Date.now() - age * 60_000).toISOString()
      const noProxy = (() => { throw Error('must not proxy') }) as never
      const response = await serveFeedPath(data.event, 'streams/sport/example', noProxy, localConfig, requestUrl)
      assert.equal(response.status, included ? 200 : 404)
      assert.equal(await getFeedCacheIdentity(data.event, 'FEED_SNAPSHOTS', localConfig.public, requestUrl), commitId)
    }
  })
}
