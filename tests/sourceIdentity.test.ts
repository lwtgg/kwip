import test from 'node:test'
import assert from 'node:assert/strict'
import { sourceKey, sourceHost, sourceLabel } from '../app/utils/sourceIdentity.ts'

test('sourceKey is host plus path, without scheme or trailing slash', () => {
  assert.equal(sourceKey('https://Taifood-blog.asia/embed/nfl/x/'), 'taifood-blog.asia/embed/nfl/x')
  assert.equal(sourceKey('//strmfree.st/embed/soccer/a'), 'strmfree.st/embed/soccer/a')
  assert.equal(sourceKey('not a url'), 'not a url')
})

test('sourceKey keeps one host and one path entry distinct', () => {
  const a = sourceKey('https://taifood-blog.asia/embed/nfl/x')
  const b = sourceKey('https://strmfree.st/embed/nfl/x')
  assert.notEqual(a, b)
})

test('sourceHost returns the bare host', () => {
  assert.equal(sourceHost('https://strmfree.st/embed/soccer/a'), 'strmfree.st')
  assert.equal(sourceHost('nonsense'), '')
})

test('sourceLabel prefers the substream name over the provider placeholder', () => {
  assert.equal(
    sourceLabel({ data: 'https://taifood-blog.asia/embed/x', name: 'External Player Frame', substreamName: 'Prime Video', sourceTag: 'HD' }, 0),
    'Prime Video · HD',
  )
})

test('sourceLabel falls back to the registrable host when the name is the placeholder', () => {
  assert.equal(sourceLabel({ data: 'https://strmfree.st/embed/soccer/a', name: 'External Player Frame' }, 0), 'strmfree')
  assert.equal(sourceLabel({ data: 'https://pitsport.st/p/1' }, 0), 'pitsport')
})

test('sourceLabel uses the longest listed public suffix or the final label', () => {
  assert.equal(sourceLabel({ data: 'https://www.bt.co.uk' }, 0), 'bt')
  assert.equal(sourceLabel({ data: 'https://www.bt.uk' }, 0), 'bt')
  assert.equal(sourceLabel({ data: 'https://video.example.k12.ca.us/x' }, 0), 'example')
  assert.equal(sourceLabel({ data: 'https://a.co.uk/y' }, 0), 'a')
  assert.equal(sourceLabel({ data: 'https://www.com.au/y' }, 0), 'www')
})

for (const suffix of [
  'org.au', 'gov.au', 'edu.au', 'com.sg', 'co.id', 'com.tr', 'com.ar', 'co.il',
  'ac.nz', 'co.nz', 'com.sa', 'com.ng', 'com.pk', 'co.ke',
]) {
  test(`sourceLabel recognizes the ${suffix} suffix`, () => {
    assert.equal(sourceLabel({ data: `https://player.example.${suffix}` }, 0), 'example')
  })
}

test('sourceLabel keeps namespace words as registrants before multi-label suffixes', () => {
  assert.equal(sourceLabel({ data: 'https://player.org.org.au' }, 0), 'org')
  assert.equal(sourceLabel({ data: 'https://a.co.uk' }, 0), 'a')
})

test('sourceLabel keeps the label before a single-label suffix', () => {
  assert.equal(sourceLabel({ data: 'https://www.org.net' }, 0), 'org')
})

test('sourceLabel keeps two-letter names under .com', () => {
  assert.equal(sourceLabel({ data: 'https://bt.com' }, 0), 'bt')
  assert.equal(sourceLabel({ data: 'https://www.bt.com' }, 0), 'bt')
  assert.equal(sourceLabel({ data: 'https://watch.aa.com' }, 0), 'aa')
})

test('sourceLabel survives an unparseable URL and an IP host', () => {
  assert.equal(sourceLabel({ data: 'nonsense' }, 2), 'Source 3')
  assert.equal(sourceLabel({ data: 'https://1.2.3.4/p' }, 0), '1.2.3.4')
})
