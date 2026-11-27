import assert from 'node:assert/strict'
import { test } from 'node:test'
import { candidates, probeSource } from '../scripts/probe-source-health.mjs'

const embed = (name: string) => `https://strmfree.st/embed/basketball/${name}`

test('probe registry matches qualified source URLs and skips unknown or ineligible sources', () => {
  const starts_at = 1_800_000_000
  const urls = [
    embed('match'), embed('match') + '?duplicate=1',
    'https://streamfree.top/embed/basketball/match1080p',
    'https://taifood-blog.asia/embed/nba/2027-01-15/match',
    'https://embed.st/embed/admin/ppv-match/1',
    'https://strmfree.st.example/embed/basketball/match',
    'https://strmfree.st/other/basketball/match',
    'http://strmfree.st/embed/basketball/match',
    'https://strmfree.st:8443/embed/basketball/match',
  ]
  const selected = candidates([
    { starts_at, sources: urls.map(data => ({ data })) },
    { starts_at, iframe: embed('channel'), always_live: 1 },
    { starts_at: starts_at + 10_801, iframe: embed('too-early') },
  ], starts_at * 1000)
  assert.deepEqual([...selected.keys()], [
    'strmfree.st/embed/basketball/match',
    'streamfree.top/embed/basketball/match1080p',
    'taifood-blog.asia/embed/nba/2027-01-15/match',
  ])
})

test('embed and manifest probes distinguish bad pages and advancing or frozen playlists', async (t) => {
  const samples = new Map<string, number>()
  t.mock.method(globalThis, 'fetch', async (input: URL) => {
    const [, path, ...parts] = input.pathname.split('/')
    const name = path === 'live' ? parts[0]! : parts.at(-1)!
    if (path === 'embed') {
      if (name === 'missing') return new Response('{"detail":"Stream not found"}', { status: 404 })
      if (name === 'markers') return new Response('<html>Unrelated page</html>')
      return new Response(`<div id="jwplayer"></div><script>
const STREAM_KEY = '${name}';
const _0x = ${JSON.stringify({ [name]: { _t: 'test', _e: 1 } })};
</script>`)
    }
    if (path === 'get-stream-key') return Response.json({ server_name: 'origin' })
    if (path === 'live' && parts[1] === 'index.m3u8') {
      const count = samples.get(name) ?? 0
      samples.set(name, count + 1)
      const sequence = name === 'advancing' ? 20 + count : 20
      const body = name === 'invalid' || (name === 'bad-second' && count > 0)
        ? '#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXT-X-MEDIA-SEQUENCE:20\n#EXTINF:4.0,\nsegment.ts\n#EXTINF:4.0,\n<not a segment>'
        : `#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXT-X-MEDIA-SEQUENCE:${sequence}\n#EXTINF:4.0,\nsegment.ts\n`
      return new Response(body, { headers: { 'content-type': 'application/vnd.apple.mpegurl' } })
    }
    assert.equal(parts[1], 'segment.ts')
    return new Response('x', { status: 206 })
  })

  const names = ['markers', 'missing', 'invalid', 'frozen', 'advancing', 'bad-second']
  const results = await Promise.all(names.map(name => probeSource(embed(name))))
  assert.deepEqual(results.map(result => [result?.embedOk, result?.manifestOk, result?.sequence, (result as any)?.error]), [
    [false, false, 'unknown', 'embed-markers'],
    [false, false, 'unknown', 'embed-404'],
    [true, false, 'unknown', 'manifest-invalid'],
    [true, true, 'frozen', undefined],
    [true, true, 'advancing', undefined],
    [true, false, 'unknown', 'manifest-invalid'],
  ])
})
