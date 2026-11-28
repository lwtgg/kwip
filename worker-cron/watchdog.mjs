const minute = 60_000
export const alertKey = 'cron-feed-alert.json'
const repo = 'https://api.github.com/repos/lwtgg/kwip'
const positive = (value) => Number.isSafeInteger(value) && value > 0

export function alertBudget(ageMs, recovering = false, observingFailure = false) {
  return recovering || observingFailure || (ageMs !== null && ageMs > 15 * minute) ? 5 : 0
}

export function decideAlert(result, previous = {}, now, hold = {}) {
  // A dispatch threshold of four minutes: past five the pinger has visibly failed to act.
  const healthy = result.ageMs !== null && result.ageMs <= 5 * minute && result.decision === 'fresh'
  const state = { ...previous }
  if (healthy) {
    const action = positive(previous.issue) || previous.pendingCreate || previous.recovering
      ? 'close' : previous.firstFailureAt != null ? 'reset' : 'none'
    return { state: {}, action, healthy: true }
  }
  const unknownFailure = result.ageMs === null && result.decision === 'error'
  if (unknownFailure) {
    // Persist independently of the unreadable manifest and reservation. Missed
    // cron ticks or isolate restarts must never restart a permanent failure's grace.
    state.firstFailureAt = Number.isSafeInteger(previous.firstFailureAt) &&
      previous.firstFailureAt >= 0 && previous.firstFailureAt <= now ? previous.firstFailureAt : now
  } else {
    delete state.firstFailureAt
  }
  state.since = previous.since ?? now
  state.hardTicks = result.ageMs > 45 * minute ? (previous.hardTicks ?? 0) + 1 : 0
  const rejected = result.dispatch === 'failed' && result.status >= 400 && result.status < 500 && result.status !== 408
  state.rejections = rejected ? (previous.rejections ?? 0) + 1 : 0
  const gracePassed = result.ageMs === null ? now - (unknownFailure ? state.firstFailureAt : state.since) >= 15 * minute : result.ageMs > 15 * minute
  const suppressed = publisherHeld(hold, now)
  let reason
  if (unknownFailure && gracePassed) reason = 'feed-state-unavailable'
  if (state.hardTicks >= 2) reason = 'manifest-too-old'
  if (result.decision === 'stalled') reason = 'stalled'
  if (state.rejections >= 2) reason = 'dispatch-rejected'
  if (['manifest', 'cooldown-read', 'cooldown-write', 'cooldown-release'].includes(result.stage) && [401, 403].includes(result.status)) reason = 'r2-credentials-rejected'
  if (previous.workflowDisabled) reason = 'workflow-disabled'
  if (['invalid-r2-credentials', 'missing-github-token', 'workflow-paused', 'workflow-disabled'].includes(result.reason)) reason = result.reason
  if (['list-runs', 'reconcile-run', 'dispatch'].includes(result.stage) && [401, 403].includes(result.status)) reason = 'github-token-rejected'
  return { state, healthy: false, reason, action: !suppressed && gracePassed && reason ? 'notify' : 'none' }
}

export function decideIssue(action, state, issues, now) {
  const issue = issues[0]
  if (action === 'close') return issue ? { action: 'close', issue } : { action: 'none' }
  if (action !== 'notify') return { action: 'none' }
  if (!issue) return { action: state.pendingCreate || state.issue ? 'unconfirmed' : 'create' }
  const notifiedAt = Math.max(state.notifiedAt ?? 0, Date.parse(issue.updated_at) || 0)
  return { action: now - notifiedAt >= 30 * minute ? 'comment' : 'none', issue }
}

export function definitiveCreateRejection(status) {
  return Number.isInteger(status) && status >= 400 && status < 500 && status !== 408 && status !== 499
}

function publisherHeld(state, now) {
  return state.paused === true || Date.parse(state.retryNotBefore) > now
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

// All alert failures are contained here. No provider response or credential is logged.
export async function runAlerts(env, now, result, context, request) {
  const healthy = result.decision === 'fresh' && result.ageMs <= 5 * minute
  const observedSince = context.reservation?.attemptAt
  const budgetAge = result.ageMs ?? (Number.isSafeInteger(observedSince) ? Math.max(0, now - observedSince) : null)
  const unknownFailure = result.ageMs === null && result.decision === 'error'
  if (!healthy && !alertBudget(budgetAge, false, unknownFailure)) return { action: 'grace' }
  let stage = 'state-read'
  try {
    const bucket = bindingStorage(env.WATCHDOG_STATE, context.countBinding) ?? context.bucket
    if (!bucket) return { action: 'error', reason: 'alert-storage-unavailable' }
    let hold = {}
    if (!healthy) {
      stage = 'collector-state-read'
      // Carry this value throughout the tick; never read it a second time.
      const collector = await bucket.read('collector-state.json')
      if (collector && !object(collector.value)) throw new Error('invalid-collector-state')
      hold = collector?.value ?? {}
    }
    stage = 'state-read'
    const stored = await bucket.read(alertKey)
    if (stored && (!object(stored.value) || !/^"[^"]+"$/.test(stored.etag ?? ''))) throw new Error('invalid-alert-state')
    const previous = stored?.value ?? (Number.isSafeInteger(observedSince) ? { since: observedSince } : {})
    // A new verification starts new consecutive-failure counters, even when
    // healthy ticks intentionally did not write stale bookkeeping back to R2.
    const generation = context.manifest?.listsVerifiedAt
    const history = generation && previous.verifiedAt !== generation
      ? { ...previous, hardTicks: 0, rejections: 0, since: now } : previous
    const decision = decideAlert(result, history, now, hold)
    const state = decision.state
    if (!healthy && generation) state.verifiedAt = generation
    let action = decision.action
    // An ambiguous create is reconciled even when the manifest has recovered.
    if (healthy && previous.pendingCreate) action = 'close'
    if (healthy && action === 'none') return { action: 'none' }
    if (healthy && action === 'reset') {
      stage = 'state-write'
      const cleared = await bucket.writeReservation({}, stored, alertKey)
      return { action: cleared ? 'reset' : 'conflict' }
    }
    let output = { action: 'none' }
    const github = async (url, options = {}, token = env.GITHUB_ALERT_TOKEN || env.GITHUB_REFRESH_TOKEN) => {
      if (!token) throw new Error('missing-github-token')
      const response = await request(url, {
        redirect: 'manual', signal: AbortSignal.timeout(10_000), ...options,
        headers: {
          Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'kwip-feed-cron',
          'Content-Type': 'application/json',
        },
      })
      if (!response.ok) {
        await response.body?.cancel().catch(() => {})
        throw Object.assign(new Error(response.status === 403 && stage !== 'workflow-state' ? 'missing-issues-scope' : 'alert-github-error'), { status: response.status })
      }
      return response
    }
    // Workflow state belongs to the workflow metadata, not its run statuses.
    // Probe on non-notifying stale ticks and persist a disabled observation;
    // the following tick can notify without exceeding the five-call budget.
    if (!healthy && !unknownFailure && action === 'none' && env.GITHUB_REFRESH_TOKEN &&
        !publisherHeld(hold, now)) {
      stage = 'workflow-state'
      try {
        const workflow = await github(`${repo}/actions/workflows/feed-refresh.yml`, {}, env.GITHUB_REFRESH_TOKEN)
        const metadata = await workflow.json()
        if (typeof metadata.state !== 'string') throw new Error('invalid-workflow-state')
        state.workflowDisabled = metadata.state === 'disabled_manually' || metadata.state === 'disabled_inactivity' || metadata.state === 'disabled' || metadata.state === 'paused'
      } catch {
        // Optional metadata cannot discard the age/rejection observations below.
        output = { action: 'error', stage, reason: 'alert-workflow-state-failed' }
      }
    }
    if (action !== 'none') {
      stage = 'search'
      const query = new URLSearchParams({ q: 'repo:lwtgg/kwip is:issue is:open label:feed-stale', per_page: '1', sort: 'created', order: 'asc' })
      const search = await github(`https://api.github.com/search/issues?${query}`)
      const found = await search.json()
      if (!Array.isArray(found.items) || found.incomplete_results !== false || !Number.isSafeInteger(found.total_count) ||
          found.total_count < found.items.length || (found.total_count > 0 && !found.items.length) ||
          found.items.some((issue) => !positive(issue.number) || issue.state !== 'open' || issue.pull_request ||
            issue.repository_url !== repo)) throw new Error('invalid-issue-search')
      let selected = decideIssue(action, previous, found.items, now)
      if (!found.items.length && previous.pendingCreate && !positive(previous.issue)) {
        // An empty search is not proof that a pending create failed, even on
        // recovery: GitHub search can lag behind an accepted mutation.
        return { action: 'unconfirmed', reason: 'alert-create-unconfirmed' }
      }
      if (!found.items.length && positive(previous.issue)) {
        stage = 'issue-read'
        const response = await github(`${repo}/issues/${previous.issue}`)
        const known = await response.json()
        if (known.number !== previous.issue || !['open', 'closed'].includes(known.state)) throw new Error('invalid-known-issue')
        if (known.state === 'open') {
          selected = healthy ? decideIssue(action, previous, [known], now) : { action: 'none', issue: known }
        } else {
          delete state.issue
          delete state.pendingCreate
          selected = { action: 'none' }
        }
      }
      output = { action: selected.action, ...(selected.issue ? { issue: selected.issue.number } : {}) }
      if (selected.issue) {
        state.issue = selected.issue.number
        delete state.pendingCreate
      }
      if (selected.action === 'unconfirmed') {
        state.pendingCreate = true
        // Never repeat a possibly accepted create after a timeout, crash, or index lag.
        // Search on subsequent ticks; an operator can clear the key after confirming absence.
        output.reason = 'alert-create-unconfirmed'
      }
      const runId = context.reservation?.runId
      const body = [
        `Reason: ${decision.reason ?? result.reason ?? result.decision}`,
        `Manifest age: ${result.ageMs === null ? 'unknown' : `${Math.floor(result.ageMs / minute)} minutes`}`,
        `Last generation: ${context.manifest?.commitId ?? 'unknown'}`,
        'Reservation: cron-dispatch-cooldown.json',
        ...(positive(runId) ? [`Run: https://github.com/lwtgg/kwip/actions/runs/${runId}`] : []),
      ].join('\n')
      if (['create', 'comment', 'close'].includes(selected.action)) {
        // Persist intent before a mutation. CAS excludes overlapping ticks and also
        // throttles comments when GitHub accepts one but its response is lost.
        if (selected.action === 'create') state.pendingCreate = true
        state.notifiedAt = now
        if (selected.action === 'close') state.recovering = true
        stage = 'state-write'
        const claim = await bucket.writeReservation(state, stored, alertKey)
        if (!claim) return { action: 'conflict' }
        stage = selected.action
        if (selected.action === 'create') {
          try {
            const response = await github(`${repo}/issues`, { method: 'POST', body: JSON.stringify({
              title: 'Feed refresh stalled', labels: ['feed-stale'], body,
            }) })
            await response.body?.cancel().catch(() => {})
          } catch (error) {
            if (definitiveCreateRejection(error.status)) {
              // GitHub definitely did not create an issue. One cleanup write
              // permits a later tick to retry, without repeating this tick's POST.
              // Timeouts, redirects and 5xx keep intent because acceptance is unknown.
              delete state.pendingCreate
              delete state.notifiedAt
              const failure = { action: 'error', stage,
                reason: error.status === 403 ? 'missing-issues-scope' : 'alert-create-failed' }
              try {
                const cleared = await bucket.writeReservation(state, claim, alertKey)
                if (!cleared) return { ...failure, intentResetError: 'alert-state-conflict' }
              } catch {
                return { ...failure, intentResetError: 'alert-state-write-failed' }
              }
            }
            throw error
          }
        } else if (selected.action === 'comment') {
          const response = await github(`${repo}/issues/${selected.issue.number}/comments`, {
            method: 'POST', body: JSON.stringify({ body }),
          })
          await response.body?.cancel().catch(() => {})
        } else {
          const recovery = `Recovered: manifest age ${Math.floor(result.ageMs / minute)} minutes; feed verification resumed.`
          const response = await github(`${repo}/issues/${selected.issue.number}`, {
            method: 'PATCH', body: JSON.stringify({ state: 'closed', state_reason: 'completed',
              body: `${selected.issue.body ?? ''}\n\n${recovery}` }),
          })
          await response.body?.cancel().catch(() => {})
          stage = 'state-write'
          const cleared = await bucket.writeReservation({}, claim, alertKey)
          if (!cleared) return { ...output, reason: 'alert-state-conflict' }
        }
        return output
      }
    }
    // No mutation was needed; persist observations for the next stale tick.
    stage = 'state-write'
    if (healthy && !Object.keys(previous).length) return output
    const saved = await bucket.writeReservation(state, stored, alertKey)
    return saved ? output : { action: 'conflict' }
  } catch (error) {
    const reasons = ['missing-issues-scope', 'missing-github-token', 'invalid-issue-search', 'alert-create-unconfirmed']
    return { action: 'error', stage, reason: reasons.includes(error.message) ? error.message : `alert-${stage}-failed` }
  }
}

// The binding keeps invalid S3 credentials observable without a second secret.
function bindingStorage(binding, count = () => {}) {
  if (!binding) return undefined
  return {
    async read(key) {
      count()
      const value = await binding.get(key)
      return value ? { value: await value.json(), etag: value.httpEtag } : null
    },
    async writeReservation(value, previous, key) {
      count()
      const saved = await binding.put(key, JSON.stringify(value), {
        onlyIf: new Headers(previous ? { 'If-Match': previous.etag } : { 'If-None-Match': '*' }),
        httpMetadata: { contentType: 'application/json' },
      })
      return saved ? { etag: saved.httpEtag } : null
    },
  }
}
