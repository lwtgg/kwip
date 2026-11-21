import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isSnapshotUnavailable } from '../app/composables/useFeed.ts'

test('a readable snapshot that omits the detail does not qualify for HTTP 200', () => {
  assert.equal(isSnapshotUnavailable({
    data: { snapshotUnavailable: true, snapshotOmitted: true },
  }), false)
})

test('an unreadable snapshot still qualifies for HTTP 200', () => {
  assert.equal(isSnapshotUnavailable({
    data: { snapshotUnavailable: true, snapshotOmitted: false },
  }), true)
})
