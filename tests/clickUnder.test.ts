import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canClickUnder, isClickUnderEligible, openClickUnder } from '../app/utils/clickUnder.ts'
import { adRedirect } from '../server/utils/ad-redirect.ts'

test('only upcoming and live timed events qualify', () => {
  const timed = { starts_at: 100, ends_at: 200 }
  assert.equal(isClickUnderEligible(timed, 90), true)
  assert.equal(isClickUnderEligible(timed, 100), true)
  assert.equal(isClickUnderEligible(timed, 199), true)
  assert.equal(isClickUnderEligible(timed, 200), false)
  assert.equal(isClickUnderEligible({ ...timed, always_live: 1 }, 150), false)
  assert.equal(isClickUnderEligible({ ...timed, starts_at: 0 }, 150), false)
  assert.equal(isClickUnderEligible({ ...timed, ends_at: 0 }, 90), false)
  assert.equal(isClickUnderEligible(null, 150), false)
})

test('the first qualifying action claims the session before attempting the popup', () => {
  const storage = new Map<string, string>()
  const session = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value) },
  }
  assert.equal(canClickUnder(false, session, true), false)
  assert.equal(canClickUnder(true, session, false), false)
  assert.equal(canClickUnder(true, session, true, true), false)
  assert.equal(canClickUnder(true, session, true), true)

  const opens: string[][] = []
  let eligibleDuringOpen: boolean | undefined
  assert.equal(openClickUnder(session, 'source', (...args) => {
    opens.push(args)
    eligibleDuringOpen = canClickUnder(true, session, true)
    throw new Error('Popup rejected')
  }), true)
  assert.deepEqual(opens, [['/go/source', '_blank', 'noopener,noreferrer']])
  assert.equal(eligibleDuringOpen, false)
  assert.equal(openClickUnder(session, 'play', (...args) => opens.push(args)), false)
  assert.equal(opens.length, 1)
})

test('no storage or a failed storage write suppresses the popup', () => {
  assert.equal(canClickUnder(true, null, true), false)
  const unavailable = () => { throw new Error('Storage blocked') }
  assert.equal(canClickUnder(true, { getItem: unavailable, setItem: unavailable }, true), false)
  let opened = false
  assert.equal(openClickUnder({ getItem: () => null, setItem: unavailable }, 'play', () => {
    opened = true
  }), false)
  assert.equal(opened, false)
})

test('the redirect returns a no-store 302 for known placements and validates runtime configuration', () => {
  const target = 'https://advertiser.example/path?campaign=1'
  for (const [placement, enabled, destination, expected] of [
    ['source', true, target, target],
    ['play', true, target, target],
    ['source', true, '', 'https://kwip.fyi/'],
    ['source', true, '//advertiser.example/', 'https://kwip.fyi/'],
    ['source', true, 'javascript:alert(1)', 'https://kwip.fyi/'],
    ['source', false, target, 'https://kwip.fyi/'],
    ['unknown', true, target, 'https://kwip.fyi/'],
  ] as const) {
    const response = adRedirect(placement, enabled, destination)
    assert.equal(response.status, 302)
    assert.equal(response.headers.get('location'), expected)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer')
  }
})
