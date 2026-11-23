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

test('a fresh tick checks for an outstanding reservation', async () => {
  const http = fixture(Response.json({ listsVerifiedAt: timestamp(11) }), missing())
  assert.deepEqual(await runTick(env, now, http.fetch), {
    ageMs: 11 * minute, decision: 'fresh', dispatch: 'skipped',
  })
  assert.equal(http.requests.length, 2)
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
  const { attemptAt, attemptId } = await claim.json()
  assert.equal(attemptAt, now)
  assert.match(attemptId, /^[0-9a-f-]{36}$/)
  assert.equal(dispatch.url, 'https://api.github.com/repos/lwtgg/kwip/actions/workflows/feed-refresh.yml/dispatches')
  assert.equal(dispatch.method, 'POST')
  assert.equal(dispatch.redirect, 'manual')
  assert.equal(dispatch.headers.get('authorization'), 'Bearer github-test-token')
  assert.deepEqual(await dispatch.json(), { ref: 'main', inputs: { cron_attempt: attemptId } })
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
  assert.equal(listings, 6)
  for (let tick = 2; tick <= 7; tick++) {
    const result = await runTick(env, now + tick * 5 * minute, http)
    assert.equal(result.decision, tick >= 6 ? 'stalled' : 'cooldown')
    assert.equal(result.unresolvedTicks, Math.min(tick, 6))
    assert.equal(result.reason, 'run-not-visible')
  }
  assert.equal(posts, 1)
  assert.equal(listings, 12)
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
        if (etag === '"repaired"') {
          assert.equal(request.headers.get('if-match'), etag)
          body = await request.text()
          writes++
          return written()
        }
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
        if (!busy && status) idleChecks++
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
    assert.equal(JSON.parse(body).attemptAt, now + 5 * minute)
    assert.match(JSON.parse(body).attemptId, /^[0-9a-f-]{36}$/)
    assert.equal((await runTick(env, now + 10 * minute, http)).decision, 'cooldown')
    assert.deepEqual([writes, posts, idleChecks], [2, 1, 5])
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
  assert.deepEqual(await release.json(), { clearedAt: now })
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
  for (const response of [new DOMException(raw, 'TimeoutError'), new Response(raw, { status: 408 }), new Response(raw, { status: 503 })]) {
    const http = fixture(manifest(), missing(), ...idle(), written(), response)
    assert.deepEqual(await runTick(env, now, http.fetch), {
      ageMs: 13 * minute, decision: 'error', dispatch: 'failed', stage: 'dispatch',
      ...(response instanceof Response ? { reason: 'http-error', status: response.status } : { reason: 'request-timeout' }),
    })
    assert.equal(http.requests.length, 9)
    const claim = await http.requests.at(-2).json()
    const retry = fixture(manifest(), reservation(claim), Response.json({
      total_count: 1, workflow_runs: [{ id: 42, display_title: `Feed refresh (cron ${claim.attemptId})` }],
    }), written())
    assert.equal((await runTick(env, now + 5 * minute, retry.fetch)).decision, 'run-identified')
    assert.deepEqual(await retry.requests.at(-1).json(), { ...claim, runId: 42 })
  }
})

const reservation = (value = { attemptAt: now }) => Response.json(value, {
  headers: { ETag: '"claim"' },
})

test('manifest advancement clears the reservation even when the manifest is stale again', async () => {
  for (const tick of [now + 5 * minute, now + 20 * minute]) {
    const http = fixture(Response.json({ listsVerifiedAt: timestamp(-1) }), reservation(), written())
    assert.equal((await runTick(env, tick, http.fetch)).decision, 'manifest-advanced')
    const release = http.requests.at(-1)
    assert.equal(release.headers.get('if-match'), '"claim"')
    assert.deepEqual(await release.json(), { clearedAt: tick })
    assert.equal(http.requests.length, 3)
  }
})

test('a skewed matching run can be identified and only that run can release the reservation', async () => {
  const attempt = { attemptAt: now, attemptId: 'unique-attempt' }
  const tick = now + 15 * minute
  const unrelated = { id: 43, status: 'completed', display_title: 'Feed refresh (live)' }
  const matching = {
    id: 42, status: 'completed', display_title: 'Feed refresh (cron unique-attempt)', created_at: timestamp(1),
  }
  const listing = (...entries) => Response.json({ total_count: entries.length, workflow_runs: entries })
  const unrelatedTick = fixture(manifest(), reservation(attempt), listing(unrelated), written())
  assert.equal((await runTick(env, tick, unrelatedTick.fetch)).decision, 'cooldown')
  assert.equal(unrelatedTick.requests.length, 4)

  const oldCursor = { ...attempt, searchFrom: now, searchThrough: now + 299_000, searchUntil: tick, searchPage: 2 }
  const identify = fixture(manifest(), reservation(oldCursor), listing(unrelated, matching), written())
  assert.equal((await runTick(env, tick, identify.fetch)).decision, 'run-identified')
  const query = new URL(identify.requests[2].url).searchParams
  assert.equal(query.get('created'), `${matching.created_at}..${new Date(now + 4 * minute - 1000).toISOString()}`)
  assert.equal(query.get('page'), '1')
  assert.equal(query.get('event'), 'workflow_dispatch')
  const identified = await identify.requests.at(-1).json()
  assert.deepEqual(identified, { ...attempt, runId: 42 })
  assert.equal(identify.requests.at(-1).headers.get('if-match'), '"claim"')

  const nextTick = tick + 5 * minute
  for (const [response, decision] of [
    [new Response(null, { status: 404 }), 'cooldown'],
    [new Response(null, { status: 503 }), 'error'],
    [Response.json(unrelated), 'error'],
    [Response.json({ ...matching, status: 'in_progress' }), 'active-run'],
  ]) {
    const http = fixture(manifest(), reservation(identified), response, written())
    assert.equal((await runTick(env, nextTick, http.fetch)).decision, decision)
    assert.equal(http.requests.length, decision === 'active-run' ? 3 : 4)
    assert.match(http.requests[2].url, /\/actions\/runs\/42$/)
  }

  const completed = fixture(manifest(), reservation(identified), Response.json(matching), written())
  assert.equal((await runTick(env, nextTick, completed.fetch)).decision, 'attempt-dead')
  assert.equal(completed.requests.length, 4)
  const retry = fixture(manifest(), reservation(await completed.requests.at(-1).json()), ...idle(), written(), accepted())
  assert.equal((await runTick(env, nextTick + 5 * minute, retry.fetch)).decision, 'dispatch')
})

test('a legacy reservation surfaces as stalled without attaching an unrelated run', async () => {
  const http = fixture(manifest(), reservation({ until: now + 10 * minute, unresolvedTicks: 5 }), written())
  const result = await runTick(env, now + 15 * minute, http.fetch)
  assert.equal(result.decision, 'stalled')
  assert.equal(result.reason, 'legacy-reservation')
  assert.equal(http.requests.length, 3)
  assert.deepEqual(await http.requests.at(-1).json(), { until: now + 10 * minute, unresolvedTicks: 6 })
})

test('a paginated search resumes with the same bounds and retries the same page after an error', async () => {
  const attempt = { attemptAt: now, attemptId: 'unique-attempt' }
  const first = fixture(manifest(), reservation(attempt), Response.json({
    total_count: 101, workflow_runs: Array.from({ length: 100 }, (_, i) => ({ id: 43 + i })),
  }, { headers: { Link: '<https://api.github.com/example?page=2>; rel="next"' } }), written())
  const firstTick = now + 5 * minute
  assert.equal((await runTick(env, firstTick, first.fetch)).decision, 'cooldown')
  const cursor = await first.requests.at(-1).json()
  assert.deepEqual(cursor, { ...attempt, searchOrigin: now - minute, searchFrom: now - minute, searchPage: 2,
    searchThrough: firstTick - minute - 1000, searchUntil: firstTick, unresolvedTicks: 1 })
  const retry = fixture(manifest(), reservation(cursor), new Response(null, { status: 503 }), written())
  assert.equal((await runTick(env, now + 10 * minute, retry.fetch)).decision, 'error')
  const saved = await retry.requests.at(-1).json()
  assert.deepEqual(saved, { ...cursor, unresolvedTicks: 2 })
  const second = fixture(manifest(), reservation(saved), Response.json({
    total_count: 101, workflow_runs: [{ id: 42, display_title: 'Feed refresh (cron unique-attempt)' }],
  }), written())
  assert.equal((await runTick(env, now + 15 * minute, second.fetch)).decision, 'run-identified')
  const query = new URL(second.requests[2].url).searchParams
  assert.equal(query.get('page'), '2')
  assert.equal(query.get('created'), new URL(first.requests[2].url).searchParams.get('created'))
  assert.deepEqual(await second.requests.at(-1).json(), { ...attempt, runId: 42 })
})

test('six GitHub timeouts mark both listing and identified-run reconciliation stalled', async () => {
  for (const runId of [undefined, 42]) {
    let state = { attemptAt: now, attemptId: 'unique-attempt', runId }
    for (let tick = 1; tick <= 6; tick++) {
      const timeout = new DOMException('private request details', 'TimeoutError')
      const http = fixture(manifest(), reservation(state), timeout, written())
      const result = await runTick(env, now + tick * 5 * minute, http.fetch)
      assert.equal(result.decision, tick === 6 ? 'stalled' : 'error')
      assert.equal(result.reason, 'request-timeout')
      assert.equal(result.stage, 'reconcile-run')
      assert.equal(result.unresolvedTicks, tick)
      assert.equal(http.requests.length, 4)
      assert.equal(http.requests.at(-1).headers.get('if-match'), '"claim"')
      state = await http.requests.at(-1).json()
      assert.equal(state.attemptId, 'unique-attempt')
      assert.equal(state.runId, runId)
      assert.equal(state.unresolvedTicks, tick)
    }
  }
})

test('a counter write failure preserves the GitHub failure reason', async () => {
  const attempt = { attemptAt: now, attemptId: 'unique-attempt' }
  const http = fixture(manifest(), reservation(attempt), new DOMException('timeout', 'TimeoutError'),
    new Response(null, { status: 503 }))
  assert.deepEqual(await runTick(env, now + 5 * minute, http.fetch), {
    ageMs: 18 * minute, stage: 'reconcile-run', dispatch: 'skipped', decision: 'error',
    reason: 'request-timeout', counterWriteError: 'http-error',
  })
})

test('a capped slice is narrowed before advancing to later seconds', async () => {
  const attempt = { attemptAt: now, attemptId: 'unique-attempt' }
  const cap = Response.json({ total_count: 1000, workflow_runs: [{ id: 1000 }] })
  const first = fixture(manifest(), reservation(attempt), cap, written())
  const tick = now + 60 * minute
  const result = await runTick(env, tick, first.fetch)
  assert.equal(result.reason, 'run-search-capped')
  const narrowed = await first.requests.at(-1).json()
  assert.equal(narrowed.searchFrom, now - minute)
  assert.equal(narrowed.searchThrough, now + 89_000)
  assert.equal(narrowed.searchPage, 1)
  assert.equal(new URL(first.requests[2].url).searchParams.get('created'),
    `${timestamp(1)}..${new Date(now + 239_000).toISOString()}`)

  const next = fixture(manifest(), reservation(narrowed), emptyRuns(), written())
  await runTick(env, tick + 5 * minute, next.fetch)
  assert.equal(new URL(next.requests[2].url).searchParams.get('created'),
    `${timestamp(1)}..${new Date(now + 89_000).toISOString()}`)
  const advanced = await next.requests.at(-1).json()
  assert.equal(advanced.searchFrom, now + 90_000)
  assert.equal(advanced.searchThrough, now + 389_000)

  const match = fixture(manifest(), reservation(advanced), Response.json({
    total_count: 1, workflow_runs: [{ id: 42, display_title: 'Feed refresh (cron unique-attempt)' }],
  }), written())
  assert.equal((await runTick(env, tick + 10 * minute, match.fetch)).decision, 'run-identified')
  assert.deepEqual(await match.requests.at(-1).json(), { ...attempt, runId: 42 })
})

test('a search sweep restarts at the skew-adjusted origin as time moves forward', async () => {
  const attempt = {
    attemptId: 'unique-attempt', attemptAt: now, searchOrigin: now - minute, searchFrom: now + 5 * minute,
    searchThrough: now + 10 * minute - 1000, searchUntil: now + 6 * minute,
  }
  const http = fixture(manifest(), reservation(attempt), emptyRuns(), written())
  await runTick(env, now + 30 * minute, http.fetch)
  const next = await http.requests.at(-1).json()
  assert.equal(next.searchFrom, now - minute)
  assert.equal(next.searchUntil, null)
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
    const { alert, alertSubrequests, refreshSubrequests, subrequests, ...logged } = JSON.parse(line)
    assert.equal(alert.action, 'grace')
    assert.equal(alertSubrequests, 0)
    assert.equal(refreshSubrequests, 1)
    assert.equal(subrequests, 1)
    assert.deepEqual(logged, {
      event: 'feed_refresh_tick', ageMs: null, decision: 'error', dispatch: 'skipped', stage: 'manifest',
      reason: i === 0 ? 'invalid-manifest-json' : 'request-timeout',
    })
    assert.doesNotMatch(line, /r2-test-key|r2-test-secret|github-test-token|\n/)
  }
})
