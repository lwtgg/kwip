import assert from 'node:assert/strict'
import test from 'node:test'
import { canMountHeroFrame, heroFrameUrl, isZliveEmbed, resolveHeroEmbed, selectTopEvent } from '../app/utils/topEvent.ts'

const zlive = 'https://zlive.st/embed/TSN4?quality=high&muted=0&muted=0#player'
const taifood = 'https://taifood-blog.asia/embed/247-fox-cricket'
const popular = { viewers: '1000', starts_at: 10, iframe: taifood }
const alternatives = [
  { iframe: zlive },
  { iframe: taifood, substreams: [{ iframe: zlive }] },
  { iframe: taifood, substreams: [{ sources: [{ type: 'iframe', data: zlive }] }] },
  { iframe: taifood, sources: [{ type: 'iframe', data: zlive, origin: 'supplement' }] },
  { iframe: taifood, hero_embed: zlive },
]

test('a resolved zlive embed wins ahead of a more popular live event', () => {
  for (const alternate of alternatives) {
    const event = { viewers: '62', starts_at: 20, ...alternate }
    const lower = { ...event, viewers: '1' }
    assert.equal(selectTopEvent([popular, lower, event], [], [], [], 'all')?.stream, event)
    assert.equal(resolveHeroEmbed(event), zlive)
  }
})

test('source identity excludes links and lookalikes', () => {
  assert.equal(resolveHeroEmbed({
    iframe: taifood,
    sources: [
      { type: 'link', data: zlive },
      { type: 'iframe', data: 'https://zlive.st.example.test/embed/TSN4' },
      { type: 'iframe', data: 'https://zlive.st/watch/TSN4' },
    ],
  }), taifood)
  assert.equal(resolveHeroEmbed(popular, alternatives[3]), zlive)
})

test('viewer rank decides without zlive and kickoff decides without live events', () => {
  const lower = { ...popular, viewers: '50' }
  const later = { ...popular, starts_at: 30 }
  assert.deepEqual(selectTopEvent([lower, popular], [], [], [], 'all'), { stream: popular, mode: 'live' })
  assert.deepEqual(selectTopEvent([], [], [later, lower], [], 'all'), { stream: lower, mode: 'upcoming' })
  assert.equal(selectTopEvent([], [], [later, lower], [], 'upcoming')?.stream, later)
  assert.equal(selectTopEvent([], [popular], [later], [], 'all')?.stream, popular)
  assert.equal(selectTopEvent([], [], [], [lower, popular], 'all')?.stream, popular)
})

test('the frame URL preserves other queries and fragments and sets muted once', () => {
  assert.equal(heroFrameUrl(zlive, true, false), 'https://zlive.st/embed/TSN4?quality=high&muted=1#player')
  assert.equal(heroFrameUrl(zlive, true, true), 'https://zlive.st/embed/TSN4?quality=high#player')
  assert.equal(heroFrameUrl(zlive, false, false), 'https://zlive.st/embed/TSN4?quality=high&muted=1&autoplay=0#player')
  assert.equal(heroFrameUrl('https://zlive.st/embed/TSN4?autoplay=off', true, false),
    'https://zlive.st/embed/TSN4?autoplay=1&muted=1')
  assert.equal(heroFrameUrl(taifood, true, false), taifood)
})

test('normalizes zlive URLs before ranking and framing', () => {
  const candidates = [
    ['http://zlive.st/embed/TSN4', 'https://zlive.st/embed/TSN4'],
    ['HTTPS://ZLIVE.ST/EMBED/TSN4', 'https://zlive.st/EMBED/TSN4'],
    ['https://zlive.st/embed/TSN4/', 'https://zlive.st/embed/TSN4'],
    ['https://user:secret@zlive.st/embed/TSN4', 'https://zlive.st/embed/TSN4'],
  ]
  for (const [source, expected] of candidates) {
    const event = { ...popular, viewers: '62', iframe: source }
    assert.equal(isZliveEmbed(source), true)
    assert.equal(resolveHeroEmbed(event), expected)
    assert.equal(selectTopEvent([popular, event], [], [], [], 'all')?.stream, event)
    assert.equal(heroFrameUrl(source, true, false), expected + '?muted=1')
  }
  for (const source of ['javascript://zlive.st/embed/TSN4', 'https://zlive.st.evil.test/embed/TSN4',
    'https://zlive.st@evil.test/embed/TSN4', 'https://zlive.st:8443/embed/TSN4']) {
    assert.equal(isZliveEmbed(source), false)
    assert.equal(selectTopEvent([popular, { ...popular, viewers: '62', iframe: source }], [], [], [], 'all')?.stream, popular)
  }
  assert.equal(resolveHeroEmbed({ iframe: 'javascript://zlive.st/embed/TSN4' }), undefined)
})

test('preserves host placeholders through projection and hero query updates', () => {
  const source = 'https://zlive.st/embed/{host}?parent={host}'
  assert.equal(resolveHeroEmbed({ iframe: source }), source)
  assert.equal(heroFrameUrl(source, true, false), source + '&muted=1')
  assert.equal(resolveHeroEmbed({ iframe: 'https://{host}/{host}/embed' }), 'https://{host}/{host}/embed')
})

test('the player requires intersection, visibility and release from the data hold', () => {
  assert.equal(canMountHeroFrame(true, true, false), true)
  assert.equal(canMountHeroFrame(false, true, false), false)
  assert.equal(canMountHeroFrame(true, false, false), false)
  assert.equal(canMountHeroFrame(true, true, true), false)
})
