import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bannerColor, bannerScrim, matchBannerContent, mixBannerColor } from '../app/composables/matchBanner.ts'
import { hexRGB, fieldContrast } from '../app/composables/cardTint.ts'

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
    const pair = colors.map(color => hexRGB(color)!.map(channel => channel * (1 - scrim)))
    assert.ok(fieldContrast(pair[0]!, pair[1]!, hexRGB('#fff')!) >= 4.5)
  }
})


const away = { name: 'Colorado State Rams', abbreviation: 'CSU', score: 150, color: null, logo: null }
const home = { name: 'Arizona Wildcats', abbreviation: 'Arizona', score: 197, color: null, logo: null }

test('live banner tiers order the state, provider detail and compact audience', () => {
  const live = { state: 'in', detail: 'Halftime', away, home } as const
  assert.deepEqual(matchBannerContent(live, '123456', 'viewers', false), {
    hasScores: true,
    tiers: ['Live', 'Halftime', '123.5k Viewers'],
    label: 'Colorado State Rams 150, Arizona Wildcats 197, Halftime',
  })
})

test('the matchup uses vs for an incomplete pregame score and keeps the provider detail in its label', () => {
  const upcoming = { state: 'pre', detail: 'Scheduled', away: { ...away, score: null }, home } as const
  assert.deepEqual(matchBannerContent(upcoming, '1', 'viewers', false), {
    hasScores: false,
    tiers: ['Upcoming', 'vs', '1 Viewer'],
    label: 'Colorado State Rams, Arizona Wildcats, Scheduled',
  })
})

test('final and stale banners retain their tiers without repeating the state or stale audience', () => {
  const final = { state: 'post', detail: 'Final', away, home } as const
  assert.deepEqual(matchBannerContent(final, '1', 'views', false).tiers, ['Final', '', '1 View'])
  assert.deepEqual(matchBannerContent(final, '250', 'views', true).tiers, ['Final', '', ''])
})
