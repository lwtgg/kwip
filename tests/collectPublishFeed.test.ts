import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/feed-endpoint-collision.json', import.meta.url), 'utf8'))
const publisher = fileURLToPath(new URL('../scripts/collect-publish-feed.mjs', import.meta.url))

const mock = String.raw`
  import assert from 'node:assert/strict'
  import { registerHooks } from 'node:module'
  const signer = 'data:text/javascript,export class AwsClient { sign(url, options) { return new Request(url, options) } }'
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === 'aws4fetch') return { url: signer, shortCircuit: true }
      return nextResolve(specifier, context)
    },
  })
  const fixture = ${JSON.stringify(fixture)}
  const current = JSON.parse(process.env.PUBLISH_TEST_CURRENT)
  const mode = process.env.PUBLISH_TEST_MODE
  const startsAt = Math.floor(Date.now() / 1000)
  const primary = { name: 'Primary', type: 'iframe', default: true, data: 'https://strmfree.st/embed/soccer/away-home?primary' }
  const alternate = 'https://streamfree.top/embed/soccer/away-home-' + (mode === 'capacity' ? 'x'.repeat(4000) : '') + '720p'
  const disagreement = ['detail-baseline', 'detail-match', 'list-only-match'].includes(mode)
  const shortcut = disagreement || ['shortcut-baseline', 'unmatched', 'out-of-window', 'plausible'].includes(mode)
  const split = ['split', 'deadline'].includes(mode)
  const start = shortcut ? 2_000_000_000 : startsAt + (split || ['capacity', 'fixture'].includes(mode) ? 0 : 4 * 3600)
  const splitAlternates = Array.from({ length: 26 }, (_, index) =>
    'https://strmfree.st/embed/soccer/supplement-' + index + '-720p')
  const deadline = new AbortController()
  if (mode === 'deadline') {
    const originalTimeout = AbortSignal.timeout
    AbortSignal.timeout = ms => ms > 25_000 && ms <= 30_000 ? deadline.signal : originalTimeout(ms)
  }
  const acceptedAlternate = 'https://streamfree.top/embed/soccer/east-west-720p'
  if (shortcut) Object.assign(fixture.streams.streams[0].streams[0], {
    name: disagreement ? 'Other FC vs. Away FC' : 'Home FC vs. Away FC',
    starts_at: disagreement ? start + 4 * 3600 : start,
  })
  if (mode !== 'baseline') {
    Object.assign(fixture['streams/foo'].data, {
      name: 'Home FC vs. Away FC', starts_at: start, sources: [primary],
    })
  }
  const primarySources = [primary]
  if (split || mode === 'capacity') {
    const count = split ? 42 : 39
    for (let i = 1; i < count; i++) primarySources.push({ ...primary, data: primary.data.replace('?primary', '-' + i) })
    fixture['streams/foo'].data.sources = primarySources
  }
  const wire = payload => mode === 'capacity' ? JSON.stringify(payload) : JSON.stringify(payload, null, 2) + '\n'
  if (mode === 'capacity') {
    Object.assign(fixture['streams/foo.json/bar'].data, { name: 'East vs. West', starts_at: start })
    const primaryHealth = Object.fromEntries(primarySources.map(({ data }) => [data.split('?')[0].slice(8), {
      embedOk: false, manifestOk: false, sequence: 'unknown', checkedAt: new Date().toISOString(), error: 'embed-503',
    }]))
    const rows = fixture.vods.vods[0].vods
    let size = Object.values(fixture).reduce((sum, payload) => sum + Buffer.byteLength(wire(payload)), 0)
    const fileLimit = 2 * 1024 ** 2
    const target = 40 * 1024 ** 2 - Buffer.byteLength(wire(primaryHealth)) - 3600
    for (let id = 4; size < target; id++) {
      const row = { id, slug: 'pad-' + id }
      const payload = { success: true, data: { id, pad: '' } }
      const rowSize = Buffer.byteLength(JSON.stringify(row)) + 1
      const detailSize = Buffer.byteLength(wire(payload))
      const length = Math.min(fileLimit - detailSize, target - size - rowSize - detailSize)
      assert.ok(length > 0)
      payload.data.pad = 'x'.repeat(length)
      fixture['vods/' + row.slug] = payload
      rows.push(row)
      size += detailSize + length + rowSize
    }
    assert.equal(Object.values(fixture).reduce((sum, payload) => sum + Buffer.byteLength(wire(payload)), 0), target)
  }
  let listingRequests = 0
  let packed
  const probeRequests = []
  const expectedProbes = mode === 'capacity' ? [...primarySources.map(source => source.data), acceptedAlternate]
    : split ? [...primarySources.slice(0, 40).map(source => source.data), ...splitAlternates.slice(0, 24)] : []
  let active = 0
  process.on('exit', () => {
    assert.equal(listingRequests, mode === 'fixture' ? 0 : 1)
    if (mode === 'deadline') assert.deepEqual(probeRequests, [primary.data, splitAlternates[0]])
    else assert.deepEqual(probeRequests.sort(), expectedProbes.sort())
  })
  globalThis.fetch = async (request, options) => {
    if (typeof request === 'string') {
      const url = new URL(request)
      if (url.href === 'https://strmfree.pk/api/v1/streams') {
        listingRequests++
        if (!split && !['duplicates', 'capacity', 'unmatched', 'out-of-window', 'plausible', 'detail-match', 'list-only-match'].includes(mode)) {
          return new Response(null, { status: 503 })
        }
        const streams = [{
          name: ['unmatched', 'list-only-match'].includes(mode) ? 'Away at Other' : 'Away at Home', category: 'soccer',
          match_timestamp: mode === 'list-only-match' ? start + 4 * 3600
            : mode === 'out-of-window' ? start + 3 * 3600 + 1 : start,
          additional_sources: [
            { url: 'https://strmfree.st/embed/soccer/AWAY-HOME/?supplement', quality: 'FHD' },
            { url: alternate, quality: 'HD' },
          ],
        }]
        if (split) streams[0].additional_sources = splitAlternates.map(url => ({ url, quality: 'HD' }))
        if (mode === 'capacity') streams.push({
          name: 'West at East', category: 'soccer', match_timestamp: start,
          additional_sources: [{ url: acceptedAlternate, quality: 'HD' }],
        })
        return Response.json({ streams })
      }
      assert.equal(url.hostname, 'provider.example')
      const endpoint = decodeURIComponent(url.pathname.replace(/^\/(?:fixtures\/)?/, ''))
      assert.ok(Object.hasOwn(fixture, endpoint))
      return new Response(wire(fixture[endpoint]))
    }
    if (request instanceof URL) {
      probeRequests.push(request.href)
      if (split) {
        active++
        assert.ok(active <= 2)
        if (mode === 'deadline') {
          return new Promise((_, reject) => {
            options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })
            if (active === 2) deadline.abort()
          })
        }
        await new Promise(resolve => setImmediate(resolve))
        active--
      }
      return new Response(null, { status: 503 })
    }
    const path = new URL(request.url).pathname
    assert.ok(path.startsWith('/kwip-feed-preview/'))
    if (request.method === 'GET') {
      if (current && path.endsWith('/current.json')) {
        return Response.json(current, { headers: { etag: '"original"' } })
      }
      return new Response('<Code>NoSuchKey</Code>', { status: 404 })
    }
    assert.equal(request.method, 'PUT')
    if (path.includes('/snapshots/')) {
      assert.equal(request.headers.get('if-none-match'), '*')
      packed = Buffer.from(await request.arrayBuffer())
    } else if (path.endsWith('/current.json')) {
      assert.equal(request.headers.get(current ? 'if-match' : 'if-none-match'), current ? '"original"' : '*')
      const manifest = await request.json()
      assert.equal(manifest.payloadKey, 'snapshots/' + manifest.payloadId + '.bin')
      assert.notEqual(manifest.commitId, current?.commitId)
      if (packed) assert.equal(manifest.payloadId, manifest.commitId)
      else assert.equal(manifest.payloadId, current.payloadKey.slice(10, -4))
      const paths = ['streams', 'vods', ...Object.keys(fixture).filter(path => path.includes('/')).sort()]
      if (split || mode === 'capacity') paths.push('health.json')
      assert.deepEqual(manifest.endpoints.map(({ path }) => path), paths)
      if (packed) {
        let end = 0
        for (const { path, offset, length } of manifest.endpoints) {
          assert.equal(offset, end)
          end += length
          const bytes = packed.subarray(offset, end)
          if (path === 'health.json') {
            const health = JSON.parse(bytes)
            assert.deepEqual(Object.keys(health).sort(), mode === 'deadline' ? []
              : expectedProbes.map(url => url.split('?')[0].slice(8)).sort())
            if (mode !== 'deadline') assert.equal(health['strmfree.st/embed/soccer/away-home'].error, 'embed-503')
          } else if (split && path === 'streams/foo') {
            const { sources } = JSON.parse(bytes).data
            assert.deepEqual(sources.slice(0, primarySources.length), primarySources)
            assert.deepEqual(sources.slice(primarySources.length).map(source => source.data), splitAlternates.slice(0, 24))
          } else if (mode === 'capacity' && path === 'streams/foo.json/bar') {
            const { sources } = JSON.parse(bytes).data
            assert.deepEqual(sources.map(source => source.data), [acceptedAlternate])
          } else if (['duplicates', 'plausible', 'detail-match'].includes(mode) && path === 'streams/foo') {
            const { sources } = JSON.parse(bytes).data
            assert.equal(sources.length, 2)
            assert.deepEqual(sources[0], primary)
            assert.equal(sources[1].data, alternate)
            assert.equal(sources[1].origin, 'supplement')
          } else {
            assert.deepEqual(bytes, Buffer.from(wire(fixture[path])))
          }
        }
        assert.equal(end, manifest.size)
        assert.equal(end, packed.length)
      }
    } else {
      assert.ok(path.endsWith('/collector-state.json'))
    }
    return new Response()
  }
`

async function publish(args: string[], current: object | null = null, mode = 'baseline') {
  const { stdout } = await promisify(execFile)(process.execPath, [
    '--import', 'data:text/javascript,' + encodeURIComponent(mock), publisher, ...args,
  ], {
    timeout: mode === 'capacity' ? 20_000 : 10_000,
    env: {
      ...process.env,
      NUXT_PUBLIC_FEED_BASE: mode === 'fixture' ? 'http://provider.example/fixtures/' : 'https://provider.example',
      PUBLISH_TEST_MODE: mode,
      R2_BUCKET: 'kwip-feed-preview',
      R2_ACCOUNT_ID: '00000000000000000000000000000000',
      R2_ACCESS_KEY_ID: 'local',
      R2_SECRET_ACCESS_KEY: 'local',
      R2_ENDPOINT: 'https://00000000000000000000000000000000.r2.cloudflarestorage.com',
      PUBLISH_TEST_CURRENT: JSON.stringify(current),
      ...(args.includes('--dry-run') ? { TMPDIR: publisher, TEMP: publisher } : {}),
    },
  })
  return JSON.parse(stdout)
}

test('republishes matching list hashes with incomplete or incorrect endpoint coverage', async () => {
  const dryRun = await publish(['--dry-run'])
  assert.equal(dryRun.requests, 2)
  assert.equal(dryRun.providerRequests, 5)
  assert.deepEqual(dryRun.manifest.endpoints.map(({ path }: { path: string }) => path), Object.keys(fixture))

  const endpoints = dryRun.manifest.endpoints
  const missing = { ...dryRun.manifest, endpoints: endpoints.slice(0, -1), size: endpoints.at(-1).offset }
  const wrong = {
    ...dryRun.manifest,
    endpoints: [...endpoints.slice(0, -1), { ...endpoints.at(-1), path: 'vods/unlisted' }],
  }

  const [missingResult, wrongResult, completeResult] = await Promise.all([
    publish([], missing),
    publish([], wrong),
    publish([], { ...dryRun.manifest, payloadId: undefined }),
  ])
  for (const result of [missingResult, wrongResult]) {
    assert.equal(result.outcome, 'published')
    assert.equal(result.providerRequests, 5)
    assert.equal(result.requests, 5)
    assert.deepEqual(result.bytes, { ...dryRun.bytes, payloadPut: dryRun.bytes.snapshot })
  }
  assert.equal(completeResult.outcome, 'unchanged')
  assert.equal(completeResult.providerRequests, 2)
  assert.equal(completeResult.requests, 4)
  assert.equal(completeResult.bytes.payloadPut, 0)
})


test('publisher dedupes supplement URLs sharing a primary sourceKey', async () => {
  assert.equal((await publish([], null, 'duplicates')).outcome, 'published')
})

test('a supplement 503 preserves every byte from the primary feed', async () => {
  assert.equal((await publish([], null, 'unavailable')).outcome, 'published')
})

test('fixture dry runs stay offline even with R2 credentials configured', async () => {
  const result = await publish(['--dry-run'], null, 'fixture')
  assert.equal(result.outcome, 'published')
  assert.equal(result.requests, 0)
})

test('publisher keeps primary health and probes accepted supplements at the cap', async () => {
  assert.equal((await publish([], null, 'capacity')).outcome, 'published')
})

test('unchanged listings crawl only for a plausible supplement match', async () => {
  const { manifest } = await publish(['--dry-run'], null, 'shortcut-baseline')
  const cases = await Promise.all(['unmatched', 'out-of-window', 'plausible'].map(mode => publish([], manifest, mode)))
  assert.deepEqual(cases.map(({ outcome, providerRequests }) => [outcome, providerRequests]), [
    ['unchanged', 2],
    ['unchanged', 2],
    ['published', 5],
  ])
})

test('unchanged lists use the same detail name and kickoff as a fresh supplement merge', async () => {
  const { manifest } = await publish(['--dry-run'], null, 'detail-baseline')
  const [fresh, refreshed, listedOnly] = await Promise.all([
    publish([], null, 'detail-match'),
    publish([], manifest, 'detail-match'),
    publish([], manifest, 'list-only-match'),
  ])
  assert.equal(fresh.outcome, 'published')
  assert.equal(refreshed.outcome, 'published')
  assert.equal(refreshed.providerRequests, 5)
  assert.deepEqual(refreshed.bytes, fresh.bytes)
  assert.equal(listedOnly.outcome, 'unchanged')
  assert.equal(listedOnly.providerRequests, 2)
})

test('publisher packs 40 primary records and 24 supplement records under separate caps', async () => {
  const result = await publish([], null, 'split')
  assert.equal(result.outcome, 'published')
  assert.deepEqual(result.probes, {
    primary: { queued: 40, deadlineDropped: 0 },
    supplement: { queued: 24, deadlineDropped: 0 },
  })
})

test('publisher reports probe deadline drops by side and still publishes', async () => {
  const result = await publish([], null, 'deadline')
  assert.equal(result.outcome, 'published')
  assert.deepEqual(result.probes, {
    primary: { queued: 40, deadlineDropped: 40 },
    supplement: { queued: 24, deadlineDropped: 24 },
  })
})
