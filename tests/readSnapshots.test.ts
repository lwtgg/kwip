import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { createSnapshotReader, type SnapshotBucket } from '../server/utils/snapshot.ts'
import { FEED_DEADLINES_MS, fetchFeed, getFeedCacheIdentity, getFeedGeneration, readFeedGeneration } from '../server/utils/feed.ts'

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

function fixture(includeDetail = true, detailPayload: object = detail, includeReplay = false, liveUri = 'sport/example', includeVodList = true, streams: object = channels) {
  const data = [
    ['streams', liveUri === 'sport/example' ? streams : { ...channels, streams: [{
      category: 'Sports', always_live: 0, streams: [{ id: 1, name: 'Example', uri: liveUri }],
    }] }],
    ...(includeVodList ? [['vods', replayList]] as const : []),
    ...(includeReplay ? [['vods/replay', { success: true, data: { id: 3, slug: 'replay', uri_name: 'different', name: 'Replay' } }]] : []),
    ...(includeDetail ? [['streams/' + liveUri, detailPayload]] : []),
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

test('request consumers share the whole batch and keep origin and cache provenance', async () => {
  const { bucket, calls } = fixture()
  const event = { context: { cloudflare: { env: { FEED_SNAPSHOTS: bucket } } } }
  const read = () => getFeedGeneration(event, 'FEED_SNAPSHOTS', unreachable, {
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
    const generation = await readFeedGeneration(bucket, unreachable, requestUrl, requestUrl.host, [...endpoints])
    assert.equal(generation.get(endpoints[1])?.data.uri_name, 'sport/example')
  }
})

test('normalizes a validated VOD slug when the manifest omits the list', async () => {
  const { bucket } = fixture(false, detail, true, 'sport/example', false)
  const vod = { kind: 'vod', slug: 'replay' } as const
  const generation = await readFeedGeneration(
    bucket, unreachable, requestUrl, requestUrl.host, [{ kind: 'vods' }, vod],
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
      bucket, unreachable, new URL(path, requestUrl), requestUrl.host, [{ kind: 'streams' }], undefined, [], now,
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
      bucket, unreachable, requestUrl, requestUrl.host, [...replayEndpoints], undefined, [], now,
    )
    assert.equal(generation.cacheBoundary, boundary)
    assert.equal(generation.get(replayEndpoints[1])?.hasSnapshotReplay, replay)
  }
})

test('reads the replay range only for ended streams with detail coverage', async () => {
  for (const [covered, now, hasReplay] of [[true, 499, false], [false, 500, false], [true, 500, true]] as const) {
    const { bucket, calls } = fixture(true, endedDetail, covered, 'replay')
    const generation = await readFeedGeneration(
      bucket, unreachable, requestUrl, requestUrl.host, [...replayEndpoints], undefined, [], now,
    )
    assert.equal(!!generation.get(replayEndpoints[1])?.hasSnapshotReplay, hasReplay)
    assert.equal(calls.length, hasReplay ? 4 : 3)
    assert.equal(calls.filter(key => key === 'current.json').length, 1)
  }
})

test('a corrupt required replay range retries the entire batch against the seed', async () => {
  const { bucket, manifest, corrupt } = fixture(true, endedDetail, true, 'replay')
  corrupt(manifest.endpoints.find(endpoint => endpoint.path === 'vods')!.offset)
  for (const seedReplay of ['available', 'omitted', 'unreadable']) {
    const requests: string[] = []
    const generation = await readFeedGeneration(bucket, unreachable, requestUrl,
      requestUrl.host, [...replayEndpoints], {
        async fetch(request) {
          const path = new URL(request.url).pathname
          requests.push(path)
          if (path.endsWith('/streams.json')) {
            return Response.json({ ...channels, timestamp: 42, streams: [{
              category: 'Sports', always_live: 0, streams: [{ id: 1, name: 'Bundled', uri_name: 'replay' }],
            }] })
          }
          if (path.endsWith('/vods.json')) {
            return seedReplay === 'available' ? Response.json(replayList) : new Response(null, { status: 404 })
          }
          return Response.json({ ...endedDetail, data: { ...endedDetail.data, uri: 'replay', name: 'Bundled' } })
        },
      }, seedReplay === 'omitted' ? [] : ['vods/replay'], 500)
    assert.deepEqual(requests, [
      '/feed-cache/streams.json', '/feed-cache/streams/replay.json',
      ...(seedReplay === 'omitted' ? [] : ['/feed-cache/vods.json']),
    ])
    if (seedReplay === 'unreadable') {
      assert.equal(generation.get(replayEndpoints[0]), undefined)
      assert.equal(generation.get(replayEndpoints[1]), undefined)
      assert.equal(generation.hasDetail('vods/replay'), false)
    } else {
      assert.equal(generation.get(replayEndpoints[0])?.timestamp, 42)
      assert.equal(generation.get(replayEndpoints[1])?.data.name, 'Bundled')
      assert.equal(generation.get(replayEndpoints[1])?.hasSnapshotReplay, seedReplay === 'available' ? true : undefined)
    }
  }
})

test('authoritative omissions never fall back to the seed', async () => {
  const { bucket } = fixture(false)
  let seedReads = 0
  const generation = await readFeedGeneration(bucket, unreachable, requestUrl, requestUrl.host, [...endpoints], {
    async fetch() { seedReads++; return Response.json(detail) },
  })
  assert.equal(generation.get(endpoints[0]).fromCache, true)
  assert.equal(generation.get(endpoints[1]), undefined)
  assert.equal(seedReads, 0)
})

test('a corrupt range retries every requirement from the seed, or yields an unavailable batch', async () => {
  const { bucket, manifest, corrupt } = fixture()
  corrupt(manifest.endpoints.at(-1)!.offset)
  const requests: string[] = []
  let missing = false
  const read = () => readFeedGeneration(bucket, unreachable, requestUrl, requestUrl.host, [...endpoints, { kind: 'vods' }], {
    async fetch(request) {
      const path = new URL(request.url).pathname
      requests.push(path)
      if (path.endsWith('/streams.json')) return Response.json({ ...channels, timestamp: 42 })
      if (path.endsWith('/vods.json')) return missing ? new Response(null, { status: 404 }) : Response.json({ success: true, vods: [] })
      return Response.json(detail)
    },
  })
  const fallback = await read()
  assert.equal(fallback.get(endpoints[0]).timestamp, 42)
  assert.equal(fallback.get(endpoints[1]).fromCache, true)
  assert.deepEqual(requests, ['/feed-cache/streams.json', '/feed-cache/streams/sport/example.json', '/feed-cache/vods.json'])
  missing = true
  const unavailable = await read()
  assert.equal(unavailable.get(endpoints[0]), undefined)
  assert.equal(unavailable.get(endpoints[1]), undefined)
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

test('a stalled R2 identity is shared by cache lookup and SSR, which renders the seed', async (context) => {
  const warnings = trackTimeouts(context)
  let opens = 0
  const event = { context: { cloudflare: { env: {
    FEED_SNAPSHOTS: { get() { opens++; return never() } },
    ASSETS: { async fetch() { return Response.json({ ...channels, timestamp: 42 }) } },
  } } } }
  const url = new URL('/', requestUrl)
  const identity = getFeedCacheIdentity(event, 'FEED_SNAPSHOTS', deadlineConfig, url)
  context.mock.timers.tick(FEED_DEADLINES_MS.identity)
  assert.equal(await identity, 'seed')
  const generation = await getFeedGeneration(event, 'FEED_SNAPSHOTS', unreachable, deadlineConfig, url)
  assert.equal(generation.cacheIdentity, 'seed')
  assert.equal(generation.get(endpoints[0])?.timestamp, 42)
  assert.equal(generation.get(endpoints[0])?.fromSnapshot, true)
  assert.equal(opens, 1)
  assert.deepEqual(warnings.mock.calls.map(call => JSON.parse(call.arguments[0])), [{
    event: 'feed_timeout', endpoint: 'streams', stage: 'identity', elapsedMs: FEED_DEADLINES_MS.identity,
  }])
})

test('stalled R2 ranges fall through to the seed without caching it under the R2 identity', async (context) => {
  const warnings = trackTimeouts(context)
  const { bucket } = fixture()
  const result = readFeedGeneration({
    get(key, options) { return options ? never() : bucket.get(key) },
  }, unreachable, requestUrl, requestUrl.host, [...endpoints], {
    async fetch(request) {
      return Response.json(request.url.endsWith('/streams.json') ? { ...channels, timestamp: 42 } : detail)
    },
  })
  await nextTurn()
  context.mock.timers.tick(FEED_DEADLINES_MS.snapshot)
  const generation = await result
  assert.equal(generation.cacheIdentity, undefined)
  assert.equal(generation.get(endpoints[0])?.timestamp, 42)
  assert.equal(generation.get(endpoints[1])?.fromCache, true)
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
