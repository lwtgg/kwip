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

for (const status of ['queued', 'in_progress', 'pending', 'requested', 'waiting']) {
  test(`a stale tick skips dispatch when GitHub returns a ${status} run`, async () => {
    const http = fixture(
      Response.json({ listsVerifiedAt: timestamp(13) }),
      Response.json({ workflow_runs: [{ status }] }),
    )
    assert.deepEqual(await runTick(env, now, http.fetch), {
      ageMs: 13 * minute, decision: 'active-run', dispatch: 'skipped',
    })
    assert.equal(http.requests.length, 2)
    const [, list] = http.requests
    assert.equal(list.method, 'GET')
    assert.equal(new URL(list.url).searchParams.get('branch'), 'main')
  })
}

test('a missing manifest dispatches the production workflow on main when idle', async () => {
  const http = fixture(
    new Response('<Error><Code>NoSuchKey</Code></Error>', { status: 404 }),
    Response.json({ workflow_runs: [{ status: 'completed' }] }),
    new Response(null, { status: 204 }),
  )
  assert.deepEqual(await runTick(env, now, http.fetch), {
    ageMs: null, decision: 'dispatch', dispatch: 'accepted', status: 204,
  })
  assert.equal(http.requests.length, 3)
  const [, , dispatch] = http.requests
  assert.equal(dispatch.url, 'https://api.github.com/repos/lwtgg/kwip/actions/workflows/feed-refresh.yml/dispatches')
  assert.equal(dispatch.method, 'POST')
  assert.equal(dispatch.headers.get('authorization'), 'Bearer github-test-token')
  assert.deepEqual(await dispatch.json(), { ref: 'main' })
})

test('a missing listsVerifiedAt field is eligible for dispatch', async () => {
  const http = fixture(Response.json({}), Response.json({ workflow_runs: [] }), Response.json({ id: 42 }))
  assert.equal((await runTick(env, now, http.fetch)).dispatch, 'accepted')
  assert.equal(http.requests.length, 3)
})

test('a missing bucket or malformed manifest never looks like a missing key', async () => {
  for (const response of [
    new Response('<Error><Code>NoSuchBucket</Code></Error>', { status: 404 }),
    Response.json({ listsVerifiedAt: 'not-a-timestamp' }),
  ]) {
    const http = fixture(response)
    const result = await runTick(env, now, http.fetch)
    assert.equal(result.stage, 'manifest')
    assert.equal(result.dispatch, 'skipped')
    assert.equal(http.requests.length, 1)
  }
})

test('a failed or malformed run lookup prevents dispatch on that tick', async () => {
  for (const response of [new Response('denied', { status: 403 }), Response.json({ workflow_runs: [{}] })]) {
    const http = fixture(Response.json({ listsVerifiedAt: timestamp(13) }), response)
    const result = await runTick(env, now, http.fetch)
    assert.equal(result.stage, 'list-runs')
    assert.equal(result.dispatch, 'skipped')
    assert.equal(http.requests.length, 2)
  }
})

test('a dispatch rejection is returned without retries or secret-bearing error text', async () => {
  for (const response of [new Response('denied', { status: 403 }), new Error('github-test-token')]) {
    const http = fixture(Response.json({ listsVerifiedAt: timestamp(13) }), Response.json({ workflow_runs: [] }), response)
    const result = await runTick(env, now, http.fetch)
    assert.equal(result.stage, 'dispatch')
    assert.equal(result.dispatch, 'failed')
    assert.ok(typeof result.message === 'string' && result.message.length > 0)
    assert.doesNotMatch(result.message, /\n/)
    assert.equal(http.requests.length, 3)
  }
})

test('the scheduled entrypoint exposes only a cron handler and logs one structured record', async (t) => {
  assert.deepEqual(Object.keys(worker), ['scheduled'])
  const http = fixture(new Error('r2-test-secret'))
  t.mock.method(globalThis, 'fetch', http.fetch)
  const log = t.mock.method(console, 'log', () => {})
  await worker.scheduled({ scheduledTime: now }, env)
  assert.equal(log.mock.callCount(), 1)
  const [line] = log.mock.calls[0].arguments
  assert.equal(JSON.parse(line).stage, 'manifest')
  assert.doesNotMatch(line, /\n/)
  assert.match(line, /r2-test-secret/)
})
