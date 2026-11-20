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
  const variants = ['1440p', '360p', '', '720p', '480p', '1080p', '540p', '2160p', '4K']
  const sources = matchSupplement(event, 'basketball', {
    streams: [{
      ...stream,
      iframe: 'https://strmfree.st/embed/hou-mia1080p?next=720p',
      additional_sources: variants.filter(variant => variant !== '1080p').map(variant => ({
        url: `https://strmfree.st/embed/hou-mia${variant}`,
      })),
    }],
  })
  assert.deepEqual(sources?.map(source => source.sourceTag), [
    '4K', '4K', 'FHD', 'HD', 'SD', 'SD', 'SD', undefined, undefined,
  ])
})

test('matched sources use API liveness and remain valid in the cache', async () => {
  const payload = { streams: [{
    ...stream,
    iframe: 'https://strmfree.st/embed/hou-mia1080p',
    additional_sources: [{ url: 'https://strmfree.st/embed/hou-mia720p', quality: 'HD', live: true }],
  }] }
  const now = event.starts_at * 1000
  const cases = [
    { response: () => Response.json({ sources: [{ live: false }, { live: true }] }), live: true },
    { response: () => Response.json({ sources: [] }), live: false },
    { response: () => Response.json({ sources: [{ live: 'true' }] }), live: false },
    { response: () => Response.json({ sources: [{ live: true }] }, { status: 503 }), live: false },
    { response: () => { throw new Error('unreachable') }, live: false },
  ]
  for (const { response, live } of cases) {
    const keys: string[] = []
    const sources = await loadSupplementSources(event, 'basketball', payload, async key => {
      keys.push(key)
      return response()
    })
    assert.deepEqual(keys, ['hou-mia'])
    assert.deepEqual(sources?.map(source => source.live), [live, live])
    const stored = JSON.parse(JSON.stringify({ status: 'merged', fetchedAt: now, sources }))
    assert.ok(isCachedSupplement(stored, now))
  }
})
