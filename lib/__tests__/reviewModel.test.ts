import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

import { buildReview } from '../reviewModel.ts'

// Node's type-stripping test runner can't resolve the `@/` alias, so load the
// raw question data directly.
const require = createRequire(import.meta.url)
const data = require('../../data/questions.json')

test('review model totals match the full assessment and answers map to status', () => {
  const review = buildReview(data, {})
  assert.equal(review.stats.total, 48)
  assert.equal(review.stats.answered, 0)

  const labels = review.sections.map((s) => s.label)
  assert.deepEqual(labels, [
    'English Communication',
    'Problem Solving',
    'AI-Assisted Debugging',
    'AI Feature Development',
    'Prompt Engineering',
    'Cognitive Assessment',
  ])

  // Per-section counts from data/questions.json.
  const byLabel = Object.fromEntries(review.sections.map((s) => [s.label, s.total]))
  assert.equal(byLabel['English Communication'], 17)
  assert.equal(byLabel['Problem Solving'], 10)
  assert.equal(byLabel['AI-Assisted Debugging'], 3)
  assert.equal(byLabel['AI Feature Development'], 1)
  assert.equal(byLabel['Prompt Engineering'], 3)
  assert.equal(byLabel['Cognitive Assessment'], 14)
})

test('review model reflects provided answers', () => {
  const answers: Record<string, any> = {
    EL1: 'Some option text',
    SP1_audio: { size: 2048 },
    WRITING: 'one two three',
    PS3: '42',
    AF1_code: 'def foo(): return 1',
  }
  const review = buildReview(data, answers)

  const all = review.sections.flatMap((s) => s.groups.flatMap((g) => g.questions))
  const answered = all.filter((q) => q.answered)
  assert.equal(answered.length, 5)
  assert.equal(review.stats.answered, 5)

  const listening = review.sections[0].groups[0].questions
  assert.equal(listening.length, 8)
  assert.equal(listening.find((q) => q.key === 'EL1')!.answered, true)
  assert.equal(listening.find((q) => q.key === 'EL2')!.answered, false)

  const speaking = review.sections[0].groups[1].questions
  assert.equal(speaking.find((q) => q.key === 'SP1')!.answered, true)
  assert.equal(speaking.find((q) => q.key === 'SP2')!.answered, false)

  const writing = review.sections[0].groups[3].questions[0]
  assert.equal(writing.answered, true)
  assert.equal(writing.preview, '3 words')

  const problem = review.sections[1].groups[0].questions
  assert.equal(problem.length, 10)
  assert.equal(problem.find((q) => q.key === 'PS3')!.answered, true)

  const feature = review.sections[3].groups[0].questions[0]
  assert.equal(feature.answered, true)

  // Every question carries a jump target pointing at a real stage.
  for (const q of all) {
    assert.ok(q.target.stage >= 0 && q.target.stage <= 5, `stage for ${q.key}`)
    assert.ok(q.target.sub >= 0, `sub for ${q.key}`)
  }
})
