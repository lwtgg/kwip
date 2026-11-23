import assert from 'node:assert/strict'
import { test } from 'node:test'
import { usePlayerSources } from '../app/composables/usePlayerSources.ts'
import { channelName, isChannelBackup } from '../app/utils/supplementMatch.ts'

test('normalizes channel punctuation, accents and stacked suffixes', () => {
  assert.equal(channelName('  Ský Sports: F1 (UK) FHD Backup 2 '), 'sky sports f1')
  assert.equal(channelName('ESPN 2 USA HD'), 'espn 2')
  assert.equal(channelName('TNT Sports 3 (if TNT 3 lags)'), 'tnt sports 3')
})

test('recognizes backup labels without treating quality or country as a backup', () => {
  for (const name of ['Sky Backup', 'Sky Backup 2', 'Sky Backup 3', 'Sky (if X lags)']) {
    assert.equal(isChannelBackup(name), true, name)
  }
  for (const name of ['Sky FHD UK', 'Sky HD USA']) {
    assert.equal(isChannelBackup(name), false, name)
  }
})

test('prefers a channel name to a conflicting slug and restricts slug fallback to 24/7', async (t) => {
  const { fetchZliveListing, matchZliveSources } = await import('../scripts/publish-supplements.mjs')
  const channels = [
    { id: 'one', name: 'Channel One', quality: 'FHD', sport: 'Sports', live: true, url: 'https://zlive.st/embed/one' },
    { id: 'one-hd', name: 'Channel One HD', quality: 'HD', sport: 'Sports', live: true, url: 'https://zlive.st/embed/one-hd' },
    { id: 'two', name: 'Channel Two', sport: 'Sports', live: true, url: 'https://zlive.st/embed/two' },
    { id: 'two-backup', name: 'Channel Two HD Backup', quality: 'HD', sport: 'Sports', live: true, url: 'https://zlive.st/embed/two-backup' },
    { id: 'two-backup-fhd', name: 'Channel Two FHD Backup 2', quality: 'FHD', sport: 'Sports', live: true, url: 'https://zlive.st/embed/two-backup-fhd' },
  ]
  t.mock.method(globalThis, 'fetch', async () => Response.json({ count: channels.length, channels }))
  const listing = await fetchZliveListing(performance.now() + 1000)
  const event = { name: 'Channel One', channelSlug: 'two', always_live: 1 }
  assert.deepEqual(matchZliveSources(event, listing).map(source => source.data), [channels[0]!.url])
  assert.deepEqual(matchZliveSources({ ...event, name: 'Alias' }, listing).map(source => source.data), [channels[2]!.url, channels[4]!.url, channels[3]!.url])
  assert.deepEqual(matchZliveSources({ ...event, always_live: 0 }, listing), [])
  assert.deepEqual(matchZliveSources(event, listing, { sources: [{ data: channels[0]!.url + '?primary' }] })
    .map(source => source.data), [channels[1]!.url])
})

test('rejects a manifest body over the download cap', async (t) => {
  const { fetchZliveListing } = await import('../scripts/publish-supplements.mjs')
  const fetch = t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ count: 0, channels: [], padding: 'x'.repeat(256 * 1024) }))
  assert.equal(await fetchZliveListing(performance.now() + 1000), undefined)
  assert.equal(fetch.mock.callCount(), 1)
})

test('zlive health only reorders peers in the same quality and locale band', () => {
  const primary = { name: 'Primary', default: true, type: 'iframe' as const,
    data: 'https://primary.example/player', sourceTag: 'FHD', locale: 'UK' }
  const alternate = (id: string, sourceTag = 'FHD', locale = 'UK') => ({
    ...primary, default: false, origin: 'zlive' as const, data: `https://zlive.st/embed/${id}`, sourceTag, locale,
  })
  const sources = [primary, alternate('degraded'), alternate('backup'), alternate('us', 'FHD', 'US'), alternate('hd', 'HD')]
  const failed = { embedOk: false, manifestOk: false, sequence: 'unknown' as const, checkedAt: new Date().toISOString() }
  const options = usePlayerSources({ sources }, {
    'primary.example/player': failed,
    'zlive.st/embed/degraded': failed,
  })
  assert.deepEqual(options.map(({ url }) => url), [sources[0]!.data, sources[2]!.data, sources[1]!.data, sources[3]!.data, sources[4]!.data])
  assert.equal(options[1]?.host, 'zlive.st')
})
