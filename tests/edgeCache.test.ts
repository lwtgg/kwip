import assert from 'node:assert/strict'
import { test } from 'node:test'
import { edgeCacheKey, edgeCacheMaxAge, isEdgeCacheable } from '../server/utils/edge-cache.ts'

test('normalizes render parameters and drops tracking parameters', () => {
  const key = (query: string) => edgeCacheKey(new URL('https://kwip.fyi/c/soccer' + query), 'commit', 'build-a').url
  assert.equal(key('?utm_source=x&source=2&filter=live&filter=upcoming'), key('?filter=live&source=2'))
  assert.deepEqual([...new URL(key('?source=2&filter=live')).searchParams.keys()], ['generation', 'build', 'host', 'filter', 'source'])
  assert.equal(key('?utm_source=x'), key(''))
  assert.equal(key('?source=1&source=2'), key('?source='))
  assert.notEqual(key('?source=1'), key('?source=2'))
})

test('keys include the request origin, host and generation', () => {
  const canonical = new URL('https://kwip.fyi/sitemap.xml')
  const mirror = new URL('https://kwip.lol/sitemap.xml')
  const committed = edgeCacheKey(canonical, 'commit', 'build-a').url
  assert.equal(new URL(committed).searchParams.get('host'), canonical.host)
  assert.notEqual(committed, edgeCacheKey(mirror, 'commit', 'build-a').url)
  assert.notEqual(committed, edgeCacheKey(canonical, 'seed', 'build-a').url)
  assert.notEqual(committed, edgeCacheKey(canonical, 'republished', 'build-a').url)
})

test('stores successful HTML or XML only, without cookies or request-header variants', () => {
  const headers = new Headers({ 'content-type': 'text/html; charset=utf-8' })
  assert.equal(isEdgeCacheable(200, headers), true)
  assert.equal(isEdgeCacheable(503, headers), false)
  assert.equal(isEdgeCacheable(301, headers), false)
  assert.equal(isEdgeCacheable(404, headers), false)
  headers.set('set-cookie', 'session=private')
  assert.equal(isEdgeCacheable(200, headers), false)
  headers.delete('set-cookie')
  headers.set('vary', 'accept-language')
  assert.equal(isEdgeCacheable(200, headers), false)
  assert.equal(isEdgeCacheable(200, new Headers({ 'content-type': 'application/xml' })), true)
  assert.equal(isEdgeCacheable(200, new Headers({ 'content-type': 'text/html5' })), false)
})

test('caps TTL at the render boundary and skips writes after crossing it', () => {
  assert.equal(edgeCacheMaxAge(1100, 1000.2), 99)
  assert.equal(edgeCacheMaxAge(1100, 1099.5), 0)
  assert.equal(edgeCacheMaxAge(1100, 1100), 0)
  assert.equal(edgeCacheMaxAge(1100, 1101), 0)
  assert.equal(edgeCacheMaxAge(3000, 1000), 900)
  assert.equal(edgeCacheMaxAge(Infinity, 1000), 900)
})

test('build identity separates deployments and normalizes as a search parameter', () => {
  const url = new URL('https://kwip.fyi/vods?utm_source=ignored')
  const key = (build: string | null | undefined) => edgeCacheKey(url, 'commit', build).url
  assert.equal(key('build-a'), key('build-a'))
  assert.notEqual(key('build-a'), key('build-b'))
  const special = 'build +/&?=#é'
  assert.equal(new URL(key(special)).searchParams.get('build'), special)
  assert.equal(key(special), edgeCacheKey(new URL('https://kwip.fyi/vods'), 'commit', special).url)
  assert.equal(key(undefined), key(null))
  for (const build of ['', 'undefined', 'null', 'build-a']) {
    assert.notEqual(key(undefined), key(build))
  }
  assert.equal(new URL(key(undefined)).searchParams.has('build'), false)
})
