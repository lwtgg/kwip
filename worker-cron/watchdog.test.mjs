import assert from 'node:assert/strict'
import { test } from 'node:test'
import { alertBudget, alertKey, decideAlert, decideIssue } from './watchdog.mjs'
import { runTick, runWatchdogTick } from './index.mjs'

const minute = 60_000
const now = Date.parse('2026-11-23T12:00:00.000Z')
const env = {
  R2_BUCKET: 'kwip-feed-prod', GITHUB_REFRESH_TOKEN: 'private-github-token',
  R2_CREDENTIALS: JSON.stringify({ bucket: 'kwip-feed-prod', accountId: 'a'.repeat(32),
    endpoint: `https://${'a'.repeat(32)}.r2.cloudflarestorage.com`, accessKeyId: 'private-key', secretAccessKey: 'private-secret' }),
}
const issue = (number = 7, updated = now - 31 * minute) => ({ number, state: 'open',
  repository_url: 'https://api.github.com/repos/lwtgg/kwip', body: 'Original incident', updated_at: new Date(updated).toISOString() })
const stale = (ageMs = 46 * minute, patch = {}) => ({ ageMs, decision: 'active-run', dispatch: 'skipped', ...patch })

for (const [label, result, previous, hold, action, reason] of [
  ['first hard miss', stale(), {}, {}, 'none'],
  ['second hard miss', stale(), { hardTicks: 1 }, {}, 'notify', 'manifest-too-old'],
  ['exact hard boundary', stale(45 * minute), { hardTicks: 1 }, {}, 'none'],
  ['hard counter resets', stale(44 * minute), { hardTicks: 1 }, {}, 'none'],
  ['stalled', stale(30 * minute, { decision: 'stalled' }), {}, {}, 'notify', 'stalled'],
  ['grace inclusive', stale(15 * minute, { decision: 'stalled' }), {}, {}, 'none', 'stalled'],
  ['grace passed', stale(15 * minute + 1, { decision: 'stalled' }), {}, {}, 'notify', 'stalled'],
  ['hold', stale(60 * minute, { decision: 'stalled' }), {}, { paused: true }, 'none', 'stalled'],
  ['retry hold', stale(60 * minute, { decision: 'stalled' }), {}, { retryNotBefore: new Date(now + minute).toISOString() }, 'none', 'stalled'],
  ['expired hold', stale(60 * minute, { decision: 'stalled' }), {}, { retryNotBefore: new Date(now).toISOString() }, 'notify', 'stalled'],
  ['first rejection', stale(30 * minute, { dispatch: 'failed', status: 422 }), {}, {}, 'none'],
  ['second rejection', stale(30 * minute, { dispatch: 'failed', status: 422 }), { rejections: 1 }, {}, 'notify', 'dispatch-rejected'],
  ['provider 5xx', stale(30 * minute, { dispatch: 'failed', status: 503 }), { rejections: 1 }, {}, 'none'],
  ['invalid credentials', stale(30 * minute, { reason: 'invalid-r2-credentials' }), {}, {}, 'notify', 'invalid-r2-credentials'],
  ['missing token', stale(30 * minute, { reason: 'missing-github-token' }), {}, {}, 'notify', 'missing-github-token'],
  ['expired token', stale(30 * minute, { stage: 'list-runs', status: 401 }), {}, {}, 'notify', 'github-token-rejected'],
  ['forbidden token', stale(30 * minute, { stage: 'reconcile-run', status: 403 }), {}, {}, 'notify', 'github-token-rejected'],
  ['paused workflow', stale(30 * minute, { reason: 'workflow-paused' }), {}, {}, 'notify', 'workflow-paused'],
  ['disabled workflow', stale(30 * minute, { reason: 'workflow-disabled' }), {}, {}, 'notify', 'workflow-disabled'],
  ['unknown first observation', stale(null, { reason: 'invalid-r2-credentials' }), {}, {}, 'none', 'invalid-r2-credentials'],
  ['unknown sustained', stale(null, { reason: 'invalid-r2-credentials' }), { since: now - 15 * minute }, {}, 'notify', 'invalid-r2-credentials'],
  ['healthy recovery', { ageMs: minute, decision: 'fresh' }, { issue: 7 }, {}, 'close'],
]) {
  test(`alert decision: ${label}`, () => {
    const decision = decideAlert(result, previous, now, hold)
    assert.equal(decision.action, action)
    assert.equal(decision.reason, reason)
  })
}

test('one issue, comment throttle and budget boundaries', () => {
  assert.equal(decideIssue('notify', {}, [], now).action, 'create')
  assert.equal(decideIssue('notify', { pendingCreate: true }, [], now).action, 'unconfirmed')
  assert.equal(decideIssue('notify', {}, [issue()], now).action, 'comment')
  assert.equal(decideIssue('notify', { notifiedAt: now - 30 * minute + 1 }, [issue()], now).action, 'none')
  assert.equal(decideIssue('notify', { notifiedAt: now - 30 * minute }, [issue()], now).action, 'comment')
  assert.equal(decideIssue('notify', {}, [issue(7, now)], now).action, 'none')
  assert.equal(decideIssue('close', {}, [issue()], now).action, 'close')
  assert.equal(alertBudget(15 * minute), 0)
  assert.equal(alertBudget(15 * minute + 1), 5)
  assert.equal(alertBudget(minute, true), 5)
})

// Stateful HTTP simulation exercises signed R2, CAS, Github mutations, and restarts.
export function simulation() {
  const objects = new Map()
  const issues = []
  const calls = []
  let generationAt = now - 11 * minute
  let etag = 0
  let fail
  let beforeClaim
  const missing = () => new Response('<Code>NoSuchKey</Code>', { status: 404 })
  const put = (key, value) => objects.set(key, { value, etag: `"${++etag}"` })
  const request = async (input, options) => {
    const request = new Request(input, options)
    const url = new URL(request.url)
    calls.push({ method: request.method, path: url.pathname, url: request.url, body: options?.body, auth: request.headers.get('authorization') })
    const failure = fail?.(request)
    if (failure instanceof Error) throw failure
    if (failure) return failure
    if (url.host.endsWith('r2.cloudflarestorage.com')) {
      const key = url.pathname.split('/').slice(2).join('/')
      if (key === 'current.json') return Response.json({ listsVerifiedAt: new Date(generationAt).toISOString(), commitId: 'generation-48' })
      if (request.method === 'GET') {
        const stored = objects.get(key)
        return stored ? Response.json(stored.value, { headers: { ETag: stored.etag } }) : missing()
      }
      const body = await request.json()
      if (key === alertKey && beforeClaim) await beforeClaim()
      const stored = objects.get(key)
      if (request.headers.get('if-match') !== (stored?.etag ?? null) ||
          (!stored && request.headers.get('if-none-match') !== '*')) return new Response(null, { status: 412 })
      put(key, body)
      return new Response(null, { headers: { ETag: objects.get(key).etag } })
    }
    if (url.pathname === '/search/issues') {
      assert.match(url.searchParams.get('q'), /repo:lwtgg\/kwip is:issue is:open label:feed-stale/)
      return Response.json({ total_count: issues.filter((i) => i.state === 'open').length,
        incomplete_results: false, items: issues.filter((i) => i.state === 'open').slice(0, 1) })
    }
    if (url.pathname.endsWith('/actions/workflows/feed-refresh.yml')) return Response.json({ state: 'active' })
    if (url.pathname.endsWith('/actions/runs/42')) return Response.json({ id: 42, status: 'in_progress' })
    if (url.pathname.endsWith('/runs')) return Response.json({ total_count: 0, workflow_runs: [] })
    if (url.pathname.endsWith('/dispatches')) return new Response(null, { status: 204 })
    if (url.pathname.endsWith('/issues')) {
      const data = await request.json()
      assert.equal(data.title, 'Feed refresh stalled')
      assert.deepEqual(data.labels, ['feed-stale'])
      issues.push({ ...issue(7, now), ...data })
      return Response.json(issues.at(-1), { status: 201 })
    }
    if (url.pathname.endsWith('/comments')) return Response.json({ id: 123 }, { status: 201 })
    if (request.method === 'GET' && url.pathname.endsWith('/issues/7')) return Response.json(issues[0])
    if (request.method === 'PATCH') {
      Object.assign(issues[0], await request.json())
      return Response.json(issues[0])
    }
    throw new Error(`Unexpected request: ${url.pathname}`)
  }
  return { objects, issues, calls, put, request,
    set generationAt(value) { generationAt = value },
    set fail(value) { fail = value }, set beforeClaim(value) { beforeClaim = value },
    tick(time = now) { calls.length = 0; return runWatchdogTick(env, time, request) },
  }
}

test('healthy → stale → alert → still stale → recovery with request counts', async () => {
  const sim = simulation()
  const transition = []
  transition.push(['healthy', await sim.tick()])
  sim.generationAt = now - 46 * minute
  sim.put('cron-dispatch-cooldown.json', { attemptAt: now - 40 * minute, runId: 42 })
  transition.push(['stale', await sim.tick()])
  transition.push(['alert', await sim.tick(now + 5 * minute)])
  assert.equal(sim.issues.length, 1)
  assert.match(sim.issues[0].body, /generation-48/)
  assert.match(sim.issues[0].body, /cron-dispatch-cooldown.json/)
  assert.match(sim.issues[0].body, /actions\/runs\/42/)
  transition.push(['still stale', await sim.tick(now + 10 * minute)])
  assert.equal(sim.issues.length, 1)
  assert.equal(sim.calls.some((c) => c.path.endsWith('/comments')), false)
  sim.generationAt = now + 15 * minute
  transition.push(['recovery', await sim.tick(now + 15 * minute)])
  assert.equal(sim.issues[0].state, 'closed')
  assert.match(sim.issues[0].body, /Recovered: manifest age 0 minutes; feed verification resumed/)
  for (const [phase, result] of transition) {
    console.log(JSON.stringify({ phase, refresh: result.refreshSubrequests, extra: result.alertSubrequests, total: result.subrequests, action: result.alert.action }))
  }
  assert.deepEqual(transition.map(([, r]) => [r.alert.action, r.subrequests, r.alertSubrequests]), [
    ['none', 2, 0], ['none', 7, 4], ['create', 8, 5], ['none', 7, 4], ['close', 6, 4],
  ])
})

for (const [label, status] of [['forbidden', 403], ['expired', 401], ['server', 503], ['redirect', 302]]) {
  test(`best-effort issue ${label} does not change refresh outcome`, async () => {
    const sim = simulation()
    sim.generationAt = now - 60 * minute
    sim.put('cron-dispatch-cooldown.json', { attemptAt: now - 40 * minute, runId: 42 })
    sim.put(alertKey, { hardTicks: 1, verifiedAt: new Date(now - 60 * minute).toISOString() })
    sim.fail = (r) => new URL(r.url).pathname === '/search/issues' ? new Response(null, { status }) : undefined
    const result = await sim.tick()
    assert.equal(result.decision, 'active-run')
    assert.equal(result.alert.reason, status === 403 ? 'missing-issues-scope' : 'alert-search-failed')
    assert.equal(sim.calls.filter((c) => c.path === '/search/issues').length, 1)
    assert.ok(result.alertSubrequests <= 5)
  })
}

for (const key of ['collector-state.json', alertKey]) {
  test(`alert R2 read failure for ${key} is contained`, async () => {
    const sim = simulation()
    sim.generationAt = now - 60 * minute
    sim.fail = (r) => r.url.endsWith(key) ? new Response(null, { status: 503 }) : undefined
    const result = await sim.tick()
    assert.equal(result.dispatch, 'accepted')
    assert.equal(result.alert.action, 'error')
    assert.ok(result.alertSubrequests <= 5)
  })
}

test('hold is read once and suppresses alerting; a single 5xx stays silent', async () => {
  const sim = simulation()
  sim.generationAt = now - 60 * minute
  sim.put('collector-state.json', { paused: true })
  sim.put(alertKey, { hardTicks: 1, verifiedAt: new Date(now - 60 * minute).toISOString() })
  let result = await sim.tick()
  assert.equal(result.alert.action, 'none')
  assert.equal(sim.calls.filter((c) => c.path.endsWith('/collector-state.json')).length, 1)
  assert.equal(sim.calls.some((c) => c.path === '/search/issues'), false)
  sim.generationAt = now - 20 * minute
  sim.objects.delete('collector-state.json')
  sim.fail = (r) => r.url.includes('/runs') ? new Response(null, { status: 503 }) : undefined
  result = await sim.tick()
  assert.equal(result.alert.action, 'none')
})

test('an ambiguous create is never repeated after a restart or search-index lag', async () => {
  const sim = simulation()
  sim.generationAt = now - 60 * minute
  sim.put(alertKey, { hardTicks: 1, verifiedAt: new Date(now - 60 * minute).toISOString() })
  sim.fail = (r) => r.method === 'POST' && r.url.endsWith('/issues') ? new DOMException('private-token', 'TimeoutError') : undefined
  const first = await sim.tick()
  assert.equal(first.alert.action, 'error')
  assert.equal(sim.objects.get(alertKey).value.pendingCreate, true)
  sim.fail = undefined
  const second = await sim.tick(now + 5 * minute)
  assert.equal(second.alert.action, 'unconfirmed')
  assert.equal(sim.calls.some((c) => c.method === 'POST' && c.path.endsWith('/issues')), false)
  assert.doesNotMatch(JSON.stringify(first), /private-token/)
})

test('concurrent creators are excluded by the alert-state CAS', async () => {
  const sim = simulation()
  sim.generationAt = now - 60 * minute
  sim.put(alertKey, { hardTicks: 1, verifiedAt: new Date(now - 60 * minute).toISOString() })
  let arriving = 0
  let release
  const barrier = new Promise((resolve) => { release = resolve })
  sim.beforeClaim = async () => { if (++arriving === 2) release(); await barrier }
  const results = await Promise.all([sim.tick(), sim.tick()])
  assert.equal(sim.issues.length, 1)
  assert.equal(results.filter((r) => r.alert.action === 'conflict').length, 1)
})

test('incomplete search never creates a duplicate', async () => {
  const sim = simulation()
  sim.generationAt = now - 60 * minute
  sim.put(alertKey, { hardTicks: 1, verifiedAt: new Date(now - 60 * minute).toISOString() })
  sim.fail = (r) => r.url.includes('/search/issues') ? Response.json({ total_count: 0, items: [], incomplete_results: true }) : undefined
  assert.equal((await sim.tick()).alert.reason, 'invalid-issue-search')
  assert.equal(sim.issues.length, 0)
})

test('dispatch rejection twice pages within fifteen total subrequests', async () => {
  const sim = simulation()
  sim.generationAt = now - 20 * minute
  sim.fail = (r) => r.url.endsWith('/dispatches') ? new Response(null, { status: 422 }) : undefined
  const first = await sim.tick()
  assert.equal(first.alert.action, 'none')
  assert.equal(first.refreshSubrequests, 10)
  assert.equal(first.alertSubrequests, 4)
  const second = await sim.tick(now + 5 * minute)
  assert.equal(second.alert.action, 'create')
  assert.equal(second.subrequests, 15)
  assert.match(sim.issues[0].body, /dispatch-rejected/)
})

for (const status of [401, 403]) {
  test(`rejected Actions token ${status} attempts best-effort paging`, async () => {
    const sim = simulation()
    sim.generationAt = now - 20 * minute
    sim.fail = (r) => r.url.includes('/actions/') ? new Response(null, { status }) : undefined
    const result = await sim.tick()
    assert.equal(result.status, status)
    assert.equal(result.alert.action, 'create')
    assert.match(sim.issues[0].body, /github-token-rejected/)
    assert.equal(result.alertSubrequests, 5)
  })
}

for (const state of ['paused', 'disabled_manually', 'disabled_inactivity']) {
  test(`workflow metadata ${state} is saved then pages without a sixth request`, async () => {
    const sim = simulation()
    sim.generationAt = now - 20 * minute
    sim.fail = (r) => r.url.endsWith('/actions/workflows/feed-refresh.yml') ? Response.json({ state }) : undefined
    const first = await sim.tick()
    assert.equal(first.alert.action, 'none')
    assert.equal(first.alertSubrequests, 4)
    const next = await sim.tick(now + 5 * minute)
    assert.equal(next.alert.action, 'create')
    assert.equal(next.alertSubrequests, 5)
    assert.match(sim.issues[0].body, /workflow-disabled/)
  })
}

test('an action-required matching run pages as paused', async () => {
  const sim = simulation()
  sim.generationAt = now - 30 * minute
  sim.put('cron-dispatch-cooldown.json', { attemptAt: now - 20 * minute, runId: 42 })
  sim.fail = (r) => r.url.endsWith('/actions/runs/42') ? Response.json({ id: 42, status: 'completed', conclusion: 'action_required' }) : undefined
  const result = await sim.tick()
  assert.equal(result.reason, 'workflow-paused')
  assert.equal(result.alert.action, 'create')
})

test('missing token logs a fixed error without changing refresh failure', async () => {
  const sim = simulation()
  sim.generationAt = now - 30 * minute
  const result = await runWatchdogTick({ ...env, GITHUB_REFRESH_TOKEN: '' }, now, sim.request)
  assert.equal(result.reason, 'missing-github-token')
  assert.equal(result.alert.reason, 'missing-github-token')
  assert.equal(sim.calls.some((c) => c.path === '/search/issues'), false)
})

for (const mutation of ['create', 'comment', 'close']) {
  for (const failure of [403, 503, 'timeout']) {
    test(`${mutation} ${failure} is best-effort, bounded and never retried in the tick`, async () => {
      const sim = simulation()
      sim.generationAt = now - 60 * minute
      sim.put(alertKey, { hardTicks: 1, verifiedAt: new Date(now - 60 * minute).toISOString() })
      if (mutation !== 'create') {
        sim.issues.push(issue())
        sim.put(alertKey, { issue: 7, hardTicks: 1, verifiedAt: new Date(now - 60 * minute).toISOString() })
      }
      if (mutation === 'close') sim.generationAt = now
      sim.fail = (r) => {
        if (!r.url.includes('/issues') || r.method === 'GET') return
        return failure === 'timeout' ? new DOMException('private-secret', 'TimeoutError') : new Response(null, { status: failure })
      }
      const result = await sim.tick()
      assert.equal(result.decision, mutation === 'close' ? 'fresh' : 'dispatch')
      assert.equal(result.alert.action, 'error')
      assert.equal(result.alert.reason, failure === 403 ? 'missing-issues-scope' : `alert-${mutation}-failed`)
      if (mutation === 'create' && failure === 403) {
        assert.equal(result.alertSubrequests, 6)
        assert.equal(sim.calls.filter((c) => c.method === 'PUT' && c.path.endsWith(`/${alertKey}`)).length, 2)
      } else {
        assert.ok(result.alertSubrequests <= 5, 'normal alert paths retain the five-request ceiling')
      }
      assert.equal(sim.calls.filter((c) => c.path.includes('/issues') && c.method !== 'GET').length, 1)
      assert.doesNotMatch(JSON.stringify(result), /private-secret/)
    })
  }
}

test('failed conditional alert write never sends a notification', async () => {
  for (const status of [412, 503]) {
    const sim = simulation()
    sim.generationAt = now - 60 * minute
    sim.put(alertKey, { hardTicks: 1, verifiedAt: new Date(now - 60 * minute).toISOString() })
    sim.fail = (r) => r.url.endsWith(alertKey) && r.method === 'PUT' ? new Response(null, { status }) : undefined
    const result = await sim.tick()
    assert.equal(result.dispatch, 'accepted')
    assert.equal(result.alert.action, status === 412 ? 'conflict' : 'error')
    assert.equal(sim.issues.length, 0)
  }
})

test('healthy after one stale miss uses no extra calls and resets the next incident', async () => {
  const sim = simulation()
  sim.generationAt = now - 60 * minute
  await sim.tick()
  sim.generationAt = now
  const healthy = await sim.tick()
  assert.equal(healthy.subrequests, 2)
  assert.equal(healthy.alertSubrequests, 0)
  const next = await sim.tick(now + 46 * minute)
  assert.equal(next.alert.action, 'none')
  assert.equal(sim.issues.length, 0)
})

test('grace ticks use no extra requests, including a missing manifest before reservation grace', async () => {
  const sim = simulation()
  sim.generationAt = now - 15 * minute
  const result = await sim.tick()
  assert.equal(result.alert.action, 'grace')
  assert.equal(result.alertSubrequests, 0)
  assert.equal(sim.calls.some((c) => c.path.endsWith('/collector-state.json')), false)
  sim.fail = (r) => r.url.endsWith('/current.json') ? new Response('<Code>NoSuchKey</Code>', { status: 404 }) : undefined
  const missing = await sim.tick(now + 5 * minute)
  assert.equal(missing.ageMs, null)
  assert.equal(missing.alertSubrequests, 0)
})

test('recovery and a new stale tick preserve pending create while search lags', async () => {
  const sim = simulation()
  sim.generationAt = now - 60 * minute
  sim.put(alertKey, { hardTicks: 1, verifiedAt: new Date(now - 60 * minute).toISOString() })
  assert.equal((await sim.tick()).alert.action, 'create')
  sim.fail = (r) => r.url.includes('/search/issues') ? Response.json({ total_count: 0, incomplete_results: false, items: [] }) : undefined
  sim.generationAt = now
  assert.equal((await sim.tick()).alert.action, 'unconfirmed')
  assert.equal(sim.objects.get(alertKey).value.pendingCreate, true)
  sim.generationAt = now - 60 * minute
  const again = await sim.tick(now + 5 * minute)
  assert.equal(again.alert.action, 'unconfirmed')
  assert.equal(sim.issues.length, 1)
  sim.fail = undefined
  sim.generationAt = now + 10 * minute
  assert.equal((await sim.tick(now + 10 * minute)).alert.action, 'close')
  assert.equal(sim.issues[0].state, 'closed')
})

test('a known open issue omitted by search is closed using a direct lookup within recovery budget', async () => {
  const sim = simulation()
  sim.issues.push(issue())
  sim.put(alertKey, { issue: 7 })
  sim.fail = (r) => r.url.includes('/search/issues') ? Response.json({ total_count: 0, incomplete_results: false, items: [] }) : undefined
  const result = await sim.tick()
  assert.equal(result.alert.action, 'close')
  assert.equal(result.alertSubrequests, 5)
  assert.equal(sim.issues[0].state, 'closed')
})

test('a manually closed known issue permits the next sustained incident, without blind creation', async () => {
  const sim = simulation()
  sim.generationAt = now - 60 * minute
  sim.issues.push({ ...issue(), state: 'closed' })
  sim.put(alertKey, { issue: 7, hardTicks: 2, verifiedAt: new Date(now - 60 * minute).toISOString() })
  const reconcile = await sim.tick()
  assert.equal(reconcile.alertSubrequests, 5)
  assert.equal(sim.issues.length, 1)
  assert.equal((await sim.tick(now + 5 * minute)).alert.action, 'create')
  assert.equal(sim.issues.filter((i) => i.state === 'open').length, 1)
})

for (const status of [400, 401, 403, 404, 422, 429]) {
  test(`definitive create rejection ${status} clears intent and retries after repair`, async () => {
    const sim = simulation()
    sim.generationAt = now - 60 * minute
    sim.put(alertKey, { hardTicks: 1, verifiedAt: new Date(now - 60 * minute).toISOString() })
    let posts = 0
    sim.fail = (r) => {
      if (r.method === 'POST' && r.url.endsWith('/issues') && ++posts === 1) return new Response(null, { status })
    }
    const rejected = await sim.tick()
    assert.equal(rejected.alert.action, 'error')
    assert.equal(sim.objects.get(alertKey).value.pendingCreate, undefined)
    assert.equal(rejected.alertSubrequests, 6)
    assert.equal((await sim.tick(now + 5 * minute)).alert.action, 'create')
    assert.equal((await sim.tick(now + 10 * minute)).alert.action, 'none')
    assert.equal(posts, 2)
    assert.equal(sim.issues.length, 1)
  })
}

for (const failure of ['unreadable', 'timeout', 'malformed', 'invalid-timestamp']) {
  test(`independent failure observation gives ${failure} manifest a finite grace across restarts`, async () => {
    const sim = simulation()
    sim.fail = (r) => {
      if (!r.url.endsWith('/current.json')) return
      if (failure === 'unreadable') return new Response(null, { status: 503 })
      if (failure === 'timeout') return new DOMException('private-secret', 'TimeoutError')
      if (failure === 'malformed') return new Response('invalid JSON')
      return Response.json({ listsVerifiedAt: 'invalid timestamp' })
    }
    for (const elapsed of [0, 5, 10, 15]) {
      const result = await sim.tick(now + elapsed * minute)
      assert.equal(result.ageMs, null)
      assert.equal(result.decision, 'error')
      assert.equal(result.alert.action, elapsed === 15 ? 'create' : 'none')
      assert.equal(result.alertSubrequests, elapsed === 15 ? 5 : 3)
      assert.equal(sim.objects.get(alertKey).value.firstFailureAt, now)
      assert.doesNotMatch(JSON.stringify(result), /private-secret/)
    }
    assert.equal(sim.issues.length, 1)
    assert.match(sim.issues[0].body, /feed-state-unavailable/)
    assert.equal((await sim.tick(now + 20 * minute)).alert.action, 'none')
    assert.equal(sim.issues.length, 1)
    sim.fail = undefined
    sim.generationAt = now + 25 * minute
    assert.equal((await sim.tick(now + 25 * minute)).alert.action, 'close')
    assert.equal((await sim.tick(now + 30 * minute)).alertSubrequests, 0)
  })
}

for (const status of [302, 408, 499, 500, 503]) {
  test(`ambiguous create ${status} retains intent and never blindly reposts`, async () => {
    const sim = simulation()
    sim.generationAt = now - 60 * minute
    sim.put(alertKey, { hardTicks: 1, verifiedAt: new Date(now - 60 * minute).toISOString() })
    sim.fail = (r) => r.method === 'POST' && r.url.endsWith('/issues') ? new Response(null, { status }) : undefined
    const result = await sim.tick()
    assert.equal(result.alert.action, 'error')
    assert.equal(result.alertSubrequests, 5)
    assert.equal(sim.objects.get(alertKey).value.pendingCreate, true)
    sim.fail = undefined
    assert.equal((await sim.tick(now + 5 * minute)).alert.action, 'unconfirmed')
    assert.equal(sim.issues.length, 0)
  })
}

test('a definitive create rejection plus dispatch release stays inside the sixteen-request ceiling', async () => {
  const sim = simulation()
  sim.generationAt = now - 30 * minute
  sim.fail = (r) => r.url.endsWith('/dispatches') || (r.method === 'POST' && r.url.endsWith('/issues')) ? new Response(null, { status: 403 }) : undefined
  const result = await sim.tick()
  assert.equal(result.status, 403)
  assert.equal(result.alert.reason, 'missing-issues-scope')
  assert.equal(result.refreshSubrequests, 10)
  assert.equal(result.alertSubrequests, 6)
  assert.equal(result.subrequests, 16)
  assert.equal(sim.objects.get(alertKey).value.pendingCreate, undefined)
})

test('a failed create-intent cleanup is contained and preserves the primary rejection', async () => {
  const sim = simulation()
  sim.generationAt = now - 60 * minute
  sim.put(alertKey, { hardTicks: 1, verifiedAt: new Date(now - 60 * minute).toISOString() })
  let writes = 0
  sim.fail = (r) => {
    if (r.method === 'POST' && r.url.endsWith('/issues')) return new Response(null, { status: 403 })
    if (r.method === 'PUT' && r.url.endsWith(alertKey) && ++writes === 2) return new Response(null, { status: 503 })
  }
  const result = await sim.tick()
  assert.equal(result.dispatch, 'accepted')
  assert.equal(result.alert.reason, 'missing-issues-scope')
  assert.equal(result.alert.intentResetError, 'alert-state-write-failed')
  assert.equal(result.alertSubrequests, 6)
  assert.equal(sim.objects.get(alertKey).value.pendingCreate, true)
})

test('missed cron ticks do not restart the independent failure grace', async () => {
  const sim = simulation()
  sim.fail = (r) => r.url.endsWith('/current.json') ? new Response(null, { status: 503 }) : undefined
  assert.equal((await sim.tick()).alert.action, 'none')
  assert.equal((await sim.tick(now + 20 * minute)).alert.action, 'create')
  assert.equal(sim.objects.get(alertKey).value.firstFailureAt, now)
})

test('a recovered transient unknown-age failure resets the next failure episode', async () => {
  const sim = simulation()
  const failure = (r) => r.url.endsWith('/current.json') ? new Response(null, { status: 503 }) : undefined
  sim.fail = failure
  await sim.tick()
  sim.fail = undefined
  sim.generationAt = now + 5 * minute
  const recovery = await sim.tick(now + 5 * minute)
  assert.equal(recovery.alert.action, 'reset')
  assert.equal(recovery.alertSubrequests, 1)
  assert.equal((await sim.tick(now + 10 * minute)).alertSubrequests, 0)
  sim.fail = failure
  const next = await sim.tick(now + 20 * minute)
  assert.equal(next.alert.action, 'none')
  assert.equal(sim.objects.get(alertKey).value.firstFailureAt, now + 20 * minute)
  assert.equal(sim.issues.length, 0)
})

test('an unknown-age failure still respects an explicit hold while observing finite grace', async () => {
  const sim = simulation()
  sim.put('collector-state.json', { paused: true })
  sim.fail = (r) => r.url.endsWith('/current.json') ? new Response(null, { status: 503 }) : undefined
  await sim.tick()
  const held = await sim.tick(now + 20 * minute)
  assert.equal(held.alert.action, 'none')
  assert.equal(held.alertSubrequests, 3)
  assert.equal(sim.calls.some((c) => c.path === '/search/issues'), false)
  sim.objects.delete('collector-state.json')
  assert.equal((await sim.tick(now + 25 * minute)).alert.action, 'create')
})

for (const hold of [{ paused: true }, { retryNotBefore: new Date(now + 30 * minute).toISOString() }]) {
  test(`publisher collector-state ${JSON.stringify(hold)} suppresses alerts without another hold key`, async () => {
    const sim = simulation()
    sim.generationAt = now - 60 * minute
    sim.put(alertKey, { hardTicks: 1, verifiedAt: new Date(now - 60 * minute).toISOString() })
    sim.put('collector-state.json', hold)
    const held = await sim.tick()
    assert.equal(held.alert.action, 'none')
    assert.equal(held.alertSubrequests, 3)
    assert.equal(sim.calls.filter((c) => c.path.endsWith('/collector-state.json')).length, 1)
    assert.equal(sim.calls.some((c) => c.path.endsWith('/backoff.json')), false)
    assert.equal(sim.calls.some((c) => c.path === '/search/issues'), false)
    sim.objects.delete('collector-state.json')
    assert.equal((await sim.tick(now + 5 * minute)).alert.action, 'create')
  })
}

test('legacy backoff.json is not authoritative over the publisher state', async () => {
  const sim = simulation()
  sim.generationAt = now - 60 * minute
  sim.put(alertKey, { hardTicks: 1, verifiedAt: new Date(now - 60 * minute).toISOString() })
  sim.put('collector-state.json', {})
  sim.put('backoff.json', { paused: true })
  assert.equal((await sim.tick()).alert.action, 'create')
  assert.equal(sim.calls.some((c) => c.path.endsWith('/backoff.json')), false)
})

for (const failure of ['missing', 401, 403]) {
  test(`independent alert token reports ${failure} refresh token`, async () => {
    const sim = simulation()
    sim.generationAt = now - 30 * minute
    const credentials = { ...env, GITHUB_ALERT_TOKEN: 'private-alert-token',
      GITHUB_REFRESH_TOKEN: failure === 'missing' ? '' : env.GITHUB_REFRESH_TOKEN }
    sim.fail = (r) => r.url.includes('/actions/') ? new Response(null, { status: failure }) : undefined
    const result = await runWatchdogTick(credentials, now, sim.request)
    assert.equal(result.reason, failure === 'missing' ? 'missing-github-token' : 'http-error')
    assert.equal(result.alert.action, 'create')
    assert.equal(result.alertSubrequests, 5)
    assert.match(sim.issues[0].body, failure === 'missing' ? /missing-github-token/ : /github-token-rejected/)
    const issueCalls = sim.calls.filter((c) => c.path === '/search/issues' || c.path.includes('/issues'))
    assert.equal(issueCalls.length, 2)
    assert.ok(issueCalls.every((c) => c.auth === 'Bearer private-alert-token'))
  })
}

test('issue search, create, comment and recovery use alert credentials while workflow metadata uses refresh credentials', async () => {
  const sim = simulation()
  const credentials = { ...env, GITHUB_ALERT_TOKEN: 'private-alert-token' }
  sim.generationAt = now - 20 * minute
  await runWatchdogTick(credentials, now, sim.request)
  const metadata = sim.calls.find((c) => c.path.endsWith('/actions/workflows/feed-refresh.yml'))
  assert.equal(metadata.auth, `Bearer ${env.GITHUB_REFRESH_TOKEN}`)
  sim.generationAt = now - 60 * minute
  sim.put(alertKey, { hardTicks: 1, verifiedAt: new Date(now - 60 * minute).toISOString() })
  assert.equal((await runWatchdogTick(credentials, now, sim.request)).alert.action, 'create')
  sim.issues[0].updated_at = new Date(now - 31 * minute).toISOString()
  assert.equal((await runWatchdogTick(credentials, now + 31 * minute, sim.request)).alert.action, 'comment')
  sim.generationAt = now + 36 * minute
  assert.equal((await runWatchdogTick(credentials, now + 36 * minute, sim.request)).alert.action, 'close')
  assert.ok(sim.calls.filter((c) => c.path === '/search/issues' || c.path.includes('/issues'))
    .every((c) => c.auth === 'Bearer private-alert-token'))
})

test('known-issue lookup and close use the independent token even without a refresh token', async () => {
  const sim = simulation()
  sim.issues.push(issue())
  sim.put(alertKey, { issue: 7 })
  sim.fail = (r) => r.url.includes('/search/issues') ? Response.json({ total_count: 0, incomplete_results: false, items: [] }) : undefined
  const result = await runWatchdogTick({ ...env, GITHUB_REFRESH_TOKEN: '', GITHUB_ALERT_TOKEN: 'private-alert-token' }, now, sim.request)
  assert.equal(result.alert.action, 'close')
  assert.equal(result.alertSubrequests, 5)
  assert.ok(sim.calls.filter((c) => c.path === '/search/issues' || c.path.includes('/issues'))
    .every((c) => c.auth === 'Bearer private-alert-token'))
})

test('an absent alert token falls back to refresh credentials', async () => {
  const sim = simulation()
  sim.generationAt = now - 60 * minute
  sim.put(alertKey, { hardTicks: 1, verifiedAt: new Date(now - 60 * minute).toISOString() })
  assert.equal((await sim.tick()).alert.action, 'create')
  assert.ok(sim.calls.filter((c) => c.path === '/search/issues' || c.path.includes('/issues'))
    .every((c) => c.auth === `Bearer ${env.GITHUB_REFRESH_TOKEN}`))
})

test('a present but rejected alert token is not retried with the refresh token', async () => {
  const sim = simulation()
  sim.generationAt = now - 60 * minute
  sim.put(alertKey, { hardTicks: 1, verifiedAt: new Date(now - 60 * minute).toISOString() })
  sim.fail = (r) => r.url.includes('/search/issues') ? new Response(null, { status: 403 }) : undefined
  const result = await runWatchdogTick({ ...env, GITHUB_ALERT_TOKEN: 'rejected-alert-token' }, now, sim.request)
  assert.equal(result.alert.reason, 'missing-issues-scope')
  const searches = sim.calls.filter((c) => c.path === '/search/issues')
  assert.equal(searches.length, 1)
  assert.equal(searches[0].auth, 'Bearer rejected-alert-token')
  assert.ok(result.alertSubrequests <= 5)
})

for (const failure of [503, 403, 302, 'timeout', 'invalid-json', 'invalid-state']) {
  test(`optional metadata ${failure} cannot lose consecutive hard-age observations`, async () => {
    const sim = simulation()
    sim.generationAt = now - 60 * minute
    sim.put('cron-dispatch-cooldown.json', { attemptAt: now - 50 * minute, runId: 42 })
    let probes = 0
    let posts = 0
    sim.fail = (r) => {
      if (r.method === 'POST' && r.url.endsWith('/issues')) posts++
      if (!r.url.endsWith('/actions/workflows/feed-refresh.yml')) return
      probes++
      if (failure === 'timeout') return new DOMException('private-secret', 'TimeoutError')
      if (failure === 'invalid-json') return new Response('private-secret')
      if (failure === 'invalid-state') return Response.json({ state: null })
      return new Response('private-secret', { status: failure })
    }
    for (let tick = 0; tick < 4; tick++) {
      const result = await sim.tick(now + tick * 5 * minute)
      assert.equal(result.ageMs, (60 + tick * 5) * minute)
      assert.equal(result.decision, 'active-run')
      assert.equal(result.dispatch, 'skipped')
      assert.equal(sim.objects.get(alertKey)?.value.hardTicks, tick + 1)
      if (tick === 0) {
        assert.equal(result.alert.reason, 'alert-workflow-state-failed')
        assert.equal(result.alertSubrequests, 4)
        assert.equal(sim.issues.length, 0)
      } else {
        assert.equal(result.alert.action, tick === 1 ? 'create' : 'none')
        assert.equal(sim.issues.length, 1)
        assert.match(sim.issues[0].body, /manifest-too-old/)
      }
      assert.ok(result.alertSubrequests <= 5)
      assert.doesNotMatch(JSON.stringify(result), /private-secret/)
    }
    assert.equal(probes, 1)
    assert.equal(posts, 1)
  })
}

test('optional metadata failure cannot erase the first explicit dispatch rejection', async () => {
  const sim = simulation()
  sim.generationAt = now - 20 * minute
  sim.fail = (r) => {
    if (r.url.endsWith('/dispatches')) return new Response(null, { status: 422 })
    if (r.url.endsWith('/actions/workflows/feed-refresh.yml')) return new Response(null, { status: 503 })
  }
  const first = await sim.tick()
  assert.equal(first.dispatch, 'failed')
  assert.equal(first.status, 422)
  assert.equal(first.alert.reason, 'alert-workflow-state-failed')
  assert.equal(sim.objects.get(alertKey).value.rejections, 1)
  assert.equal(first.alertSubrequests, 4)
  const second = await sim.tick(now + 5 * minute)
  assert.equal(second.dispatch, 'failed')
  assert.equal(second.status, 422)
  assert.equal(second.alert.action, 'create')
  assert.equal(sim.objects.get(alertKey).value.rejections, 2)
  assert.equal(second.alertSubrequests, 5)
  assert.equal(second.subrequests, 15)
  assert.match(sim.issues[0].body, /dispatch-rejected/)
})
