import { AwsClient } from 'aws4fetch'
import { runAlerts } from './watchdog.mjs'

const maxAgeMs = 12 * 60_000
const maxClockSkewMs = 60_000
const stalledAfterTicks = 6
const searchSliceMs = 5 * 60_000
const githubRunPageSize = 100
const githubRunSearchLimit = 1_000
const legacyCooldownMs = 10 * 60_000
const cooldownKey = 'cron-dispatch-cooldown.json'
const activeStatuses = ['requested', 'waiting', 'pending', 'queued', 'in_progress']
const actionsUrl = 'https://api.github.com/repos/lwtgg/kwip/actions'
const workflowPath = 'workflows/feed-refresh.yml'

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
    async writeReservation(value, previous, key = cooldownKey) {
      const headers = previous ? { 'If-Match': previous.etag } : { 'If-None-Match': '*' }
      const response = await call(key, {
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

export async function runTick(env, now, request = fetch, context) {
  let ageMs = null
  let stage = 'manifest'
  let dispatch = 'skipped'
  let dispatchStatus
  let recordUnresolved
  try {
    // Read through the native binding when deployed, so malformed S3 secrets
    // do not hide the manifest age or force alert I/O before the grace boundary.
    let bucket
    let manifest
    if (context && env.WATCHDOG_STATE) {
      context.countBinding()
      const current = await env.WATCHDOG_STATE.get('current.json')
      manifest = current ? { value: parseJson(await current.text()) } : null
    } else {
      bucket = bucketClient(env, request)
      manifest = await bucket.read('current.json')
    }
    if (context) context.manifest = manifest?.value
    if (manifest && (!manifest.value || typeof manifest.value !== 'object' || Array.isArray(manifest.value))) {
      throw new TickFailure('invalid-manifest-json')
    }
    const verifiedAt = manifest?.value.listsVerifiedAt
    const freshness = decideRefresh(verifiedAt, now)
    ageMs = freshness.ageMs
    bucket ??= bucketClient(env, request)
    if (context) context.bucket = bucket
    // The watchdog spends the normal second healthy read on alert state.
    // A fresh manifest still releases an old reservation on the next stale tick.
    if (context && freshness.decision === 'fresh') return { ...freshness, dispatch }

    stage = 'cooldown-read'
    const cooldown = await bucket.read(cooldownKey)
    if (cooldown && !/^"[^"]+"$/.test(cooldown.etag ?? '')) {
      throw new TickFailure('invalid-cooldown-etag')
    }
    const record = cooldown?.value
    if (context) context.reservation = record
    // Older deployments stored only the end of the visibility window.
    const legacyAttemptAt = Number.isSafeInteger(record?.until) ? record.until - legacyCooldownMs : null
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

    const github = (path, options = {}) => {
      if (!env.GITHUB_REFRESH_TOKEN) throw new TickFailure('missing-github-token')
      return request(`${actionsUrl}/${path}`, {
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
    }
    if (unresolved) {
      stage = 'reconcile-run'
      const { attemptId, runId } = record
      const misses = Number.isSafeInteger(record.unresolvedTicks) && record.unresolvedTicks > 0
        ? record.unresolvedTicks : 0
      recordUnresolved = async (details, cursor = {}) => {
        stage = 'cooldown-write'
        const unresolvedTicks = Math.min(misses + 1, stalledAfterTicks)
        const updated = await bucket.writeReservation({ ...record, ...cursor, unresolvedTicks }, cooldown)
        if (!updated) return { ageMs, dispatch, ...details, counterWriteConflict: true }
        return {
          ageMs, dispatch, ...details, unresolvedTicks,
          decision: unresolvedTicks === stalledAfterTicks ? 'stalled' : details.decision,
        }
      }
      if (Number.isSafeInteger(runId) && runId > 0) {
        const response = await github(`runs/${runId}`)
        if (response.status === 404) {
          await discardBody(response)
          return await recordUnresolved({ decision: 'cooldown', stage, reason: 'run-not-visible' })
        }
        if (!response.ok) {
          await discardBody(response)
          throw new TickFailure('http-error', response.status)
        }
        const run = parseJson(await response.text())
        if (run?.id !== runId) throw new TickFailure('invalid-run-identity')
        if (run.conclusion === 'action_required') throw new TickFailure('workflow-paused')
        if (run.status === 'completed') return await release(cooldown, 'attempt-dead')
        if (activeStatuses.includes(run.status)) {
          if (misses) {
            stage = 'cooldown-write'
            await bucket.writeReservation({ ...record, unresolvedTicks: 0 }, cooldown)
          }
          return { ageMs, decision: 'active-run', dispatch }
        }
        throw new TickFailure('invalid-run-status')
      }

      if (!attemptId) {
        return await recordUnresolved({ decision: 'cooldown', stage, reason: 'legacy-reservation' })
      }

      // GitHub creation timestamps have one-second precision. Use inclusive
      // bounds and start the next slice one second past the previous end.
      // Restart cursors saved with different clock-skew bounds.
      const origin = Math.floor((attemptAt - maxClockSkewMs) / 1000) * 1000
      const latest = Math.floor(now / 1000) * 1000
      const validCursor = record.searchOrigin === origin && Number.isSafeInteger(record.searchFrom) && record.searchFrom >= origin &&
        Number.isSafeInteger(record.searchUntil) && record.searchFrom <= record.searchUntil &&
        record.searchUntil <= latest && Number.isSafeInteger(record.searchThrough) &&
        record.searchThrough >= record.searchFrom && record.searchThrough < record.searchFrom + searchSliceMs
      const searchUntil = validCursor ? record.searchUntil : Math.max(origin, latest)
      const searchFrom = validCursor ? record.searchFrom : origin
      const searchThrough = validCursor ? record.searchThrough : searchFrom + searchSliceMs - 1000
      const page = validCursor && Number.isSafeInteger(record.searchPage) && record.searchPage > 1
        ? record.searchPage : 1
      const query = new URLSearchParams({
        branch: 'main', event: 'workflow_dispatch',
        created: `${new Date(searchFrom).toISOString()}..${new Date(searchThrough).toISOString()}`,
        per_page: String(githubRunPageSize), page: String(page),
      })
      const runs = await github(`${workflowPath}/runs?${query}`)
      if (!runs.ok) {
        await discardBody(runs)
        throw new TickFailure('http-error', runs.status)
      }
      const { total_count: count, workflow_runs: entries } = parseJson(await runs.text()) ?? {}
      if (!Array.isArray(entries) || !Number.isSafeInteger(count) || count < entries.length) {
        throw new TickFailure('invalid-run-list')
      }
      const match = entries.find(
        (run) => run?.display_title === `Feed refresh (cron ${attemptId})`,
      )
      if (!match) {
        const capped = count >= githubRunSearchLimit
        const hasNext = /\brel\s*=\s*"?next\b/i.test(runs.headers.get('link') ?? '')
        let cursor
        if (capped && searchFrom < searchThrough) {
          // Search the older half first so newer runs cannot hide the attempt
          // behind GitHub's result cap. Later slices cover the remaining time.
          const midpoint = Math.floor((searchThrough - searchFrom) / 2000) * 1000
          cursor = { searchFrom, searchThrough: searchFrom + midpoint, searchPage: 1 }
        } else if (hasNext && page * githubRunPageSize < githubRunSearchLimit) {
          cursor = { searchFrom, searchThrough, searchPage: page + 1 }
        } else {
          const nextFrom = searchThrough < searchUntil ? searchThrough + 1000 : origin
          cursor = {
            searchFrom: nextFrom, searchThrough: nextFrom + searchSliceMs - 1000, searchPage: 1,
            searchUntil: nextFrom === origin ? null : searchUntil,
          }
        }
        return await recordUnresolved({
          decision: 'cooldown', stage, reason: capped ? 'run-search-capped' : 'run-not-visible',
        }, { searchOrigin: origin, searchUntil, ...cursor })
      }
      if (!Number.isSafeInteger(match.id) || match.id <= 0) throw new TickFailure('invalid-run-identity')

      stage = 'cooldown-write'
      const updated = await bucket.writeReservation({ attemptAt, attemptId, runId: match.id }, cooldown)
      return { ageMs, decision: updated ? 'run-identified' : 'cooldown', dispatch }
    }

    stage = 'list-runs'
    // Check earlier lifecycle states first so a transition to queued or
    // in_progress can still be seen by a later query.
    for (const status of activeStatuses) {
      const runs = await github(`${workflowPath}/runs?branch=main&status=${status}&per_page=1`)
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
    const attemptId = crypto.randomUUID()
    const claim = await bucket.writeReservation({ attemptAt: now, attemptId }, cooldown)
    if (!claim) return { ageMs, decision: 'cooldown', dispatch }

    stage = 'dispatch'
    dispatch = 'failed'
    const response = await github(`${workflowPath}/dispatches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: 'main', inputs: { cron_attempt: attemptId } }),
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
    if (response.status < 500 && response.status !== 408) {
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
    if (stage === 'reconcile-run' && recordUnresolved) {
      const failure = { decision: 'error', stage, reason, ...(status === undefined ? {} : { status }) }
      try {
        return await recordUnresolved(failure)
      } catch (writeError) {
        return {
          ageMs, dispatch, ...failure,
          counterWriteError: writeError instanceof TickFailure ? writeError.reason : 'request-failed',
        }
      }
    }
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

export async function runWatchdogTick(env, now, request = fetch) {
  let subrequests = 0
  const context = { countBinding: () => { subrequests++ } }
  const counted = (...args) => { subrequests++; return request(...args) }
  const result = await runTick(env, now, counted, context)
  let refreshSubrequests = subrequests
  const alert = await runAlerts(env, now, result, context, counted)
  if (result.decision === 'fresh') refreshSubrequests = Math.min(2, subrequests)
  return { ...result, alert, refreshSubrequests, subrequests,
    alertSubrequests: subrequests - refreshSubrequests }
}

export default {
  async scheduled(_controller, env) {
    const result = await runWatchdogTick(env, Date.now())
    console.log(JSON.stringify({ event: 'feed_refresh_tick', ...result }))
  },
}
