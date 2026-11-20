import assert from 'node:assert/strict'
import { test } from 'node:test'
import worker, { decideRefresh, runTick } from './index.mjs'

const minute = 60_000
const now = Date.parse('2026-11-20T01:30:00.000Z')
const timestamp = (minutesAgo) => new Date(now - minutesAgo * minute).toISOString()
const env = {
  R2_BUCKET: 'kwip-feed-prod',
  R2_CREDENTIALS: JSON.stringify({
    bucket: 'kwip-feed-prod',
    accountId: 'a'.repeat(32),
    endpoint: `https://${'a'.repeat(32)}.r2.cloudflarestorage.com`,
    accessKeyId: 'r2-test-key',
    secretAccessKey: 'r2-test-secret',
  }),
  GITHUB_REFRESH_TOKEN: 'github-test-token',
}

for (const [label, verifiedAt, statuses, decision] of [
  ['missing manifest', null, [], 'dispatch'],
  ['11 minutes', timestamp(11), [], 'fresh'],
  ['12 minutes exactly', timestamp(12), [], 'fresh'],
  ['13 minutes', timestamp(13), [], 'dispatch'],
  ['queued run', timestamp(13), ['completed', 'queued'], 'active-run'],
  ['running run', timestamp(13), ['in_progress'], 'active-run'],
]) {
  test(`decision for ${label}`, () => {
    assert.equal(decideRefresh(verifiedAt, now, statuses).decision, decision)
  })
}

function fixture(...responses) {
  const requests = []
  return {
    requests,
    fetch: async (input, options) => {
      requests.push(new Request(input, options))
      assert.ok(responses.length, 'Unexpected subrequest')
      const response = responses.shift()
      if (response instanceof Error) throw response
      return response
    },
  }
}

test('a fresh tick only sends its signed R2 request', async () => {
  const http = fixture(Response.json({ listsVerifiedAt: timestamp(11) }))
  assert.deepEqual(await runTick(env, now, http.fetch), {
    ageMs: 11 * minute, decision: 'fresh', dispatch: 'skipped',
  })
  assert.equal(http.requests.length, 1)
  const [read] = http.requests
  assert.equal(new URL(read.url).pathname, '/kwip-feed-prod/current.json')
  assert.match(read.headers.get('authorization'), /^AWS4-HMAC-SHA256 /)
  assert.equal(read.redirect, 'manual')
})


const statuses = ['requested', 'waiting', 'pending', 'queued', 'in_progress']
const missing = () => new Response('<Error><Code>NoSuchKey</Code></Error>', { status: 404 })
const manifest = () => Response.json({ listsVerifiedAt: timestamp(13) })
const emptyRuns = () => Response.json({ total_count: 0, workflow_runs: [] })
const idle = () => statuses.map(emptyRuns)
const written = () => new Response(null, { headers: { ETag: '"claim"' } })
const accepted = () => new Response(null, { status: 204 })

test('accepts up to one minute of clock skew and rejects malformed or later timestamps', async () => {
  assert.deepEqual(decideRefresh(timestamp(-1), now), { ageMs: 0, decision: 'fresh' })
  for (const value of [timestamp(-1.01), '2026-11-20', '2026-02-30T00:00:00.000Z', 123, '']) {
    const http = fixture(Response.json({ listsVerifiedAt: value }))
    assert.deepEqual(await runTick(env, now, http.fetch), {
      ageMs: null, decision: 'error', dispatch: 'skipped', stage: 'manifest',
      reason: value === timestamp(-1.01) ? 'future-manifest-timestamp' : 'invalid-manifest-timestamp',
    })
    assert.equal(http.requests.length, 1)
  }
})

for (const [index, status] of statuses.entries()) {
  test(`a stale tick skips dispatch when GitHub returns a ${status} run`, async () => {
    const http = fixture(manifest(), missing(), ...statuses.slice(0, index).map(emptyRuns),
      Response.json({ total_count: 120, workflow_runs: [{ status }] }))
    assert.deepEqual(await runTick(env, now, http.fetch), {
      ageMs: 13 * minute, decision: 'active-run', dispatch: 'skipped',
    })
    assert.equal(http.requests.length, 3 + index)
    for (const [position, list] of http.requests.slice(2).entries()) {
      assert.equal(list.method, 'GET')
      assert.equal(list.redirect, 'manual')
      const query = new URL(list.url).searchParams
      assert.equal(query.get('branch'), 'main')
      assert.equal(query.get('status'), statuses[position])
      assert.equal(query.get('per_page'), '1')
    }
  })
}

test('an apparently empty response with a next page is inconclusive', async () => {
  const http = fixture(manifest(), missing(), Response.json({ total_count: 0, workflow_runs: [] }, {
    headers: { Link: '<https://api.github.com/example?page=2>; rel="next"' },
  }))
  assert.deepEqual(await runTick(env, now, http.fetch), {
    ageMs: 13 * minute, decision: 'inconclusive', dispatch: 'skipped', stage: 'list-runs', reason: 'incomplete-run-list',
  })
  assert.equal(http.requests.length, 3)
})

test('a missing manifest dispatches the production workflow on main when idle', async () => {
  const http = fixture(missing(), missing(), ...idle(), written(), accepted())
  assert.deepEqual(await runTick(env, now, http.fetch), {
    ageMs: null, decision: 'dispatch', dispatch: 'accepted', status: 204,
  })
  assert.equal(http.requests.length, 9)
  const [claim, dispatch] = http.requests.slice(-2)
  assert.equal(claim.headers.get('if-none-match'), '*')
  assert.deepEqual(await claim.json(), { until: now + 10 * minute })
  assert.equal(dispatch.url, 'https://api.github.com/repos/lwtgg/kwip/actions/workflows/feed-refresh.yml/dispatches')
  assert.equal(dispatch.method, 'POST')
  assert.equal(dispatch.redirect, 'manual')
  assert.equal(dispatch.headers.get('authorization'), 'Bearer github-test-token')
  assert.deepEqual(await dispatch.json(), { ref: 'main' })
})

test('a missing listsVerifiedAt field is eligible for dispatch', async () => {
  const http = fixture(Response.json({}), missing(), ...idle(), written(), Response.json({ id: 42 }))
  assert.equal((await runTick(env, now, http.fetch)).dispatch, 'accepted')
  assert.equal(http.requests.length, 9)
})

test('an accepted dispatch stays suppressed across ticks while the run list is stale', async () => {
  let state = null
  let posts = 0
  let listings = 0
  const http = async (input, init) => {
    const request = new Request(input, init)
    const path = new URL(request.url).pathname
    if (path.endsWith('current.json')) return manifest()
    if (path.endsWith('cron-dispatch-cooldown.json')) {
      if (request.method === 'GET') return state ? Response.json(state, { headers: { ETag: '"claim"' } }) : missing()
      assert.equal(request.headers.get(state ? 'if-match' : 'if-none-match'), state ? '"claim"' : '*')
      state = await request.json()
      return written()
    }
    if (path.endsWith('/runs')) {
      listings++
      return emptyRuns()
    }
    assert.ok(path.endsWith('/dispatches'))
    posts++
    return accepted()
  }
  assert.equal((await runTick(env, now, http)).dispatch, 'accepted')
  assert.equal((await runTick(env, now + 5 * minute, http)).decision, 'cooldown')
  assert.equal(posts, 1)
  assert.equal(listings, 5)
  assert.equal((await runTick(env, now + 10 * minute, http)).dispatch, 'accepted')
  assert.equal(posts, 2)
})

for (const [label, corrupt] of [
  ['invalid JSON', 'broken cooldown JSON'],
  ['invalid expiry', JSON.stringify({ until: now + 24 * 60 * minute })],
]) {
  test(`repairs a cooldown with ${label} only on an idle tick and suppresses the next tick`, async () => {
    let body = corrupt
    let etag = '"corrupt"'
    let busy = true
    let writes = 0
    let posts = 0
    let idleChecks = 0
    const http = async (input, init) => {
      const request = new Request(input, init)
      const url = new URL(request.url)
      if (url.pathname.endsWith('current.json')) return manifest()
      if (url.pathname.endsWith('cron-dispatch-cooldown.json')) {
        if (request.method === 'GET') {
          assert.equal(request.headers.get('accept-encoding'), 'identity')
          return new Response(body, { headers: { ETag: etag } })
        }
        assert.equal(busy, false)
        assert.equal(idleChecks, 5)
        assert.equal(request.headers.get('if-match'), '"corrupt"')
        body = await request.text()
        etag = '"repaired"'
        writes++
        return written()
      }
      if (url.pathname.endsWith('/runs')) {
        const status = url.searchParams.get('status')
        if (busy && status === 'queued') return Response.json({ total_count: 1, workflow_runs: [{ status }] })
        if (!busy) idleChecks++
        return emptyRuns()
      }
      assert.ok(url.pathname.endsWith('/dispatches'))
      posts++
      return accepted()
    }
    assert.equal((await runTick(env, now, http)).decision, 'active-run')
    assert.deepEqual([writes, posts], [0, 0])
    busy = false
    const repair = await runTick(env, now + 5 * minute, http)
    assert.equal(repair.reason, 'cooldown-repaired')
    assert.equal(repair.dispatch, 'accepted')
    assert.deepEqual(JSON.parse(body), { until: now + 15 * minute })
    assert.equal((await runTick(env, now + 10 * minute, http)).decision, 'cooldown')
    assert.deepEqual([writes, posts, idleChecks], [1, 1, 5])
  })
}

test('a concurrent write during cooldown repair skips dispatch', async () => {
  const http = fixture(manifest(), new Response('{broken', { headers: { ETag: '"corrupt"' } }),
    ...idle(), new Response(null, { status: 412 }))
  assert.equal((await runTick(env, now, http.fetch)).decision, 'cooldown')
  assert.equal(http.requests.at(-1).headers.get('if-match'), '"corrupt"')
  assert.equal(http.requests.some((request) => request.method === 'POST'), false)
})

test('a competing reservation stops dispatch even if GitHub reports no active runs', async () => {
  const http = fixture(manifest(), missing(), ...idle(), new Response(null, { status: 412 }))
  assert.equal((await runTick(env, now, http.fetch)).decision, 'cooldown')
  assert.equal(http.requests.length, 8)
  assert.equal(http.requests.some((request) => request.method === 'POST'), false)
})

test('only an explicit missing object is treated as a missing manifest', async () => {
  const http = fixture(new Response('<Error><Code>NoSuchBucket</Code></Error>', { status: 404 }))
  assert.deepEqual(await runTick(env, now, http.fetch), {
    ageMs: null, decision: 'error', dispatch: 'skipped', stage: 'manifest', reason: 'http-error', status: 404,
  })
  assert.equal(http.requests.length, 1)
})

test('a failed or malformed run lookup prevents dispatch', async () => {
  for (const response of [new Response('denied', { status: 403 }), Response.json({ workflow_runs: [{}] })]) {
    const http = fixture(manifest(), missing(), response)
    const result = await runTick(env, now, http.fetch)
    assert.equal(result.stage, 'list-runs')
    assert.equal(result.dispatch, 'skipped')
    assert.equal(http.requests.length, 3)
  }
})

test('an explicit dispatch rejection releases the reservation for the next tick', async () => {
  const http = fixture(manifest(), missing(), ...idle(), written(), new Response('denied', { status: 403 }), written())
  assert.deepEqual(await runTick(env, now, http.fetch), {
    ageMs: 13 * minute, decision: 'error', dispatch: 'failed', stage: 'dispatch', reason: 'http-error', status: 403,
  })
  assert.equal(http.requests.length, 10)
  const release = http.requests.at(-1)
  assert.equal(release.headers.get('if-match'), '"claim"')
  assert.deepEqual(await release.json(), { until: now })
})

test('missing release metadata preserves the rejection status without an unconditional write', async () => {
  const http = fixture(manifest(), missing(), ...idle(), new Response(null), new Response('denied', { status: 403 }))
  assert.deepEqual(await runTick(env, now, http.fetch), {
    ageMs: 13 * minute, decision: 'error', dispatch: 'failed', stage: 'cooldown-release', reason: 'invalid-cooldown-etag', status: 403,
  })
  assert.equal(http.requests.length, 9)
})

test('ambiguous dispatch failures retain the reservation and redact the exception', async () => {
  const raw = 'r2-test-key r2-test-secret github-test-token'
  for (const response of [new Error(raw), new Response(raw, { status: 503 })]) {
    const http = fixture(manifest(), missing(), ...idle(), written(), response)
    assert.deepEqual(await runTick(env, now, http.fetch), {
      ageMs: 13 * minute, decision: 'error', dispatch: 'failed', stage: 'dispatch',
      ...(response instanceof Response ? { reason: 'http-error', status: 503 } : { reason: 'request-failed' }),
    })
    assert.equal(http.requests.length, 9)
  }
})

test('the scheduled entrypoint exposes only a cron handler and logs one controlled record', async (t) => {
  assert.deepEqual(Object.keys(worker), ['scheduled'])
  const raw = 'r2-test-key r2-test-secret github-test-token'
  const http = fixture(new Response(raw), new DOMException(raw, 'TimeoutError'))
  t.mock.method(globalThis, 'fetch', http.fetch)
  const log = t.mock.method(console, 'log', () => {})
  await worker.scheduled({ scheduledTime: now }, env)
  await worker.scheduled({ scheduledTime: now + 5 * minute }, env)
  assert.equal(log.mock.callCount(), 2)
  for (const [i, { arguments: [line] }] of log.mock.calls.entries()) {
    assert.deepEqual(JSON.parse(line), {
      event: 'feed_refresh_tick', ageMs: null, decision: 'error', dispatch: 'skipped', stage: 'manifest',
      reason: i === 0 ? 'invalid-manifest-json' : 'request-timeout',
    })
    assert.doesNotMatch(line, /r2-test-key|r2-test-secret|github-test-token|\n/)
  }
})
