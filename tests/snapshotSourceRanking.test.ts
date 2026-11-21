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
  assert.deepEqual(order(detail), ['first', 'alternate', 'last'])
})
