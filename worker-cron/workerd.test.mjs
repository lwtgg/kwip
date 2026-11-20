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
        if (url.pathname.endsWith('/current.json')) return Response.json({})
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
        if (url.pathname.endsWith('/actions/runs/42')) return Response.json({ id: 42, status: 'completed' })
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
    return JSON.parse(line)
  }

  assert.deepEqual(await tick(), {
    event: 'feed_refresh_tick', ageMs: null, decision: 'dispatch', dispatch: 'accepted', status: 204,
  })
  assert.equal(seen.length, 9)
  assert.match(seen[0].auth, /^AWS4-HMAC-SHA256 /)
  assert.equal(seen.at(-1).method, 'POST')

  for (const phase of ['list-runs', 'dispatch']) {
    const result = await tick(phase)
    assert.equal(result.stage, phase)
    assert.equal(result.status, 302)
    assert.equal(seen.length, phase === 'list-runs' ? 3 : 10)
  }

  reservation = { attemptAt: Date.now() - 11 * 60_000, attemptId: 'test-attempt' }
  const failure = await tick('list-runs')
  assert.equal(failure.stage, 'reconcile-run')
  assert.equal(failure.status, 302)
  assert.equal(seen.length, 4)
  assert.equal(reservation.unresolvedTicks, 1)
  assert.equal((await tick()).decision, 'run-identified')
  assert.equal(reservation.runId, 42)
  assert.equal(seen.length, 4)
  assert.equal((await tick()).decision, 'attempt-dead')
  assert.ok(Number.isSafeInteger(reservation.clearedAt))
  assert.equal(seen.length, 4)
})
