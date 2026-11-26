import assert from 'node:assert/strict'
import { test } from 'node:test'
import { computed, ref, toValue } from 'vue'
import { useFeedFreshness } from '../app/composables/useFeedFreshness.ts'

Object.assign(globalThis, {
  computed,
  ref,
  toValue,
  useState: (_key: string, init: () => number) => ref(init()),
  onMounted: () => {},
  onBeforeUnmount: () => {},
})

const publishedAt = 1_800_000_000

for (const [age, stale] of [[599, false], [600, true]] as const) {
  test(`a snapshot aged ${age} seconds is ${stale ? 'stale' : 'fresh'}`, (context) => {
    context.mock.method(Date, 'now', () => (publishedAt + age) * 1_000)

    const { isStale } = useFeedFreshness(publishedAt, ref(null), ref(null))

    assert.equal(isStale.value, stale)
  })
}

test('a successful retry acknowledges a stale snapshot with an unchanged origin', async (context) => {
  const completedAt = publishedAt + 601
  context.mock.method(Date, 'now', () => completedAt * 1_000)
  const freshAt = ref<number | null>(null)
  const { isStale, retry } = useFeedFreshness(publishedAt, freshAt, ref(null))

  assert.equal(isStale.value, true)
  await retry(async () => {}, () => [{ fromCache: true }])
  assert.equal(isStale.value, true)
  assert.equal(freshAt.value, null)

  await retry(async () => {}, () => [{ fromCache: false }])
  assert.equal(isStale.value, false)
  assert.equal(freshAt.value, completedAt)
})

test('a retry answer with a newer timestamp clears the notice even from cache', async (context) => {
  const completedAt = publishedAt + 601
  context.mock.method(Date, 'now', () => completedAt * 1_000)
  const origin = ref<number | null>(publishedAt)
  const { isStale, retry } = useFeedFreshness(origin, ref(null), ref(null))

  assert.equal(isStale.value, true)
  // Production /api/feed/streams always answers fromCache: true; only the timestamp moves.
  const newer = publishedAt + 300
  await retry(async () => { origin.value = newer }, () => [{ timestamp: newer, fromCache: true }])
  assert.equal(isStale.value, false)
})
