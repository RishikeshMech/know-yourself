import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

import { computeScores2 } from '../scoring2.ts'
import { buildReview2 } from '../reviewModel2.ts'

// Node's type-stripping test runner can't resolve the `@/` alias, so load the
// raw question data directly.
const require = createRequire(import.meta.url)
const bank = require('../../data/questions2.json')

/** Answer every MCQ in the assessment-2 bank correctly. */
function allCorrect(): Record<string, any> {
  const a: Record<string, any> = {}
  for (const clip of bank.english.listening.clips) {
    for (const q of clip.questions) a[q.id] = q.answer
  }
  for (const q of bank.english.reading.questions) a[q.id] = q.answer
  for (const q of bank.problem) a[q.id] = q.answer
  for (const q of bank.debugmcq) a[q.id] = q.answer
  return a
}

test('the assessment-2 bank has the sections and counts from the Capgemini papers', () => {
  const listening = bank.english.listening.clips.flatMap((c: any) => c.questions)
  assert.equal(listening.length, 10)
  assert.equal(bank.english.reading.questions.length, 10)
  assert.equal(bank.english.speaking.tasks.length, 3)
  assert.equal(bank.problem.length, 50)      // AI Literacy paper
  assert.equal(bank.debugmcq.length, 30)     // Section 2 debugging paper
  assert.equal(bank.debugging.length, 3)     // compiler lab tasks
})

test('every MCQ answer is one of its own options', () => {
  const groups: any[][] = [
    bank.english.listening.clips.flatMap((c: any) => c.questions),
    bank.english.reading.questions,
    bank.problem,
    bank.debugmcq,
  ]
  for (const group of groups) {
    for (const q of group) {
      assert.ok(q.options.includes(q.answer), `${q.id}: answer is not among its options`)
      assert.equal(new Set(q.options).size, q.options.length, `${q.id}: duplicate options`)
    }
  }
})

test('question ids are unique across the whole assessment-2 bank', () => {
  const ids = [
    ...bank.english.listening.clips.flatMap((c: any) => c.questions.map((q: any) => q.id)),
    ...bank.english.reading.questions.map((q: any) => q.id),
    ...bank.english.speaking.tasks.map((t: any) => t.id),
    ...bank.problem.map((q: any) => q.id),
    ...bank.debugmcq.map((q: any) => q.id),
    ...bank.debugging.map((t: any) => t.id),
  ]
  assert.equal(new Set(ids).size, ids.length)
})

test('an empty submission scores zero, not a participation bonus', () => {
  const s = computeScores2({}, {}, {})
  assert.equal(s.total, 0)
  assert.equal(s.english.total, 0)
  assert.equal(s.ai_literacy, 0)
  assert.equal(s.debug_mcq, 0)
  assert.equal(s.debug_lab, 0)
  assert.equal(s.grade, 'D')
  assert.equal(s.assessment_no, 2)
})

test('the section maxima add up to exactly 1000', () => {
  const answers = allCorrect()
  // Full marks on the subjective parts too (AI rubric at 100).
  const ai = {
    SP_speaking: { score: 100 },
    WRITING: { score: 100 },
    CG1: { score: 100 },
    CG2: { score: 100 },
    CG3: { score: 100 },
  }
  const testResults = {
    CG1: { passed: 4, total: 4 },
    CG2: { passed: 4, total: 4 },
    CG3: { passed: 4, total: 4 },
  }
  const s = computeScores2(answers, ai, { speakingCount: 3, testResults })
  assert.equal(s.english.total, 200)
  assert.equal(s.ai_literacy, 400)
  assert.equal(s.debug_mcq, 250)
  assert.equal(s.debug_lab, 150)
  assert.equal(s.total, 1000)
  assert.equal(s.grade, 'S')
})

test('MCQ sections scale linearly with the number of correct answers', () => {
  const answers: Record<string, any> = {}
  // Half of the AI Literacy paper right.
  bank.problem.slice(0, 25).forEach((q: any) => { answers[q.id] = q.answer })
  // A wrong answer must never earn marks.
  bank.problem.slice(25).forEach((q: any) => {
    answers[q.id] = q.options.find((o: string) => o !== q.answer)
  })
  const s = computeScores2(answers, {}, {})
  assert.equal(s.detail.aiLiteracyCorrect, 25)
  assert.equal(s.ai_literacy, 200)
  assert.equal(s.debug_mcq, 0)
})

test('the debugging lab weighs hidden tests above the AI rubric', () => {
  const testResults = { CG1: { passed: 4, total: 4 }, CG2: { passed: 0, total: 4 }, CG3: { passed: 2, total: 4 } }
  const ai = { CG1: { score: 50 }, CG2: { score: 50 }, CG3: { score: 50 } }
  const s = computeScores2({}, ai, { testResults })
  // 100*.6+50*.4 = 80 | 0*.6+50*.4 = 20 | 50*.6+50*.4 = 50  →  (80+20+50)/100*50
  assert.equal(s.detail.labPer.CG1, 80)
  assert.equal(s.detail.labPer.CG2, 20)
  assert.equal(s.detail.labPer.CG3, 50)
  assert.equal(s.debug_lab, 75)
})

test('a lab task with no submission and no run scores zero', () => {
  const s = computeScores2({}, {}, { testResults: {} })
  assert.equal(s.detail.labPer.CG1, 0)
  assert.equal(s.debug_lab, 0)
})

test('the review model covers every assessment-2 question', () => {
  const review = buildReview2(bank, {})
  assert.deepEqual(review.sections.map(s => s.label), [
    'English Communication',
    'AI Literacy',
    'Debugging — C/C++/Java',
    'Debugging Lab',
  ])
  // 10 listening + 3 speaking + 10 reading + 1 writing + 50 + 30 + 3
  assert.equal(review.stats.total, 107)
  assert.equal(review.stats.answered, 0)
})

test('the review model reflects provided answers', () => {
  const review = buildReview2(bank, {
    EL1: 'Some option text',
    SP1_audio: { size: 2048 },
    WRITING: 'one two three',
    AL1: 'x',
    DM1: 'y',
    CG1_fix: 'def first_repeated(s): return ""',
  })
  assert.equal(review.stats.answered, 6)
  const [english, literacy, mcq, lab] = review.sections
  assert.equal(english.answered, 3)
  assert.equal(literacy.answered, 1)
  assert.equal(mcq.answered, 1)
  assert.equal(lab.answered, 1)
})
