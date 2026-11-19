import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { isCachedSupplement, matchSupplement } from '../app/utils/strmfree.ts'

const { streams: [fixture] } = JSON.parse(readFileSync(new URL('../public/fixtures/strmfree.json', import.meta.url), 'utf8'))
const { data: event } = JSON.parse(readFileSync(new URL('../public/fixtures/stream.json', import.meta.url), 'utf8'))

test('supplement matches the offline fixture in quality order', () => {
  const sources = matchSupplement(event, 'basketball', { streams: [fixture] })
  assert.deepEqual(sources?.map(source => source.sourceTag), ['4K', 'FHD', 'HD', 'SD', undefined])
})

test('match separators with attached punctuation keep the two teams distinct', () => {
  const paris = { ...event, name: 'Paris FC vs.Marseille' }
  const marseille = { ...fixture, name: 'Marséille v. (Paris)' }
  assert.ok(matchSupplement(paris, 'football', { streams: [marseille] }))
  assert.equal(matchSupplement(paris, 'football', { streams: [{ ...marseille, name: 'Marseille' }] }), null)
  assert.equal(matchSupplement(paris, 'football', { streams: [{ ...marseille, name: 'Marseille at Paris Saint-Germain' }] }), null)
})

test('punctuation and apostrophes fold within each team token', () => {
  const matchup = { ...event, name: 'St. O’Connor FC vs. Marseille' }
  const reverse = { ...fixture, name: 'Marseille at St OConnor' }
  assert.ok(matchSupplement(matchup, 'football', { streams: [reverse] }))
  assert.ok(matchSupplement({ ...matchup, name: reverse.name }, 'football', {
    streams: [{ ...reverse, name: matchup.name }],
  }))
})

test('a cached supplement must contain fresh, well-formed sources on approved hosts', () => {
  const sources = matchSupplement(event, 'basketball', { streams: [fixture] })!
  const now = event.starts_at * 1000
  const cached = { status: 'merged', fetchedAt: now - 1, sources }
  assert.ok(isCachedSupplement(cached, now))
  for (const fetchedAt of [String(now), NaN, Infinity, now + 1, now - 600_000, -1]) {
    assert.equal(isCachedSupplement({ ...cached, fetchedAt }, now), false)
  }
  for (const source of [null, [], {}, { ...sources[0], data: 5 }, {
    ...sources[0], data: 'https://evilstrmfree.st/embed',
  }, { ...sources[0], data: 'https://strmfree.st.example.org/embed' }]) {
    assert.equal(isCachedSupplement({ ...cached, sources: [...sources, source] }, now), false)
  }
})
