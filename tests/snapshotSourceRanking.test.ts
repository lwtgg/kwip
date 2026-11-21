import assert from 'node:assert/strict'
import { test } from 'node:test'
import { usePlayerSources } from '../app/composables/usePlayerSources.ts'
import { sourceKey } from '../app/utils/sourceIdentity.ts'

function source(name: string, sourceTag?: string, locale = 'en') {
  return { name, sourceTag, locale, data: `https://example.com/${name}`, default: false, type: 'iframe' as const }
}

function order(sources: ReturnType<typeof source>[], source_tag?: string) {
  const key = sourceKey(sources[0]!.data)
  return usePlayerSources({ sources, source_tag }, {
    [key]: { embedOk: false, manifestOk: false, sequence: 'unknown', checkedAt: new Date().toISOString() },
  }).map(option => option.url.split('/').at(-1))
}

test('health reorders only contiguous, known quality and locale peers', () => {
  assert.deepEqual(order([source('a', 'HD'), source('b', 'SD'), source('c', 'HD')]), ['a', 'b', 'c'])
  assert.deepEqual(order([source('a', 'HD'), source('b', 'HD', 'fr'), source('c', 'HD')]), ['a', 'b', 'c'])
  assert.deepEqual(order([source('a', '4K'), source('b'), source('c', '2160p')]), ['a', 'b', 'c'])
  assert.deepEqual(order([source('a'), source('b')]), ['a', 'b'])
  assert.deepEqual(order([{ ...source('a'), default: true }, source('b')], '4K'), ['a', 'b'])
  assert.deepEqual(order([source('a', '4K'), source('b', '2160p'), source('c', 'UHD')]), ['b', 'c', 'a'])
  assert.deepEqual(order([source('a', 'HD | ESPN'), source('b', '720p'), source('c', 'SD')]), ['b', 'a', 'c'])
})

test('absent health preserves picker order, labels, and options', () => {
  const sources = [source('sd', 'SD'), source('hd', 'HD'), source('unknown')]
  const baseline = sources.map(({ name, sourceTag, data }) => ({
    label: sourceTag ? `${name} · ${sourceTag}` : name,
    url: data, kind: 'iframe', host: 'example.com', key: sourceKey(data),
  }))
  assert.deepEqual(usePlayerSources({ sources }), baseline)
  assert.deepEqual(usePlayerSources({ sources }, {}), baseline)
})

test('independently fetched supplements cannot inherit snapshot health', () => {
  const supplement = {
    ...source('alternate', 'HD'),
    origin: 'supplement' as const, live: true, substreamName: '' as const,
  }
  const health = {
    [sourceKey(supplement.data)]: {
      embedOk: false, manifestOk: false, sequence: 'unknown' as const, checkedAt: new Date().toISOString(),
    },
  }
  const stream = { sources: [supplement, source('other', 'HD')] }
  assert.deepEqual(usePlayerSources(stream, health), usePlayerSources(stream))
  const detail = [source('first', 'HD', ''), { ...supplement, locale: '' }, source('last', 'HD', '')]
  assert.deepEqual(order(detail), ['alternate', 'last', 'first'])
})


test('in-band ranking uses degraded status, then liveness, then viewers', () => {
  const offline = {
    ...source('offline', '720p'),
    origin: 'supplement' as const, live: false, substreamName: '' as const, viewers: 100,
  }
  const live = { ...offline, data: 'https://example.com/live', live: true, viewers: 10 }
  const unknown = { ...source('unknown', 'HD'), viewers: 20 }
  const degraded = { ...source('degraded', 'HD'), viewers: 1000 }
  const sources = [degraded, offline, live, unknown]
  assert.deepEqual(order(sources), ['unknown', 'live', 'offline', 'degraded'])
  assert.deepEqual(
    usePlayerSources({ sources: [offline, live, unknown] }).map(({ key, live }) => [key, live]),
    [['example.com/unknown', undefined], ['example.com/live', true], ['example.com/offline', false]],
  )
  assert.deepEqual(
    usePlayerSources({ sources: [offline, unknown, { ...live, viewers: 30 }] }).map(({ url }) => url),
    [live.data, unknown.data, offline.data],
  )
})

test('liveness cannot cross an intervening quality, locale, or unknown-quality source', () => {
  const offline = {
    ...source('offline', 'HD'),
    origin: 'supplement' as const, live: false, substreamName: '' as const,
  }
  const live = { ...offline, data: 'https://example.com/live', live: true }
  for (const boundary of [source('sd', 'SD'), source('fr', 'HD', 'fr'), source('untagged')]) {
    const sources = [offline, boundary, live]
    assert.deepEqual(usePlayerSources({ sources }).map(({ url }) => url), sources.map(({ data }) => data))
  }
  const untagged = [{ ...offline, sourceTag: undefined }, { ...live, sourceTag: undefined }]
  assert.deepEqual(usePlayerSources({ sources: untagged }).map(({ url }) => url), untagged.map(({ data }) => data))
})

test('published supplements inherit snapshot health and move only within their band', () => {
  const supplement = {
    ...source('supplement', '720p', ''),
    origin: 'supplement' as const, live: true,
  }
  const peer = source('peer', 'HD', '')
  const boundary = source('boundary', 'SD', '')
  const stream = { sources: [supplement, peer, boundary], hasPublishedSupplement: true }
  const health = {
    [sourceKey(supplement.data)]: {
      embedOk: false, manifestOk: false, sequence: 'unknown' as const, checkedAt: new Date().toISOString(),
    },
  }
  assert.deepEqual(usePlayerSources(stream, health).map(({ key, degraded }) => [key, degraded]), [
    ['example.com/peer', undefined],
    ['example.com/supplement', true],
    ['example.com/boundary', undefined],
  ])
})
