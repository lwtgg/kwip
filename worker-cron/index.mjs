import { AwsClient } from 'aws4fetch'

const maxAgeMs = 12 * 60_000
const maxClockSkewMs = 60_000
const cooldownMs = 10 * 60_000
const cooldownKey = 'cron-dispatch-cooldown.json'
const activeStatuses = ['requested', 'waiting', 'pending', 'queued', 'in_progress']
const workflowUrl = 'https://api.github.com/repos/lwtgg/kwip/actions/workflows/feed-refresh.yml'

export function decideRefresh(listsVerifiedAt, now, statuses = []) {
  let ageMs = null
  if (listsVerifiedAt != null) {
    // Publisher timestamps use the canonical UTC ISO format with milliseconds.
    const verifiedAt = new Date(typeof listsVerifiedAt === 'string' ? listsVerifiedAt : NaN)
    if (!Number.isFinite(verifiedAt.getTime()) || verifiedAt.toISOString() !== listsVerifiedAt) {
      throw new TickFailure('invalid-manifest-timestamp')
    }
    if (verifiedAt.getTime() > now + maxClockSkewMs) throw new TickFailure('future-manifest-timestamp')
    ageMs = Math.max(0, now - verifiedAt.getTime())
    if (ageMs <= maxAgeMs) return { ageMs, decision: 'fresh' }
  }
  return { ageMs, decision: statuses.some((status) => activeStatuses.includes(status)) ? 'active-run' : 'dispatch' }
}

class TickFailure extends Error {
  constructor(reason, status) {
    super(reason)
    this.reason = reason
    this.status = status
  }
}

function parseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function bucketClient(env, request) {
  const config = parseJson(env.R2_CREDENTIALS)
  if (
    config?.bucket !== env.R2_BUCKET ||
    typeof config?.accountId !== 'string' || !/^[a-f0-9]{32}$/i.test(config.accountId) ||
    typeof config?.accessKeyId !== 'string' || !config.accessKeyId ||
    typeof config.secretAccessKey !== 'string' || !config.secretAccessKey
  ) {
    throw new TickFailure('invalid-r2-credentials')
  }
  const endpoint = `https://${config.accountId.toLowerCase()}.r2.cloudflarestorage.com`
  if (config.endpoint !== endpoint && config.endpoint !== `${endpoint}/`) {
    throw new TickFailure('invalid-r2-endpoint')
  }
  const signer = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: 's3',
    region: 'auto',
    retries: 0,
  })

  async function call(key, options) {
    const signed = await signer.sign(new URL(`/${env.R2_BUCKET}/${key}`, endpoint), {
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
      ...options,
    })
    return request(signed)
  }

  return {
    async read(key) {
      // Identity encoding preserves the strong ETag required by If-Match.
      const response = await call(key, { method: 'GET', headers: { 'Accept-Encoding': 'identity' } })
      if (response.status === 404 && (await response.text()).includes('<Code>NoSuchKey</Code>')) return null
      if (!response.ok) {
        if (!response.bodyUsed) await discardBody(response)
        throw new TickFailure('http-error', response.status)
      }
      // Preserve the ETag even when the stored content cannot be parsed.
      const value = parseJson(await response.text())
      return { value, etag: response.headers.get('etag') }
    },
    async writeReservation(value, previous) {
      const headers = previous ? { 'If-Match': previous.etag } : { 'If-None-Match': '*' }
      const response = await call(cooldownKey, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(value),
      })
      await discardBody(response)
      if (response.status === 412) return null
      if (!response.ok) throw new TickFailure('http-error', response.status)
      return { etag: response.headers.get('etag') }
    },
  }
}

async function discardBody(response) {
  await response.body?.cancel().catch(() => {})
}

export async function runTick(env, now, request = fetch) {
  let ageMs = null
  let stage = 'manifest'
  let dispatch = 'skipped'
  let dispatchStatus
  try {
    const bucket = bucketClient(env, request)
    const manifest = await bucket.read('current.json')
    if (manifest && (!manifest.value || typeof manifest.value !== 'object' || Array.isArray(manifest.value))) {
      throw new TickFailure('invalid-manifest-json')
    }
    const verifiedAt = manifest?.value.listsVerifiedAt
    const freshness = decideRefresh(verifiedAt, now)
    ageMs = freshness.ageMs

    stage = 'cooldown-read'
    const cooldown = await bucket.read(cooldownKey)
    if (cooldown && !/^"[^"]+"$/.test(cooldown.etag ?? '')) {
      throw new TickFailure('invalid-cooldown-etag')
    }
    const record = cooldown?.value
    // Older deployments stored only the end of the visibility window.
    const legacyAttemptAt = Number.isSafeInteger(record?.until) ? record.until - cooldownMs : null
    const attemptAt = record?.attemptAt ?? legacyAttemptAt
    const unresolved = Number.isSafeInteger(attemptAt) && attemptAt >= 0 && attemptAt <= now + maxClockSkewMs
    const cleared = Number.isSafeInteger(record?.clearedAt)
    const release = async (previous, decision) => {
      stage = 'cooldown-release'
      if (!/^"[^"]+"$/.test(previous.etag ?? '')) throw new TickFailure('invalid-cooldown-etag')
      const released = await bucket.writeReservation({ clearedAt: now }, previous)
      return { ageMs, decision: released ? decision : 'cooldown', dispatch }
    }

    if (unresolved && Date.parse(verifiedAt) > attemptAt) {
      return await release(cooldown, 'manifest-advanced')
    }
    if (!unresolved && freshness.decision === 'fresh') return { ...freshness, dispatch }

    stage = 'list-runs'
    if (!env.GITHUB_REFRESH_TOKEN) throw new TickFailure('missing-github-token')
    const github = (path, options = {}) => request(`${workflowUrl}/${path}`, {
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
      ...options,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${env.GITHUB_REFRESH_TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'kwip-feed-cron',
        ...options.headers,
      },
    })
    if (unresolved) {
      stage = 'reconcile-run'
      // GitHub reports creation times to the second. Include the entire second
      // in which the reservation was made.
      const since = new Date(Math.floor(attemptAt / 1000) * 1000).toISOString()
      const query = new URLSearchParams({ branch: 'main', event: 'workflow_dispatch', created: `>=${since}`, per_page: '100' })
      const runs = await github(`runs?${query}`)
      if (!runs.ok) {
        await discardBody(runs)
        throw new TickFailure('http-error', runs.status)
      }
      const { total_count: count, workflow_runs: entries } = parseJson(await runs.text()) ?? {}
      if (!Array.isArray(entries) || !Number.isSafeInteger(count) || count < entries.length ||
          entries.some((entry) => !['completed', ...activeStatuses].includes(entry?.status))) {
        throw new TickFailure('invalid-run-list')
      }
      if (entries.some((entry) => activeStatuses.includes(entry.status))) {
        return { ageMs, decision: 'active-run', dispatch }
      }
      if (count !== entries.length || /\brel\s*=\s*"?next\b/i.test(runs.headers.get('link') ?? '')) {
        return { ageMs, decision: 'inconclusive', dispatch, stage, reason: 'incomplete-run-list' }
      }
      if (now - attemptAt < cooldownMs) return { ageMs, decision: 'cooldown', dispatch }

      // A complete lookup after the visibility window found only terminal runs
      // or no matching run. Release first so the next tick checks for active
      // runs and reads the manifest again before it can dispatch.
      return await release(cooldown, 'attempt-dead')
    }

    // Check earlier lifecycle states first so a transition to queued or
    // in_progress can still be seen by a later query.
    for (const status of activeStatuses) {
      const runs = await github(`runs?branch=main&status=${status}&per_page=1`)
      if (!runs.ok) {
        await discardBody(runs)
        throw new TickFailure('http-error', runs.status)
      }
      const { total_count: count, workflow_runs: entries } = parseJson(await runs.text()) ?? {}
      if (!Array.isArray(entries) || !Number.isSafeInteger(count) || count < entries.length ||
          entries.some((entry) => entry?.status !== status)) {
        throw new TickFailure('invalid-run-list')
      }
      if (count > 0) return { ageMs, decision: 'active-run', dispatch }
      if (/\brel\s*=\s*"?next\b/i.test(runs.headers.get('link') ?? '')) {
        return { ageMs, decision: 'inconclusive', dispatch, stage, reason: 'incomplete-run-list' }
      }
    }

    // Reserve only after the idle check, using the ETag from this tick.
    stage = 'cooldown-write'
    const claim = await bucket.writeReservation({ attemptAt: now }, cooldown)
    if (!claim) return { ageMs, decision: 'cooldown', dispatch }

    stage = 'dispatch'
    dispatch = 'failed'
    const response = await github('dispatches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: 'main' }),
    })
    dispatchStatus = response.status
    await discardBody(response)
    if (response.ok) {
      return {
        ageMs, decision: 'dispatch', dispatch: 'accepted', status: response.status,
        ...(cooldown && !cleared ? { reason: 'cooldown-repaired' } : {}),
      }
    }

    // An explicit rejection can retry next tick. A timeout or 5xx may have queued
    // a run, so leave the reservation for the next tick to reconcile.
    if (response.status < 500) {
      await release(claim, 'attempt-dead')
    }
    stage = 'dispatch'
    throw new TickFailure('http-error', response.status)
  } catch (error) {
    const status = error instanceof TickFailure ? error.status ?? dispatchStatus : dispatchStatus
    let reason = 'request-failed'
    if (error instanceof TickFailure) reason = error.reason
    else if (error?.name === 'TimeoutError') reason = 'request-timeout'
    else if (error?.name === 'AbortError') reason = 'request-aborted'
    return {
      ageMs,
      decision: 'error',
      dispatch,
      stage,
      reason,
      ...(status === undefined ? {} : { status }),
    }
  }
}

export default {
  async scheduled(_controller, env) {
    const result = await runTick(env, Date.now())
    console.log(JSON.stringify({ event: 'feed_refresh_tick', ...result }))
  },
}
