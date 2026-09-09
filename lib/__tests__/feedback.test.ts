import test from 'node:test'
import assert from 'node:assert/strict'
import { feedbackOptions, validFeedback } from '../feedback.ts'

test('each star supplies ready-to-submit editable wording', () => {
  assert.equal(feedbackOptions.length, 5)
  feedbackOptions.forEach((option, index) => {
    assert.ok(option.label)
    assert.equal(validFeedback(index + 1, option.text), true)
  })
})

test('feedback requires a whole-number rating and meaningful bounded text', () => {
  for (const rating of [0, 6, -1, 1.5, '5', null, undefined, NaN]) {
    assert.equal(validFeedback(rating, feedbackOptions[4].text), false)
  }
  for (const message of ['', 'short', '          ', 'x'.repeat(1001), null, 42]) {
    assert.equal(validFeedback(5, message), false)
  }
  assert.equal(validFeedback(1, 'x'.repeat(10)), true)
  assert.equal(validFeedback(5, 'x'.repeat(1000)), true)
})
