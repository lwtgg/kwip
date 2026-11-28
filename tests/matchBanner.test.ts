import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  bannerAbbreviation, bannerColor, bannerScrim, detailClock, logoHalo, matchBannerContent, matchMinute, mixBannerColor,
  teamInitials,
} from '../app/composables/matchBanner.ts'
import { hexRGB, fieldContrast, luminance } from '../app/composables/cardTint.ts'

test('unplayed colours are independently mixed at twelve percent in sRGB', () => {
  assert.equal(mixBannerColor('#00ff00', '#272624', .12), '#224020')
  assert.equal(mixBannerColor('#ff0000', '#272624', .12), '#412120')
  assert.equal(mixBannerColor('#fff', '#272624', 0), '#272624')
  assert.equal(mixBannerColor('#fff', '#272624', 1), '#ffffff')
  for (const seed of [null, undefined, 'invalid', '#12345678', 'url(x)']) {
    assert.equal(mixBannerColor(seed, '#272624', .12), '#272624')
    assert.equal(bannerColor(seed, '#272624'), '#272624')
  }
  assert.equal(bannerColor('#abc', '#272624'), '#abc')
})
test('the contrast guard preserves dark colours and protects bright and interior colours', () => {
  assert.equal(bannerScrim(['#192f23', '#361f24'], 4.5), 0)
  for (const colors of [['#fff', '#ff0'], ['#0f0', '#f00'], ['#123', '#456']]) {
    const scrim = bannerScrim(colors, 4.5)
    const pair = colors.map(color => hexRGB(color)!.map(channel => channel * (1 - scrim)) as RGB)
    assert.ok(fieldContrast(pair[0]!, pair[1]!, hexRGB('#fff')!) >= 4.5)
  }
})


test('a crest on its own colour gets a halo that clears the field, in whichever polarity does', () => {
  const halo = (field: string, target: number) => {
    const css = logoHalo(field, '#000', '#fff', target)
    const [, r, g, b, alpha] = /rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)/.exec(css)!
    // The composable mixes channel-wise in sRGB, then compares luminance.
    const end = luminance([r, g, b].map(v => Number(v) / 255) as RGB)
    return { alpha: Number(alpha), css, at: end }
  }
  // The TEX card: orange ink on an orange plate. Either polarity is fine (an orange mark is mid-tone),
  // so long as the ring clears the field. A mid plate gets one too; the darkest gets a light ring.
  for (const field of ['#a95935', '#7a7a7a', '#101010']) {
    const { at, alpha } = halo(field, 4)
    const ground = luminance(hexRGB(field)!)
    const mixed = ground + (at - ground) * alpha
    assert.ok((Math.max(mixed, ground) + 0.05) / (Math.min(mixed, ground) + 0.05) >= 4 - 1e-9)
  }
  // A field no ring can rescue at the requested ratio falls back to a nearly solid one.
  assert.ok(halo('#7a7a7a', 30).alpha >= 0.9)
  assert.ok(halo('#101010', 4).css.startsWith('rgb(255 255 255'))
})

const away = { name: 'Colorado State Rams', abbreviation: 'CSU', score: 150, color: null, logo: null }
const home = { name: 'Arizona Wildcats', abbreviation: 'ARIZ', score: 197, color: null, logo: null }

test('live banner tiers order the state, provider detail and compact audience', () => {
  const live = { state: 'in', detail: 'Halftime', away, home } as const
  assert.deepEqual(matchBannerContent(live, '123456', 'viewers', false), {
    hasScores: true,
    tiers: ['Live', 'Halftime', '123.5k Viewers'],
    label: 'Colorado State Rams 150, Arizona Wildcats 197. Live. Halftime. 123.5k Viewers (123,456).',
  })
})

test('the matchup uses vs for an incomplete pregame score, and the name says what the banner shows', () => {
  const upcoming = { state: 'pre', detail: 'Scheduled', away: { ...away, score: null }, home } as const
  assert.deepEqual(matchBannerContent(upcoming, '1', 'viewers', false), {
    hasScores: false,
    tiers: ['Upcoming', 'vs', '1 Viewer'],
    label: 'Colorado State Rams vs Arizona Wildcats. Upcoming. 1 Viewer.',
  })
})

test('final and stale banners retain their tiers without repeating the state or stale audience', () => {
  const final = { state: 'post', detail: 'Final', away, home } as const
  assert.deepEqual(matchBannerContent(final, '1', 'views', false).tiers, ['Final', '', '1 View'])
  assert.deepEqual(matchBannerContent(final, '250', 'views', true).tiers, ['Final', '', ''])
})

test('a bare minute advances from when the provider showed it, and only while the match is live', () => {
  const shownAt = 1_000_000
  const at = (minutes: number) => shownAt + minutes * 60
  // Counted from the provider's own number, so a late kickoff needs no correction.
  assert.equal(matchMinute("2'", 'in', shownAt, at(.4)), "2'")
  assert.equal(matchMinute("2'", 'in', shownAt, at(23)), "25'")
  // Stoppage keeps a stoppage minute: 45+2 becomes 45+3, never 48.
  assert.equal(matchMinute("45+2'", 'in', shownAt, at(1)), "45+3'")
  assert.equal(matchMinute("90+1'", 'in', shownAt, at(3)), "90+4'")
  assert.equal(matchMinute('Halftime', 'in', shownAt, at(5)), 'Halftime')
  assert.equal(matchMinute('Q2 05:12', 'in', shownAt, at(40)), 'Q2 05:12')
  assert.equal(matchMinute("2'", 'post', shownAt, at(140)), "2'")
  assert.equal(matchMinute("2'", 'in', undefined, at(40)), "2'")
  // A stale beat still has the ticked minute in it: the flag, not the clock, marks it unconfirmed.
  const live = { state: 'in', detail: "2'", away, home } as const
  assert.deepEqual(matchBannerContent(live, '1', 'viewers', true, false,
    { observedAt: shownAt, now: at(23) }).tiers, ['Live', "25'", ''])
})

test('the detail clock only restarts when the provider says something new', () => {
  const clock = detailClock()
  assert.equal(clock("2'", 1000), 1000)
  assert.equal(clock("2'", 1060), 1000)
  assert.equal(clock("3'", 1120), 1120)
  assert.equal(clock("", 1180), 1180)
})

test('the name carries the visible state, detail and audience in the banner\'s words, separated', () => {
  const live = { state: 'in', detail: 'Halftime', away: { ...away, score: 50 }, home: { ...home, score: 97 } } as const
  assert.equal(matchBannerContent(live, '62', 'viewers', false).label, 'Colorado State Rams 50, Arizona Wildcats 97. Live. Halftime. 62 Viewers.')
  const final = { ...live, state: 'post', detail: 'Final' } as const
  assert.equal(matchBannerContent(final, '1', 'views', false).label, 'Colorado State Rams 50, Arizona Wildcats 97. Final. 1 View.')
  // Stale rows show no audience, so the name has none either.
  assert.equal(matchBannerContent(final, '250', 'views', true).label, 'Colorado State Rams 50, Arizona Wildcats 97. Final.')
  // Every visible tier appears in the name, in order, so voice control can say what it reads.
  const { tiers, label } = matchBannerContent(live, '1234567', 'viewers', false)
  let from = 0
  for (const tier of tiers) {
    const at = label.indexOf(tier, from)
    assert.ok(at >= from, `${tier} missing from ${label}`)
    from = at + tier.length
  }
})

test('an empty abbreviation falls back to the name so nothing under a logo is blank', () => {
  assert.equal(bannerAbbreviation({ ...away, abbreviation: 'CSU' }), 'CSU')
  assert.equal(bannerAbbreviation({ ...home, abbreviation: 'ARIZ' }), 'ARIZ')
  assert.equal(bannerAbbreviation({ ...away, abbreviation: '' }), 'CSR')
  assert.equal(bannerAbbreviation({ ...home, abbreviation: '  ' }), 'AW')
  assert.equal(teamInitials('west washington'), 'WW')
  assert.equal(teamInitials('Colorado State Rams'), 'CS')
})

test('a pre match well past kickoff reads as delayed, on screen and in the name', () => {
  const late = { state: 'pre', detail: 'Scheduled', away: { ...away, score: null }, home } as const
  const content = matchBannerContent(late, '1', 'viewers', false, true)
  assert.deepEqual(content.tiers, ['Delayed', 'vs', '1 Viewer'])
  assert.equal(content.label, 'Colorado State Rams vs Arizona Wildcats. Kickoff delayed. 1 Viewer.')
  const finished = { state: 'post', detail: 'Final', away, home } as const
  assert.equal(matchBannerContent(finished, '1', 'viewers', false, true).tiers[0], 'Final')
})
