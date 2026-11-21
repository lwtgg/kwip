import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sourceHealth } from '../app/utils/sourceHealth.ts'

const storageKey = 'source-health:v1:event'

function setup() {
  let now = 1000
  const entries = new Map<string, string>()
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value) },
    removeItem: (key: string) => { entries.delete(key) },
  } as Storage
  const health = sourceHealth(storage, 'event', () => now)
  return { entries, health, storage, advance: (ms: number) => { now += ms } }
}

test('round trips observations by event, forgets a key, and clears an event', () => {
  const { health, storage, entries } = setup()
  health.record('first')
  health.record('second')
  assert.deepEqual(JSON.parse(entries.get(storageKey)!), { at: 1000, keys: ['second', 'first'] })
  assert.deepEqual(sourceHealth(storage, 'other').read(), [])
  health.forget('first')
  assert.deepEqual(health.read(), ['second'])
  health.clear()
  assert.equal(entries.has(storageKey), false)
})

test('expires at 30 minutes and read never mutates storage', () => {
  const { entries, health, advance } = setup()
  health.record('first')
  const before = entries.get(storageKey)
  advance(30 * 60 * 1000 - 1)
  assert.deepEqual(health.read(), ['first'])
  assert.equal(entries.get(storageKey), before)
  advance(1)
  assert.deepEqual(health.read(), [])
  assert.equal(entries.get(storageKey), before)
  advance(1)
  assert.deepEqual(health.read(), [])
})

test('keeps the eight newest unique keys and ignores forgetting an unknown key', () => {
  const { entries, health, advance } = setup()
  for (let i = 0; i < 9; i++) health.record(String(i))
  health.record('1')
  assert.deepEqual(health.read(), ['1', '8', '7', '6', '5', '4', '3', '2'])
  const before = entries.get(storageKey)
  advance(1)
  health.forget('unknown')
  assert.equal(entries.get(storageKey), before)
})

test('ignores malformed JSON and invalid entries without changing storage', () => {
  const { entries, health } = setup()
  for (const value of ['{', '{"at":1000,"keys":[42]}', '{"at":"1000","keys":["first"]}']) {
    entries.set(storageKey, value)
    assert.deepEqual(health.read(), [])
    assert.equal(entries.get(storageKey), value)
  }
})

test('unavailable or throwing storage does not interrupt playback', () => {
  const fail = () => { throw new Error('blocked') }
  for (const storage of [null, { getItem: fail, setItem: fail, removeItem: fail } as unknown as Storage]) {
    const health = sourceHealth(storage, 'event')
    assert.deepEqual(health.read(), [])
    health.record('first')
    health.forget('first')
    health.clear()
  }
})

test('failed deletion drops the key from the active snapshot without extending its expiry', () => {
  const { entries, health, storage, advance } = setup()
  health.record('first')
  health.record('second')
  const entry = health.readEntry()!
  assert.deepEqual(entry, { expiresAt: 1000 + 30 * 60 * 1000, keys: ['second', 'first'] })
  advance(100)
  storage.setItem = () => { throw new Error('blocked') }
  const remaining = health.forget('first', entry)
  assert.deepEqual(remaining, { expiresAt: entry.expiresAt, keys: ['second'] })
  assert.deepEqual(health.read(), ['second', 'first'])
  storage.removeItem = () => { throw new Error('blocked') }
  assert.equal(health.forget('second', remaining), null)
  assert.equal(entries.has(storageKey), true)
})
