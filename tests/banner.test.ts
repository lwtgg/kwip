import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canClickUnder } from '../app/utils/clickUnder.ts'
import { adRedirect } from '../server/utils/ad-redirect.ts'
import { getBannerCreative } from '../shared/utils/banner.ts'

const creative = { image: '/house.webp', alt: 'House campaign', destination: 'https://example.com/house' }
const visual = { image: creative.image, alt: creative.alt }

test('the flag and placement gate creatives independently', () => {
  const creatives = { 'event-banner': creative, 'vods-banner': { ...creative, alt: '' } }
  assert.equal(getBannerCreative(false, creatives, 'event-banner'), undefined)
  assert.equal(getBannerCreative(true, creatives, 'home-banner'), undefined)
  assert.equal(getBannerCreative(true, creatives, 'vods-banner'), undefined)
  assert.deepEqual(getBannerCreative(true, creatives, 'event-banner'), visual)
  for (const destination of ['', 'javascript:alert(1)']) {
    assert.equal(getBannerCreative(true, { 'home-banner': { ...creative, destination } }, 'home-banner'), undefined)
  }
})

test('missing and nonlocal images leave the configured label available', () => {
  for (const image of [undefined, '', 'https://example.com/banner.webp', '//example.com/banner.webp',
    '/\\example.com/banner.webp', '/\t/example.com/banner.webp']) {
    assert.deepEqual(getBannerCreative(true, { 'home-banner': { ...creative, image } }, 'home-banner'), {
      image: '', alt: creative.alt,
    })
  }
})

test('a failed image keeps its label and does not hide another placement image', () => {
  const creatives = {
    'home-banner': creative,
    'event-banner': { ...creative, image: '/event.webp' },
  }
  assert.deepEqual(getBannerCreative(true, creatives, 'home-banner', creative.image), {
    image: '', alt: creative.alt,
  })
  assert.deepEqual(getBannerCreative(true, creatives, 'event-banner', creative.image), { ...visual, image: '/event.webp' })
})

test('banner redirects stay placement-specific and independent of the click-under cap', () => {
  let capped = false
  const session = {
    getItem: () => capped ? '1' : null,
    setItem() {},
    removeItem() {},
  }
  const clickUnder = 'https://example.com/source'
  const banners = {
    'home-banner': { destination: 'https://example.com/home' },
    'event-banner': { destination: 'https://example.com/event' },
  }
  for (const [placement, target] of Object.entries(banners)) {
    for (const cappedBeforeClick of [false, true]) {
      capped = cappedBeforeClick
      const response = adRedirect(placement, true, clickUnder, banners)
      assert.equal(response.status, 302)
      assert.equal(response.headers.get('location'), target.destination)
      assert.equal(response.headers.get('cache-control'), 'no-store')
      assert.equal(response.headers.get('set-cookie'), null)
      assert.equal(canClickUnder(true, session, true), !cappedBeforeClick)
    }
  }
  assert.equal(adRedirect('vods-banner', true, clickUnder, banners).headers.get('location'), 'https://kwip.fyi/')
  assert.equal(adRedirect('home-banner', false, clickUnder, banners).headers.get('location'), 'https://kwip.fyi/')
  assert.equal(adRedirect('source', true, clickUnder, banners).headers.get('location'), clickUnder)
})
