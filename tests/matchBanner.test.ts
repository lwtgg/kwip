import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bannerColor, bannerScrim, mixBannerColor } from '../app/composables/matchBanner.ts'
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
