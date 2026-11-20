import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canClickUnder } from '../app/utils/clickUnder.ts'
import { adRedirect } from '../server/utils/ad-redirect.ts'
import { getAdDestination, getBannerCreative, type BannerPlacement } from '../shared/utils/banner.ts'

const creative = { image: '/banners/house.webp', alt: 'House campaign', destination: 'https://example.com/house' }

test('the flag and placement gate creatives independently', () => {
  const creatives = { 'event-banner': creative, 'vods-banner': { ...creative, alt: '' } }
  assert.equal(getBannerCreative(false, creatives, 'event-banner'), undefined)
  assert.equal(getBannerCreative(true, creatives, 'home-banner'), undefined)
  assert.equal(getBannerCreative(true, creatives, 'vods-banner'), undefined)
  assert.equal(getBannerCreative(true, creatives, 'event-banner')?.image, creative.image)
})

test('missing images keep a labelled box; malformed paths suppress the slot', () => {
  for (const image of [undefined, '']) {
    const banner = getBannerCreative(true, { 'home-banner': { ...creative, image } }, 'home-banner')
    assert.equal(banner?.image, '')
    assert.equal(banner?.alt, creative.alt)
    assert.ok(banner?.key)
    const redirect = adRedirect('home-banner', true, '', { 'home-banner': { ...creative, image } }, banner.key)
    assert.equal(redirect.headers.get('location'), creative.destination)
  }
  for (const image of [' ', '/', '/?name=foo', 'relative.webp', 'https://example.com/banner.webp',
    '//example.com/banner.webp', '/\\example.com/banner.webp', '/\t/example.com/banner.webp', '/banners/bad%path.webp',
    '/go/source', '/banners/../go/source', '/banners/%2e%2e/go/source', '/banners//house.webp',
    '/banners/house.webp?url=external', '/banners/house.webp#fragment', '/banners/house.webp\n',
    '/banners/house.html', '/banners/house']) {
    assert.equal(getBannerCreative(true, { 'home-banner': { ...creative, image } }, 'home-banner'), undefined)
  }
})

test('destinations require a literal HTTP(S) scheme and a credential-free authority', () => {
  for (const destination of ['', 'https:example.com', 'https:///example.com', 'https://@example.com',
    'https://user:pass@example.com', 'https://example.com\\path', 'https://exam\tple.com',
    'https://example.com/path\n', ' https://example.com', 'javascript:alert(1)']) {
    assert.equal(getAdDestination(destination), undefined, destination)
    assert.equal(getBannerCreative(true, { 'home-banner': { ...creative, destination } }, 'home-banner'), undefined)
  }
  assert.equal(getAdDestination('https://example.com/offer?q=two%20words'), 'https://example.com/offer?q=two%20words')
})

test('banner redirects stay placement-specific and independent of the click-under cap', () => {
  let capped = false
  const session = { getItem: () => capped ? '1' : null, setItem() {}, removeItem() {} }
  const clickUnder = 'https://example.com/source'
  const banners = {
    'home-banner': creative,
    'event-banner': { ...creative, destination: 'https://example.com/event' },
  }
  for (const placement of Object.keys(banners) as BannerPlacement[]) {
    const banner = getBannerCreative(true, banners, placement)!
    for (const cappedBeforeClick of [false, true]) {
      capped = cappedBeforeClick
      const response = adRedirect(placement, true, clickUnder, banners, banner.key)
      assert.equal(response.status, 302)
      assert.equal(response.headers.get('location'), banner.destination)
      assert.equal(response.headers.get('cache-control'), 'no-store')
      assert.equal(response.headers.get('set-cookie'), null)
      assert.equal(canClickUnder(true, session, true), !cappedBeforeClick)
    }
  }
  assert.equal(adRedirect('home-banner', false, clickUnder, banners).headers.get('location'), 'https://kwip.fyi/')
  assert.equal(adRedirect('source', true, clickUnder, banners).headers.get('location'), clickUnder)
})

test('stale, missing and substituted creative keys cannot redirect to the current campaign', () => {
  const placement = 'home-banner'
  const original = { [placement]: creative }
  const oldKey = getBannerCreative(true, original, placement)!.key
  const replacement = { [placement]: { ...creative, destination: 'https://example.com/replacement' } }
  const newKey = getBannerCreative(true, replacement, placement)!.key
  for (const key of [oldKey, undefined, [newKey], 'https://example.com/other']) {
    const response = adRedirect(placement, true, '', replacement, key)
    assert.equal(response.status, 410)
    assert.equal(response.headers.get('location'), null)
    assert.equal(response.headers.get('cache-control'), 'no-store')
  }
  assert.equal(adRedirect(placement, true, '', replacement, newKey).headers.get('location'), replacement[placement].destination)
})
