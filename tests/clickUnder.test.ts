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

test('a blocked popup leaves the session available for the next qualifying click', () => {
  const storage = new Map<string, string>()
  const session = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value) },
    removeItem: (key: string) => { storage.delete(key) },
  }
  assert.equal(canClickUnder(false, session, true), false)
  assert.equal(canClickUnder(true, session, false), false)
  assert.equal(canClickUnder(true, session, true, true), false)

  assert.equal(openClickUnder(session, 'source', () => null), false)
  assert.equal(openClickUnder(session, 'source', () => { throw new Error('Popup rejected') }), false)
  assert.equal(canClickUnder(true, session, true), true)

  const opens: string[][] = []
  const navigations: { href: string; rel: string; opener: unknown }[] = []
  const link = {
    href: '',
    rel: '',
    click() { navigations.push({ href: link.href, rel: link.rel, opener: popup.opener }) },
  }
  const popup = {
    opener: {} as unknown,
    close() {},
    document: { createElement: () => link },
  }
  assert.equal(openClickUnder(session, 'source', (...args) => {
    opens.push(args)
    return popup
  }), true)
  assert.deepEqual(opens, [['about:blank', '_blank']])
  assert.deepEqual(navigations, [{ href: '/go/source', rel: 'noreferrer', opener: null }])
  assert.equal(canClickUnder(true, session, true), false)
  assert.equal(openClickUnder(session, 'play', (...args) => {
    opens.push(args)
    return popup
  }), false)
  assert.equal(opens.length, 1)
})

test('throwing navigation closes the popup and rolls back the session cap', () => {
  const storage = new Map<string, string>()
  const session = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value) },
    removeItem: (key: string) => { storage.delete(key) },
  }
  let closed = false
  const popup = {
    opener: {},
    close() { closed = true },
    document: { createElement: () => ({
      href: '',
      rel: '',
      click() { throw new Error('Navigation rejected') },
    }) },
  }
  assert.equal(openClickUnder(session, 'source', () => popup), false)
  assert.equal(closed, true)
  assert.equal(canClickUnder(true, session, true), true)
})

test('unavailable session storage suppresses ad navigation', () => {
  assert.equal(canClickUnder(true, null, true), false)
  const unavailable = () => { throw new Error('Storage blocked') }
  assert.equal(canClickUnder(true, { getItem: unavailable, setItem: unavailable, removeItem: unavailable }, true), false)
  let closed = false
  let navigated = false
  assert.equal(openClickUnder({ getItem: () => null, setItem: unavailable, removeItem: unavailable }, 'play', () => ({
    opener: {},
    close() {
      closed = true
      throw new Error('Popup cleanup rejected')
    },
    document: { createElement: () => ({ href: '', rel: '', click() { navigated = true } }) },
  })), false)
  assert.equal(closed, true)
  assert.equal(navigated, false)
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
