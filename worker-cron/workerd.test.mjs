import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { EventEmitter, once } from 'node:events'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
// Exercise the same Workerd runtime that the repository's Wrangler bundles.
const { Miniflare, convertV4MiniflareOptions } = createRequire(require.resolve('wrangler/package.json'))('miniflare')
const configFile = fileURLToPath(new URL('./wrangler.jsonc', import.meta.url))
const { compatibility_date: compatibilityDate } = JSON.parse(readFileSync(configFile, 'utf8'))
const endpoint = `https://${'a'.repeat(32)}.r2.cloudflarestorage.com`
const bucket = 'kwip-feed-prod'
const credentials = {
  bucket, endpoint, accountId: 'a'.repeat(32), accessKeyId: 'workerd-r2-key', secretAccessKey: 'workerd-r2-secret',
}

test('Workerd scheduled handler dispatches and handles both GitHub redirects without following them', { timeout: 30_000 }, async (t) => {
  const output = mkdtempSync(join(tmpdir(), 'kwip-cron-workerd-'))
  t.after(() => rmSync(output, { recursive: true, force: true }))
  const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url))
  execFileSync(process.execPath, [wrangler, 'deploy', '--dry-run', '--config', configFile, '--outdir', output])

  const seen = []
  const logs = new EventEmitter()
  let redirectAt
  let reservation
  let alertRecord
  let hold
  let manifestValue = {}
  let issueRecord
  let runStatus = 'completed'
  let issueFailure
  let issuePosts = 0
  let lastAlert
  let lastMetrics
  const redirect = () => new Response(null, {
    status: 302, headers: { Location: 'https://redirect.invalid/secret' },
  })
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules: true,
    script: readFileSync(join(output, 'index.js'), 'utf8'),
    compatibilityDate,
    bindings: {
      R2_BUCKET: bucket,
      R2_CREDENTIALS: JSON.stringify(credentials),
      GITHUB_REFRESH_TOKEN: 'workerd-github-token',
    },
    handleStructuredLogs({ message }) {
      if (message.includes('feed_refresh_tick')) logs.emit('tick', message)
    },
    outboundService: async (request) => {
      const url = new URL(request.url)
      const signed = request.headers.get('authorization')
      seen.push({ method: request.method, host: url.host, path: url.pathname, auth: signed })
      if (url.origin === endpoint) {
        if (url.pathname.endsWith('/current.json')) return Response.json(manifestValue)
        if (url.pathname.endsWith('/backoff.json')) return hold ? Response.json(hold) : new Response('<Code>NoSuchKey</Code>', { status: 404 })
        if (url.pathname.endsWith('/cron-feed-alert.json')) {
          if (request.method === 'GET') return alertRecord ? Response.json(alertRecord, { headers: { ETag: '"alert"' } }) : new Response('<Code>NoSuchKey</Code>', { status: 404 })
          assert.equal(request.headers.get(alertRecord ? 'if-match' : 'if-none-match'), alertRecord ? '"alert"' : '*')
          alertRecord = await request.json()
          return new Response(null, { headers: { ETag: '"alert"' } })
        }
        if (request.method === 'GET') {
          return reservation
            ? Response.json(reservation, { headers: { ETag: '"reserved"' } })
            : new Response('<Code>NoSuchKey</Code>', { status: 404 })
        }
        if (reservation) {
          assert.equal(request.headers.get('if-match'), '"reserved"')
          reservation = await request.json()
        }
        return new Response(null, { headers: { ETag: '"reserved"' } })
      }
      if (url.host === 'api.github.com') {
        if (url.pathname.endsWith('/actions/workflows/feed-refresh.yml')) return Response.json({ state: 'active' })
        if (url.pathname === '/search/issues') {
          assert.match(url.searchParams.get('q'), /label:feed-stale/)
          return Response.json({ total_count: issueRecord?.state === 'open' ? 1 : 0, incomplete_results: false,
            items: issueRecord?.state === 'open' ? [issueRecord] : [] })
        }
        if (url.pathname.endsWith('/issues')) {
          issuePosts++
          if (issueFailure) return new Response(null, { status: issueFailure })
          issueRecord = { ...await request.json(), number: 7, state: 'open', repository_url: 'https://api.github.com/repos/lwtgg/kwip', updated_at: new Date().toISOString() }
          return Response.json(issueRecord, { status: 201 })
        }
        if (url.pathname.endsWith('/issues/7/comments')) return Response.json({ id: 1 }, { status: 201 })
        if (url.pathname.endsWith('/issues/7') && request.method === 'PATCH') {
          Object.assign(issueRecord, await request.json())
          return Response.json(issueRecord)
        }
        if (url.pathname.endsWith('/runs')) {
          if (redirectAt === 'list-runs') return redirect()
          if (reservation) {
            assert.equal(url.searchParams.get('event'), 'workflow_dispatch')
            assert.match(url.searchParams.get('created'), /Z\.\..+Z$/)
            return Response.json({
              total_count: 1, workflow_runs: [{ id: 42, display_title: 'Feed refresh (cron test-attempt)' }],
            })
          }
          return Response.json({ total_count: 0, workflow_runs: [] })
        }
        if (url.pathname.endsWith('/actions/runs/42')) return Response.json({ id: 42, status: runStatus })
        if (url.pathname.endsWith('/dispatches')) {
          return redirectAt === 'dispatch' ? redirect() : new Response(null, { status: 204 })
        }
      }
      return new Response('Unexpected outbound request', { status: 500 })
    },
  }))
  t.after(() => mf.dispose())
  const worker = await mf.getWorker()
  async function tick(phase) {
    redirectAt = phase
    seen.length = 0
    const logged = once(logs, 'tick', { signal: AbortSignal.timeout(5_000) })
    const result = await worker.scheduled({ cron: '*/5 * * * *' })
    assert.equal(result.outcome, 'ok')
    const [line] = await logged
    assert.doesNotMatch(line, /workerd-r2-key|workerd-r2-secret|workerd-github-token/)
    assert.ok(seen.every(({ host }) => host === 'api.github.com' || host === new URL(endpoint).host))
    const { alert, refreshSubrequests, alertSubrequests, subrequests, ...resultRecord } = JSON.parse(line)
    lastAlert = alert
    lastMetrics = { refreshSubrequests, alertSubrequests, subrequests }
    assert.equal(subrequests, seen.length)
    assert.ok(alertSubrequests <= (alert.stage === 'create' && alert.reason === 'missing-issues-scope' ? 6 : 5))
    return resultRecord
  }

  assert.deepEqual(await tick(), {
    event: 'feed_refresh_tick', ageMs: null, decision: 'dispatch', dispatch: 'accepted', status: 204,
  })
  assert.equal(lastMetrics.refreshSubrequests, 9)
  assert.match(seen[0].auth, /^AWS4-HMAC-SHA256 /)
  assert.ok(seen.some((call) => call.path.endsWith('/dispatches') && call.method === 'POST'))

  for (const phase of ['list-runs', 'dispatch']) {
    const result = await tick(phase)
    assert.equal(result.stage, phase)
    assert.equal(result.status, 302)
    assert.equal(lastMetrics.refreshSubrequests, phase === 'list-runs' ? 3 : 10)
  }

  reservation = { attemptAt: Date.now() - 11 * 60_000, attemptId: 'test-attempt' }
  const failure = await tick('list-runs')
  assert.equal(failure.stage, 'reconcile-run')
  assert.equal(failure.status, 302)
  assert.equal(lastMetrics.refreshSubrequests, 4)
  assert.equal(reservation.unresolvedTicks, 1)
  assert.equal((await tick()).decision, 'run-identified')
  assert.equal(reservation.runId, 42)
  assert.equal(lastMetrics.refreshSubrequests, 4)
  assert.equal((await tick()).decision, 'attempt-dead')
  assert.ok(Number.isSafeInteger(reservation.clearedAt))
  assert.equal(lastMetrics.refreshSubrequests, 4)

  // Same bundled scheduled handler: durable state and all issue mutation paths.
  reservation = { attemptAt: Date.now() - 40 * 60_000, runId: 42 }
  runStatus = 'in_progress'
  manifestValue = { listsVerifiedAt: new Date(Date.now() - 46 * 60_000).toISOString(), commitId: 'workerd-generation' }
  alertRecord = undefined
  await tick()
  assert.equal(lastAlert.action, 'none')
  await tick()
  assert.equal(lastAlert.action, 'create')
  assert.equal(lastMetrics.alertSubrequests, 5)
  assert.equal(issueRecord.title, 'Feed refresh stalled')
  await tick()
  assert.equal(lastAlert.action, 'none')
  issueRecord.updated_at = new Date(Date.now() - 31 * 60_000).toISOString()
  alertRecord.notifiedAt = Date.now() - 31 * 60_000
  await tick()
  assert.equal(lastAlert.action, 'comment')
  assert.equal(lastMetrics.alertSubrequests, 5)
  manifestValue.listsVerifiedAt = new Date().toISOString()
  await tick()
  assert.equal(lastAlert.action, 'close')
  assert.equal(issueRecord.state, 'closed')
  assert.match(issueRecord.body, /Recovered: manifest age 0 minutes/)
  await tick()
  assert.equal(lastMetrics.alertSubrequests, 0)
  assert.equal(lastMetrics.subrequests, 2)

  manifestValue.listsVerifiedAt = new Date(Date.now() - 60 * 60_000).toISOString()
  alertRecord = { hardTicks: 1, verifiedAt: manifestValue.listsVerifiedAt }
  const postsBeforeRejection = issuePosts
  issueFailure = 403
  await tick()
  assert.equal(lastAlert.reason, 'missing-issues-scope')
  assert.equal(seen.filter((call) => call.path.endsWith('/issues') && call.method === 'POST').length, 1)

  assert.equal(alertRecord.pendingCreate, undefined)
  assert.equal(lastMetrics.alertSubrequests, 6)
  issueFailure = undefined
  await tick()
  assert.equal(lastAlert.action, 'create')
  await tick()
  assert.equal(lastAlert.action, 'none')
  assert.equal(issuePosts - postsBeforeRejection, 2)
  assert.equal(issueRecord.state, 'open')

  // Real native R2 bindings, including the returned ETag used by recovery CAS.
  for (const scenario of ['invalid-s3', 'revoked-s3', 'recovery', 'invalid-manifest']) {
    const nativeLogs = new EventEmitter()
    let nativeIssue = scenario === 'recovery' ? { number: 7, state: 'open',
      repository_url: 'https://api.github.com/repos/lwtgg/kwip', body: 'Incident' } : undefined
    const native = new Miniflare(convertV4MiniflareOptions({
      modules: true,
      script: readFileSync(join(output, 'index.js'), 'utf8'), compatibilityDate,
      r2Buckets: ['WATCHDOG_STATE'],
      bindings: { R2_BUCKET: bucket, R2_CREDENTIALS: scenario === 'invalid-s3' ? '{}' : JSON.stringify(credentials),
        GITHUB_REFRESH_TOKEN: 'workerd-github-token' },
      handleStructuredLogs({ message }) { if (message.includes('feed_refresh_tick')) nativeLogs.emit('tick', message) },
      outboundService: async (request) => {
        const url = new URL(request.url)
        if (url.origin === endpoint) return scenario === 'recovery'
          ? Response.json({ listsVerifiedAt: new Date().toISOString() }) : new Response(null, { status: 403 })
        if (url.pathname === '/search/issues') return Response.json({ incomplete_results: false,
          total_count: nativeIssue?.state === 'open' ? 1 : 0, items: nativeIssue?.state === 'open' ? [nativeIssue] : [] })
        if (url.pathname.endsWith('/issues') && request.method === 'POST') {
          nativeIssue = { ...await request.json(), number: 7, state: 'open', repository_url: 'https://api.github.com/repos/lwtgg/kwip' }
          return Response.json(nativeIssue, { status: 201 })
        }
        if (request.method === 'PATCH') {
          Object.assign(nativeIssue, await request.json())
          return Response.json(nativeIssue)
        }
        return new Response(null, { status: 500 })
      },
    }))
    t.after(() => native.dispose())
    const nativeBucket = await native.getR2Bucket('WATCHDOG_STATE')
    await nativeBucket.put('current.json', scenario === 'invalid-manifest' ? 'invalid JSON' : JSON.stringify({ listsVerifiedAt: new Date(Date.now() - (scenario === 'recovery' ? 0 : 60 * 60_000)).toISOString() }))
    await nativeBucket.put('cron-feed-alert.json', JSON.stringify(scenario === 'recovery'
      ? { issue: 7 } : { since: Date.now() - 20 * 60_000 }))
    if (scenario === 'invalid-manifest') {
      const observed = once(nativeLogs, 'tick', { signal: AbortSignal.timeout(5_000) })
      assert.equal((await (await native.getWorker()).scheduled()).outcome, 'ok')
      const [line] = await observed
      const first = JSON.parse(line)
      assert.equal(first.reason, 'invalid-manifest-json')
      assert.equal(first.alert.action, 'none')
      assert.equal(first.alertSubrequests, 3)
      const saved = await (await nativeBucket.get('cron-feed-alert.json')).json()
      assert.ok(Number.isSafeInteger(saved.firstFailureAt))
      // Advance the durable observation past grace without waiting on wall time.
      await nativeBucket.put('cron-feed-alert.json', JSON.stringify({ ...saved, firstFailureAt: Date.now() - 16 * 60_000 }))
    }
    const logged = once(nativeLogs, 'tick', { signal: AbortSignal.timeout(5_000) })
    assert.equal((await (await native.getWorker()).scheduled()).outcome, 'ok')
    const [line] = await logged
    const record = JSON.parse(line)
    assert.equal(record.alert.action, scenario === 'recovery' ? 'close' : 'create')
    assert.ok(record.alertSubrequests <= 5)
    if (scenario === 'recovery') {
      assert.equal(nativeIssue.state, 'closed')
      assert.deepEqual(await (await nativeBucket.get('cron-feed-alert.json')).json(), {})
    } else {
      assert.equal(record.reason, scenario === 'invalid-s3' ? 'invalid-r2-credentials' : scenario === 'invalid-manifest' ? 'invalid-manifest-json' : 'http-error')
      assert.match(nativeIssue.body, scenario === 'invalid-s3' ? /invalid-r2-credentials/ : scenario === 'invalid-manifest' ? /feed-state-unavailable/ : /r2-credentials-rejected/)
    }
  }

})
