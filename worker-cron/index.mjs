import { AwsClient } from 'aws4fetch'

const maxAgeMs = 12 * 60_000
const activeStatuses = new Set(['queued', 'in_progress', 'pending', 'requested', 'waiting'])
const workflowUrl = 'https://api.github.com/repos/lwtgg/kwip/actions/workflows/feed-refresh.yml'

export function decideRefresh(listsVerifiedAt, now, statuses = []) {
  const verifiedAt = listsVerifiedAt == null ? null : Date.parse(listsVerifiedAt)
  if (verifiedAt !== null && (typeof listsVerifiedAt !== 'string' || !Number.isFinite(verifiedAt))) {
    throw new Error('Invalid listsVerifiedAt')
  }
  const ageMs = verifiedAt === null ? null : now - verifiedAt
  if (ageMs !== null && ageMs <= maxAgeMs) return { ageMs, decision: 'fresh' }
  return { ageMs, decision: statuses.some((status) => activeStatuses.has(status)) ? 'active-run' : 'dispatch' }
}

class HttpFailure extends Error {
  constructor(status) {
    super(`HTTP ${status}`)
    this.status = status
  }
}

async function readManifest(env, request) {
  const config = JSON.parse(env.R2_CREDENTIALS ?? 'null')
  const endpoint = new URL(config?.endpoint)
  if (
    config?.bucket !== env.R2_BUCKET ||
    !/^[a-f0-9]{32}$/i.test(config?.accountId ?? '') ||
    !config?.accessKeyId || !config.secretAccessKey ||
    endpoint?.href !== `https://${config.accountId.toLowerCase()}.r2.cloudflarestorage.com/`
  ) {
    throw new Error('Invalid bucket-scoped R2 credentials')
  }
  const signer = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: 's3',
    region: 'auto',
    retries: 0,
  })
  const signed = await signer.sign(new URL(`/${env.R2_BUCKET}/current.json`, endpoint), {
    method: 'GET',
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  })
  const response = await request(signed)
  if (response.status === 404 && (await response.text()).includes('<Code>NoSuchKey</Code>')) return null
  if (!response.ok || isRedirect(response)) {
    if (!response.bodyUsed) await discardBody(response)
    throw new HttpFailure(response.status)
  }
  const manifest = await response.json()
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('Invalid manifest')
  }
  return manifest
}

function isRedirect(response) {
  return response.status >= 300 && response.status < 400
}

async function discardBody(response) {
  await response.body?.cancel().catch(() => {})
}

export async function runTick(env, now, request = fetch) {
  let ageMs = null
  let stage = 'manifest'
  try {
    const manifest = await readManifest(env, request)
    const freshness = decideRefresh(manifest?.listsVerifiedAt, now)
    ageMs = freshness.ageMs
    if (freshness.decision === 'fresh') return { ...freshness, dispatch: 'skipped' }

    stage = 'list-runs'
    if (!env.GITHUB_REFRESH_TOKEN) throw new Error('Missing GitHub token')
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
    const runs = await github('runs?branch=main&per_page=100')
    if (!runs.ok || isRedirect(runs)) {
      await discardBody(runs)
      throw new HttpFailure(runs.status)
    }
    const { workflow_runs: entries } = await runs.json()
    if (!Array.isArray(entries) || entries.some((entry) => typeof entry?.status !== 'string')) {
      throw new Error('Invalid GitHub run list')
    }
    const decision = decideRefresh(manifest?.listsVerifiedAt, now, entries.map((entry) => entry.status))
    if (decision.decision === 'active-run') return { ...decision, dispatch: 'skipped' }

    stage = 'dispatch'
    const dispatch = await github('dispatches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: 'main' }),
    })
    await discardBody(dispatch)
    if (!dispatch.ok || isRedirect(dispatch)) throw new HttpFailure(dispatch.status)
    return { ...decision, dispatch: 'accepted', status: dispatch.status }
  } catch (error) {
    return {
      ageMs,
      decision: 'error',
      dispatch: stage === 'dispatch' ? 'failed' : 'skipped',
      stage,
      message: String(error?.message ?? error),
      ...(error instanceof HttpFailure ? { status: error.status } : {}),
    }
  }
}

export default {
  async scheduled(_controller, env) {
    const result = await runTick(env, Date.now())
    console.log(JSON.stringify({ event: 'feed_refresh_tick', ...result }))
  },
}
