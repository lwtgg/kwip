import assert from 'node:assert/strict'
import { test } from 'node:test'
import { endedLabel, formatRelative, kickoffDelayed, remainingLabel, windowLabel } from '../app/composables/useEventWindow.ts'

test('relative labels use compact units and expand them for assistive technology', () => {
  assert.equal(formatRelative(42 * 60), '42m')
  assert.equal(formatRelative(2 * 3600 + 14 * 60), '2h 14m')
  assert.equal(formatRelative(3 * 86400), '3d')
  assert.equal(remainingLabel(4140, 1020), '52 minutes remaining')
})

test('time labels change at the start and end boundaries', () => {
  const window = { startsAt: 1000, endsAt: 2080 }
  assert.deepEqual(windowLabel({ ...window, now: 940 }), { text: 'Upcoming in 1m', aria: 'Upcoming in 1 minute' })
  assert.deepEqual(windowLabel({ ...window, now: 1000 }), { text: 'Ends in 18m', aria: 'Ends in 18 minutes' })
  assert.deepEqual(windowLabel({ ...window, now: 2080 }), { text: 'Started 18m ago', aria: 'Started 18 minutes ago' })
  assert.deepEqual(endedLabel(2080, 2080), { text: 'Ended just now', aria: 'Ended just now' })
  assert.deepEqual(endedLabel(2080, 2140), { text: 'Ended 1m ago', aria: 'Ended 1 minute ago' })
})

test('24/7 channels take precedence over events without a start time', () => {
  const window = { startsAt: 0, endsAt: 0, now: 1000 }
  assert.equal(windowLabel(window).text, 'Event')
  assert.equal(windowLabel({ ...window, alwaysLive: 1 }).text, '24/7')
})

test('only a pre match this far past kickoff counts as delayed', () => {
  assert.equal(kickoffDelayed('pre', 1000, 1899), false)
  assert.equal(kickoffDelayed('pre', 1000, 1900), true)
  assert.equal(kickoffDelayed('in', 1000, 2500), false)
  assert.equal(kickoffDelayed('pre', 0, 2500), false)
  assert.equal(kickoffDelayed('pre', 1000, undefined), false)
})
