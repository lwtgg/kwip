// Run with a file containing the same 30 absolute URLs on both networks.
import { readFile } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'

const urls = (await readFile(process.argv[2], 'utf8')).trim().split(/\s+/).map(value => new URL(value))
if (urls.length !== 30 || new Set(urls.map(url => url.href)).size !== 30 ||
    urls.some(url => url.origin !== 'https://kwip.fyi' || url.search || url.hash || url.username || url.password)) {
  throw new Error('Expected 30 distinct, query-free https://kwip.fyi URLs')
}

async function probe(url, method, round) {
  const start = Date.now()
  const row = { round, time: new Date(start).toISOString(), path: url.pathname, method }
  try {
    const response = await fetch(url, {
      method, headers: { 'user-agent': '' }, redirect: 'manual', signal: AbortSignal.timeout(115_000),
    })
    console.log(JSON.stringify({
      ...row, status: response.status, ray: response.headers.get('cf-ray'),
      cfCache: response.headers.get('cf-cache-status'), kwipCache: response.headers.get('x-kwip-cache'),
      elapsedMs: Date.now() - start,
    }))
    await response.body?.cancel()
  } catch (error) {
    console.log(JSON.stringify({ ...row, error: String(error), elapsedMs: Date.now() - start }))
  }
}

const start = Date.now()
const rounds = []
for (let round = 1; round <= 10; round++) {
  if (round > 1) await sleep(Math.max(0, start + (round - 1) * 60_000 - Date.now()))
  rounds.push(Promise.all(urls.map(async url => {
    await probe(url, 'PUT', round)
    await probe(url, 'GET', round)
  })))
}
await Promise.all(rounds)
