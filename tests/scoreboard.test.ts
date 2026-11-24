import { test } from 'node:test'
import assert from 'node:assert/strict'
import { enrichScoreboards, normalizeTeam, leaguePaths } from '../scripts/scoreboard.mjs'

const date = '2026-11-24T20:00:00Z'
const start = Date.parse(date) / 1000
const item = (extra = {}) => ({ name: 'Away FC vs. Home FC', tag: 'Premier League', always_live: 0, starts_at: start, ...extra })
const competitor = (homeAway, name, extra = {}) => ({ homeAway, score: '12', team: {
  displayName: name, abbreviation: name?.slice(0, 3) ?? '', color: 'ABC123', logo: 'https://a.espncdn.com/logo.png', ...extra,
} })
const competition = (extra = {}) => ({ date, competitors: [competitor('home', 'Home FC'), competitor('away', 'Away FC')],
  status: { type: { state: 'in', description: 'In Progress' }, period: 3, displayClock: '7:42' }, ...extra })
const response = (competitions = [competition()]) => new Response(JSON.stringify({ events: [{ id: '1', competitions }] }))
const run = (items, fetcher = async () => response(), extra = {}) => enrichScoreboards(items, { fetcher, ...extra })

test('normalization strips diacritics, punctuation, spaces and soccer club affixes only', () => {
  assert.equal(normalizeTeam('  AFC São-Paulo FC ', true), 'sao paulo')
  assert.equal(normalizeTeam('CF Barcelona', true), 'barcelona')
  assert.equal(normalizeTeam('FC Zürich', true), 'zurich')
  assert.equal(normalizeTeam('FC Zürich'), 'fc zurich')
})

test('provider homeAway controls order for both away-first and home-first fixtures', async () => {
  for (const name of ['Away FC vs. Home FC', 'Home FC vs Away FC', 'Home FC at Away FC']) {
    const event = item({ name })
    assert.equal((await run([event])).matched, 1)
    assert.equal(event.match.away.name, 'Away FC')
    assert.equal(event.match.home.name, 'Home FC')
    assert.equal(event.match.away.color, '#abc123')
    assert.equal(event.match.away.score, 12)
  }
})

test('requires both teams and a date within 36 hours, including own-date fallback', async () => {
  const events = [item({ name: 'Away FC vs Stranger' }), item({ starts_at: start + 3 * 86400 }), item({ starts_at: 0, date })]
  assert.deepEqual(await run(events), { leagues: 1, requests: 1, matched: 1, unmatched: 2 })
  assert.equal(events[0].match, undefined)
  assert.equal(events[1].match, undefined)
  assert.ok(events[2].match)
})

test('closest date disambiguates competitions and a competition is used once', async () => {
  const events = [item({ starts_at: start + 3600 }), item(), item({ starts_at: start + 20 * 3600 })]
  const comps = [competition(), competition({ date: new Date((start + 20 * 3600) * 1000).toISOString() })]
  const summary = await run(events, async () => response(comps))
  assert.equal(summary.matched, 2)
  assert.equal(events[0].match, undefined)
  assert.ok(events[1].match)
  assert.ok(events[2].match)
})

test('bad optional fields become null; provider display names stay verbatim', async () => {
  const event = item()
  const comp = competition({ competitors: [competitor('home', 'Home FC'), {
    ...competitor('away', 'Away FC', { color: 'oops', logo: 'http://example.com/logo' }), score: '1.5',
  }] })
  await run([event], async () => response([comp]))
  assert.deepEqual(event.match.away, { name: 'Away FC', abbreviation: 'Awa', color: null, logo: null, score: null })
})

test('pre scores are null, halftime and final details are bounded', async () => {
  for (const [state, description, detail] of [['pre', 'Scheduled', ''], ['in', 'Halftime', 'Halftime'], ['post', 'Final', 'Final']]) {
    const event = item()
    await run([event], async () => response([competition({ status: { type: { state, description } } })]))
    assert.equal(event.match.detail, detail)
    if (state === 'pre') assert.equal(event.match.home.score, null)
  }
})

test('404, malformed JSON and network errors leave items untouched and continue other leagues', async () => {
  for (const failure of [() => new Response('', { status: 404 }), () => new Response('{'), () => { throw Error('offline') }]) {
    const events = [item(), item({ tag: 'NBA' })]
    const before = structuredClone(events[0])
    const summary = await run(events, async url => url.includes('/soccer/') ? failure() : response())
    assert.deepEqual(events[0], before)
    assert.equal(summary.requests, 2)
    assert.equal(summary.matched, 1)
  }
})

test('one request per eligible league, no channels or unsupported sports; at most three in flight', async () => {
  const events = Object.keys(leaguePaths).flatMap(tag => [item({ tag }), item({ tag })])
  events.push(item({ always_live: 1 }), item({ tag: 'Cricket' }), item({ name: 'Channel' }))
  let active = 0, peak = 0
  const urls = []
  const summary = await run(events, async url => {
    urls.push(url); active++; peak = Math.max(peak, active)
    await new Promise(resolve => setTimeout(resolve, 2))
    active--; return response([])
  })
  assert.equal(summary.requests, 16)
  assert.equal(new Set(urls).size, 16)
  assert.equal(peak, 3)
})

test('expired budget makes no requests; slow league aborts without failing enrichment', async () => {
  assert.equal((await run([item()], () => { throw Error('must not fetch') }, { deadline: performance.now() - 1 })).requests, 0)
  const summary = await run([item()], async (_url, { signal }) => new Promise((_resolve, reject) => {
    const timer = setTimeout(() => reject(Error('test guard')), 100)
    signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason) })
  }), { deadline: performance.now() + 10 })
  assert.equal(summary.unmatched, 1)
})


test('period details follow NHL periods and college basketball halves', async () => {
  for (const [tag, detail] of [['NHL', 'P3 7:42'], ['College Basketball', 'OT 7:42'], ['NBA', 'Q3 7:42']]) {
    const event = item({ tag })
    await run([event])
    assert.equal(event.match.detail, detail)
  }
})

test('college basketball regulation details use halves', async () => {
  const event = item({ tag: 'College Basketball' })
  await run([event], async () => response([competition({ status: { ...competition().status, period: 2 } })]))
  assert.equal(event.match.detail, 'H2 7:42')
})

test('missing provider display name falls back to the correct fixture side', async () => {
  const event = item({ name: 'Home FC vs. Away FC' })
  await run([event], async () => response([competition({ competitors: [competitor('home', 'Home FC'),
    competitor('away', undefined, { name: 'Away FC' })] })]))
  assert.equal(event.match.away.name, 'Away FC')
})

test('malformed event structures are skipped without losing valid competitions', async () => {
  const event = item()
  await run([event], async () => Response.json({ events: [null, { competitions: {} }, { competitions: [null] },
    { id: 'valid', competitions: [competition()] }] }))
  assert.ok(event.match)
})
