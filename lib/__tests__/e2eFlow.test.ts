/**
 * End-to-end flow checks for BOTH assessments.
 *
 * These walk the real question banks the way a candidate would: a perfect
 * paper, an empty paper and a half paper, and assert that the score that comes
 * out the other end is bounded, proportional and consistent with the stage
 * maxima shown in the UI. They also assert bank integrity (unique answer keys,
 * every stated answer present in the options) because answers are stored by
 * question id, so a duplicate id would silently overwrite another answer.
 */
import { test } from 'node:test'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import bank1 from '../../data/questions.json' with { type: 'json' }
import bank2 from '../../data/questions2.json' with { type: 'json' }
import { computeScores } from '../scoring.ts'
import { computeScores2 } from '../scoring2.ts'
import { buildReview } from '../reviewModel.ts'
import { buildReview2 } from '../reviewModel2.ts'

const b1: any = bank1
const b2: any = bank2

/** Every MCQ in a bank, wherever it lives. */
function mcqs(b: any) {
  const out: any[] = []
  b.english.listening.clips.forEach((c: any) => out.push(...c.questions))
  out.push(...b.english.reading.questions)
  if (b.problem) out.push(...b.problem)
  if (b.debugmcq) out.push(...b.debugmcq)
  if (b.cognitive?.logical) out.push(...b.cognitive.logical)
  return out
}

/** Non-MCQ answer keys (free text, recordings, sliders). */
function otherIds(b: any) {
  return [
    ...b.english.speaking.tasks.map((t: any) => t.id),
    ...(b.debugging || []).map((t: any) => t.id),
    ...(b.cognitive?.behavioral || []).map((t: any) => t.id),
    b.feature?.id,
  ].filter(Boolean)
}

for (const [name, b] of [['assessment 1', b1], ['assessment 2', b2]] as const) {
  test(`${name}: the bank has unique answer keys and valid options`, () => {
    const qs = mcqs(b)
    const ids = qs.map((q) => q.id).concat(otherIds(b))
    assert.equal(new Set(ids).size, ids.length, 'duplicate question ids would overwrite answers')
    for (const q of qs) {
      assert.ok(Array.isArray(q.options) && q.options.length >= 2, `${q.id} needs options`)
      assert.equal(new Set(q.options).size, q.options.length, `${q.id} has duplicate options`)
      assert.ok(q.options.includes(q.answer), `${q.id} answer is not one of its options`)
    }
  })
}

/** A fully correct MCQ paper. */
const perfect = (b: any) => Object.fromEntries(mcqs(b).map((q) => [q.id, q.answer]))

test('assessment 1: an empty paper scores zero and a perfect paper reaches the ceiling', () => {
  const empty = computeScores({}, {}, {})
  assert.equal(empty.total, 0)
  assert.equal(empty.english.total, 0)

  const a: any = perfect(b1)
  a.WRITING = 'word '.repeat(220)
  a.GRID = 1
  b1.english.speaking.tasks.forEach((t: any) => { a[t.id + '_audio'] = { size: 4096 } })
  b1.debugging.forEach((t: any) => { a[t.id + '_fix'] = 'x'.repeat(200) })
  b1.cognitive.behavioral.forEach((q: any) => { a[q.id] = 100 })
  const s = computeScores(a, {}, {})
  assert.ok(s.total > 0 && s.total <= 1000, `total ${s.total} out of range`)
  assert.equal(s.english.listening, 50)
  assert.equal(s.english.reading, 50)
  assert.ok(s.cognitive.total <= s.cognitive.max)
})

test('assessment 2: empty paper is zero, perfect paper is the full 1000', () => {
  const empty = computeScores2({}, {}, { bank: b2 })
  assert.equal(empty.total, 0)
  assert.equal(empty.grade, 'D')

  const a: any = perfect(b2)
  a.WRITING = 'word '.repeat(150)
  a.GRID = 1
  b2.english.speaking.tasks.forEach((t: any) => { a[t.id + '_audio'] = { size: 4096 } })
  b2.debugging.forEach((t: any) => { a[t.id + '_fix'] = 'fixed code here'.repeat(10) })
  b2.cognitive.behavioral.forEach((q: any) => { a[q.id] = 100 })
  a[b2.feature.id + '_code'] = 'x'.repeat(400)

  const ai: any = { SP_speaking: { score: 100 }, WRITING: { score: 100 }, [b2.feature.id]: { score: 100 } }
  b2.debugging.forEach((t: any) => { ai[t.id] = { score: 100 } })
  const testResults: any = { [b2.feature.id]: { passed: 5, total: 5 } }
  b2.debugging.forEach((t: any) => { testResults[t.id] = { passed: 4, total: 4 } })

  const s = computeScores2(a, ai, { bank: b2, testResults })
  assert.equal(s.english.listening, 50)
  assert.equal(s.english.reading, 50)
  assert.equal(s.english.total, 200, 'English is out of 200')
  assert.equal(s.ai_literacy, 250, 'Technical Module is out of 250')
  assert.equal(s.debugging_total, 200, 'Debugging is out of 200')
  assert.equal(s.ai_coding, 200, 'AI-assisted Coding is out of 200')
  assert.equal(s.cognitive.total, 150, 'Cognitive is out of 150')
  assert.equal(s.total, 1000)
  assert.equal(s.grade, 'S')
})

test('assessment 2: scores scale proportionally with a half-correct paper', () => {
  const half: any = {}
  mcqs(b2).forEach((q: any, i: number) => { if (i % 2 === 0) half[q.id] = q.answer })
  const s = computeScores2(half, {}, { bank: b2 })
  // Technical Module: 25 of 50 correct -> 125 of 250.
  assert.equal(s.detail.aiLiteracyTotal, 50)
  assert.equal(s.detail.aiLiteracyCorrect, 25)
  assert.equal(s.ai_literacy, 125)
  // Listening now spans 3 clips / 30 questions and is still out of 50.
  assert.equal(s.detail.listeningTotal, 30)
  assert.ok(s.english.listening > 20 && s.english.listening < 30)
  assert.ok(s.total > 0 && s.total < 1000)
})

test('assessment 2: a wrong-answer paper scores zero on every MCQ stage', () => {
  const wrong: any = {}
  mcqs(b2).forEach((q: any) => { wrong[q.id] = q.options.find((o: string) => o !== q.answer) })
  const s = computeScores2(wrong, {}, { bank: b2 })
  assert.equal(s.english.listening, 0)
  assert.equal(s.english.reading, 0)
  assert.equal(s.ai_literacy, 0)
  assert.equal(s.debug_mcq, 0)
  assert.equal(s.cognitive.logical, 0)
})

test('the review model covers every answerable item in both banks', () => {
  for (const [name, b, build] of [
    ['assessment 1', b1, buildReview],
    ['assessment 2', b2, buildReview2],
  ] as const) {
    const r: any = build(b as any, {})
    const keys = new Set<string>(
      r.sections.flatMap((s: any) => s.groups.flatMap((g: any) => g.questions.map((q: any) => q.key))),
    )
    for (const q of mcqs(b)) {
      assert.ok(keys.has(q.id), `${name}: ${q.id} missing from the review screen`)
    }
    assert.equal(r.stats.answered, 0, `${name}: an untouched paper must review as 0 answered`)
    assert.ok(r.stats.total >= keys.size - 1)
  }
})

test('assessment 2 review marks answered questions, including the new listening clips', () => {
  const a: any = { EL1: 'x', EL15: 'y', EL25: 'z', AL1: 'q' }
  const r: any = buildReview2(b2, a)
  const q = (k: string) =>
    r.sections.flatMap((s: any) => s.groups.flatMap((g: any) => g.questions)).find((x: any) => x.key === k)
  assert.equal(q('EL15').answered, true, 'clip 2 answers must be tracked')
  assert.equal(q('EL25').answered, true, 'clip 3 answers must be tracked')
  assert.equal(q('EL2').answered, false)
  assert.equal(r.stats.answered, 4)
})

test('every stage declared by a config is rendered and tracked by the runner', () => {
  const runner = fs.readFileSync('components/AssessmentRunner.tsx', 'utf8')
  const stageIds = ['assessment1Config', 'assessment2Config'].flatMap((f) => {
    const src = fs.readFileSync(`lib/${f}.ts`, 'utf8')
    return [...src.matchAll(/\{\s*id:\s*'([a-z]+)'/g)].map((m) => m[1])
  })
  assert.ok(stageIds.includes('problem') && stageIds.includes('debugging'))
  for (const id of new Set(stageIds)) {
    // A stage with no render branch shows an empty tab (the Technical Module bug).
    assert.match(runner, new RegExp(`case '${id}'`), `renderStage() has no branch for the '${id}' stage`)
    assert.match(runner, new RegExp(`stageId === '${id}'`), `getSubProgress() does not track the '${id}' stage`)
  }
})

test('each flat-MCQ stage reads its own bank key, so tabs cannot share questions', () => {
  const runner = fs.readFileSync('components/AssessmentRunner.tsx', 'utf8')
  assert.match(runner, /stageId === 'problem' \? 'problem' : 'debugmcq'/)
  // The Technical Module and the Debugging code paper must be disjoint sets.
  const tech = new Set(b2.problem.map((q: any) => q.id))
  assert.ok(b2.debugmcq.every((q: any) => !tech.has(q.id)))
  assert.equal(b2.problem.length, 50)
  assert.equal(b2.debugmcq.length, 30)
  assert.ok(b2.problem.every((q: any) => q.level === 'hard'), 'the Technical Module paper is hard-level')
})

test('assessment 2 listening has three playable clips wired to real audio files', () => {
  const clips = b2.english.listening.clips
  assert.equal(clips.length, 3)
  for (const c of clips) {
    assert.equal(c.questions.length, 10)
    const file = `public${c.audio}`
    assert.ok(fs.existsSync(file), `${c.audio} is missing from public/audio`)
    assert.ok(fs.statSync(file).size > 10_000, `${c.audio} looks empty`)
  }
})
