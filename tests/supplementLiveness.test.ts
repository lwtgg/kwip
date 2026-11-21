import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isCachedSupplement, loadSupplementSources, matchSupplement } from '../app/utils/strmfree.ts'

const event = { name: 'Miami Heat at Houston Rockets', starts_at: 1_794_875_400 }
const stream = {
  name: event.name,
  category: 'basketball',
  match_timestamp: event.starts_at,
  stream_key: 'hou-mia',
}

test('supplement ranks URL variants by quality and leaves unknown variants unqualified', () => {
  const variants = ['1440p', '1720p', '360p', '', '720p', '480p', '540p', '2160p', '4K']
  const sources = matchSupplement(event, 'basketball', {
    streams: [{
      ...stream,
      iframe: 'https://strmfree.st/embed/hou-mia1080p?next=720p',
      additional_sources: variants.map(variant => ({
        url: `https://strmfree.st/embed/hou-mia${variant}`,
        quality: 'HD',
      })),
    }],
  })
  assert.deepEqual(sources?.map(source => source.sourceTag), [
    '4K', '4K', 'FHD', 'HD', 'SD', 'SD', 'SD', undefined, undefined, undefined,
  ])
  assert.deepEqual(sources?.slice(-3).map(source => source.data), ['1440p', '1720p', ''].map(variant =>
    `https://strmfree.st/embed/hou-mia${variant}`,
  ))
})

test('a stream key ending in a digit can be followed by a recognized resolution', () => {
  const sources = matchSupplement(event, 'basketball', {
    streams: [{ ...stream, stream_key: 'skyf1', iframe: 'https://strmfree.st/embed/racing/skyf11080p' }],
  })
  assert.equal(sources?.[0]?.sourceTag, 'FHD')
})

test('successful status confirms liveness and unavailable status stays unknown', async () => {
  const urls = ['1080p', '720p', '720p-alt', '540p'].map(variant => `https://strmfree.st/embed/hou-mia${variant}`)
  const payload = { streams: [{
    ...stream,
    iframe: urls[0] + '#player',
    additional_sources: urls.slice(1).map(url => ({ url })),
  }] }
  const cases = [
    { entries: [
      { url: urls[0], live: false },
      { url: 'https://strmfree.pk/embed/basketball/hou-mia720p?autoplay=1#player', live: true },
      { url: urls[3], live: 'true' },
      { live: true },
    ], liveUrls: [urls[1]] },
    { entries: [{ url: urls[0], live: true }], liveUrls: [urls[0] + '#player'] },
    { entries: [], liveUrls: [] },
    { entries: [{ url: urls[1], live: true }], status: 503, liveUrls: [] },
    { entries: {}, liveUrls: [] },
    { invalidJson: true, liveUrls: [] },
    { entries: null, liveUrls: [] },
  ]
  for (const { entries, liveUrls, status, invalidJson } of cases) {
    const keys: string[] = []
    const sources = await loadSupplementSources(event, 'basketball', payload, async key => {
      keys.push(key)
      if (entries === null) throw new Error('unreachable')
      if (invalidJson) return new Response('invalid JSON')
      return Response.json({ sources: entries }, { status })
    })
    assert.deepEqual(keys, ['hou-mia'])
    const now = Date.now()
    const stored = JSON.parse(JSON.stringify({ status: 'merged', fetchedAt: now, sources }))
    assert.ok(isCachedSupplement(stored, now))
    assert.equal(stored.sources.length, urls.length)
    const verified = Array.isArray(entries) && status === undefined
    for (const source of stored.sources) {
      assert.equal(source.live, verified ? liveUrls.includes(source.data) : undefined)
    }
  }
})

test('trailing slashes in chip and API URLs preserve quality and liveness', async () => {
  const embed = 'https://strmfree.st/embed/hou-mia'
  const sources = await loadSupplementSources(event, 'basketball', {
    streams: [{
      ...stream,
      iframe: embed + '1080p/?autoplay=1#player',
      additional_sources: [{ url: embed + '720p' }],
    }],
  }, async () => Response.json({ sources: [
    { url: embed + '1080p', live: true },
    { url: embed + '720p///#player', live: true },
  ] }))
  assert.deepEqual(sources?.map(({ sourceTag, live }) => [sourceTag, live]), [['FHD', true], ['HD', true]])
})
