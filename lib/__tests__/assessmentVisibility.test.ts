import test from 'node:test'
import assert from 'node:assert/strict'
import { assessmentVisibility } from '../assessmentVisibility.ts'
import { calibiFromSources } from '../calibiScore.ts'

test('before the first assessment: no result card; second assessment is locked but listed', () => {
  assert.deepEqual(assessmentVisibility(null, null), {
    firstDone: false, secondDone: false, showFirstResultCard: false, showSecondLaunchCard: true,
  })
})

test('after the first assessment: feature the first result; offer the second exam', () => {
  assert.deepEqual(assessmentVisibility({ total: 0 }, null), {
    firstDone: true, secondDone: false, showFirstResultCard: true, showSecondLaunchCard: true,
  })
})

test('after the second assessment: completed cards disappear; both reports stay in the score list', () => {
  assert.deepEqual(assessmentVisibility({ total: 72 }, { total: 640 }), {
    firstDone: true, secondDone: true, showFirstResultCard: false, showSecondLaunchCard: false,
  })
  assert.deepEqual(calibiFromSources({ a1: { total: 72 }, a2: { total: 640 } }).entries.map(e => e.key), ['a1', 'a2'])
  assert.equal(assessmentVisibility({ total: 72 }, { total: null }).showSecondLaunchCard, true)
})
