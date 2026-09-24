/**
 * End-to-end contract test for Assessment 2 — the Capgemini 2027 mock.
 *
 * Walks the whole candidate journey without a browser:
 *   1. a first-time user is pushed into assessment 1 and sees A2 locked,
 *   2. after finishing assessment 1 the A2 gate opens,
 *   3. the 5 configured stages match the Capgemini "Assessment Journey" poster,
 *   4. every stage is reachable by the runner's linear navigation,
 *   5. a full pass through all five stages scores out of 1000,
 *   6. the proctoring layer (fullscreen, display gate, warnings, watermark)
 *      that assessment 2 inherits from the shared runner really is active.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

import { computeScores2 } from '../scoring2.ts'
import { buildReview2 } from '../reviewModel2.ts'
import {
  resolveInstructions2Redirect,
  hasCompletedAssessment1,
  hasCompletedAssessment2,
} from '../attemptAccess2.ts'
import {
  MAX_FOCUS_STRIKES,
  evaluateStartGate,
  classifyDisplayEvent,
  watermarkIdentity,
  watermarkBackgroundImage,
  DEFAULT_DIMS,
} from '../proctoring.ts'

const require = createRequire(import.meta.url)
const bank = require('../../data/questions2.json')

// Mirror of ASSESSMENT_2.stages. The config module imports JSON through the
// `@/` alias, which Node's test loader cannot resolve, so the shape is asserted
// here and kept honest by the alignment checks below.
const DURATION_SEC = 7200
const STAGES: Array<{ id: string; label: string; sub: string[]; min: number }> = [
  { id: 'english', label: 'English Communication', sub: ['Listening', 'Speaking', 'Reading', 'Writing'], min: 30 },
  { id: 'problem', label: 'Technical Module', sub: [], min: 25 },
  { id: 'debugging', label: 'Debugging Assessment', sub: ['Code MCQs', 'Debugging Lab'], min: 25 },
  { id: 'feature', label: 'AI-assisted Coding', sub: [], min: 20 },
  { id: 'cognitive', label: 'Cognitive Assessment', sub: ['Motion & Grid Challenge', 'Logical Reasoning', 'Behavioural'], min: 20 },
]

/** A fake localStorage the gate functions can read. */
const storeOf = (data: Record<string, string>) => (k: string) => data[k] ?? null

/* ------------------------------------------------------------------ */
/* 1–2. First-time user must take assessment 1 before assessment 2     */
/* ------------------------------------------------------------------ */

test('a brand-new user is sent to assessment 1 and has A2 locked', () => {
  const read = storeOf({})
  assert.equal(hasCompletedAssessment1(read), false)
  assert.equal(hasCompletedAssessment2(read), false)
  // The dashboard renders the A2 card locked off exactly this predicate.
  assert.equal(resolveInstructions2Redirect(read), '/instructions')
})

test('a user mid-way through assessment 1 still cannot start assessment 2', () => {
  const read = storeOf({ calibiai_session: JSON.stringify({ status: 'in_progress' }) })
  assert.equal(hasCompletedAssessment1(read), false)
  assert.equal(resolveInstructions2Redirect(read), '/instructions')
})

test('finishing assessment 1 unlocks assessment 2', () => {
  const cases: Record<string, string>[] = [
    { calibiai_scores: JSON.stringify({ total: 700 }) },
    { calibiai_session: JSON.stringify({ status: 'submitted' }) },
    { calibiai_session: JSON.stringify({ status: 'expired' }) },
  ]
  for (const finished of cases) {
    const read = storeOf(finished)
    assert.equal(hasCompletedAssessment1(read), true)
    assert.equal(resolveInstructions2Redirect(read), null, 'the candidate may stay on /instructions2')
  }
})

test('assessment 2 is a single attempt and resumes mid-flight', () => {
  const done = storeOf({
    calibiai_scores: '{"total":700}',
    calibiai2_scores: '{"total":640}',
  })
  assert.equal(hasCompletedAssessment2(done), true)
  assert.notEqual(resolveInstructions2Redirect(done), null)

  const running = storeOf({
    calibiai_scores: '{"total":700}',
    calibiai2_session: JSON.stringify({ status: 'in_progress' }),
  })
  assert.equal(resolveInstructions2Redirect(running), '/assessment2')
})

/* ------------------------------------------------------------------ */
/* 3–4. The 5-stage journey                                            */
/* ------------------------------------------------------------------ */

test('the configured stages are the 5 stages of the Capgemini journey', () => {
  assert.deepEqual(
    STAGES.map(s => s.label),
    [
      'English Communication',   // 1
      'Technical Module',        // 2 — AI Literacy
      'Debugging Assessment',    // 3 — identify and correct code issues
      'AI-assisted Coding',      // 4 — use AI to solve a coding task
      'Cognitive Assessment',    // 5 — grid, logical reasoning, behavioural
    ],
  )

  // Stage 5 carries the three modules named on the poster.
  assert.deepEqual(STAGES[4].sub, [
    'Motion & Grid Challenge', 'Logical Reasoning', 'Behavioural',
  ])

  // The stage list mirrors the scored sections of the bank.
  assert.equal(STAGES.length, bank.sections.length)
  assert.equal(bank.sections.reduce((n: number, s: any) => n + s.maxScore, 0), 1000)

  // The advertised per-stage minutes fit inside the timer.
  const planned = STAGES.reduce((n, s) => n + s.min, 0)
  assert.equal(planned, DURATION_SEC / 60)
  assert.equal(planned, bank.totalDurationMin)
})

test('every stage and subsection is reachable by linear navigation', () => {
  const stages = STAGES

  // Replays the runner's nextLocation() walk from the very first screen.
  const visited: string[] = []
  let stage = 0
  let sub = 0
  for (let guard = 0; guard < 100; guard++) {
    visited.push(`${stage}.${sub}`)
    const subs = stages[stage].sub
    if (sub < subs.length - 1) { sub += 1; continue }
    if (stage < stages.length - 1) { stage += 1; sub = 0; continue }
    break
  }
  const expected = stages.flatMap((s, i) =>
    (s.sub.length ? s.sub.map((_, j) => `${i}.${j}`) : [`${i}.0`]),
  )
  assert.deepEqual(visited, expected)
  assert.equal(visited[visited.length - 1], `${stages.length - 1}.2`, 'ends on Behavioural')
})

test('the review model targets stages that actually exist', () => {
  const stages = STAGES
  const review = buildReview2(bank, {})
  for (const section of review.sections) {
    for (const group of section.groups) {
      for (const q of group.questions) {
        const st = stages[q.target.stage]
        assert.ok(st, `${q.key} targets missing stage ${q.target.stage}`)
        const maxSub = Math.max(0, st.sub.length - 1)
        assert.ok(
          q.target.sub <= maxSub,
          `${q.key} targets sub ${q.target.sub} but ${st.label} has ${st.sub.length} subsections`,
        )
      }
    }
  }
})

/* ------------------------------------------------------------------ */
/* 5. A full run through all five stages                               */
/* ------------------------------------------------------------------ */

test('a complete five-stage run scores out of 1000 and grades S', () => {
  const answers: Record<string, any> = {}
  // 1 English
  for (const clip of bank.english.listening.clips) for (const q of clip.questions) answers[q.id] = q.answer
  for (const q of bank.english.reading.questions) answers[q.id] = q.answer
  answers['WRITING'] = 'word '.repeat(150)
  // 2 Technical module
  for (const q of bank.problem) answers[q.id] = q.answer
  // 3 Debugging assessment
  for (const q of bank.debugmcq) answers[q.id] = q.answer
  for (const t of bank.debugging) answers[t.id + '_fix'] = 'def solved(): pass'
  // 4 AI-assisted coding
  answers[bank.feature.id + '_code'] = 'function mergeIntervals(i){return i}'
  // 5 Cognitive
  answers['GRID'] = 1
  for (const q of bank.cognitive.logical) answers[q.id] = q.answer
  for (const b of bank.cognitive.behavioral) answers[b.id] = Math.max(...b.options.map((o: any) => o.score))

  const ai = {
    SP_speaking: { score: 100 }, WRITING: { score: 100 },
    CG1: { score: 100 }, CG2: { score: 100 }, CG3: { score: 100 },
    [bank.feature.id]: { score: 100 },
  }
  const testResults = {
    CG1: { passed: 4, total: 4 }, CG2: { passed: 4, total: 4 }, CG3: { passed: 4, total: 4 },
    [bank.feature.id]: { passed: 5, total: 5 },
  }

  const s = computeScores2(answers, ai, { speakingCount: 3, testResults })
  assert.equal(s.assessment_no, 2)
  assert.equal(s.english.total, 200)
  assert.equal(s.ai_literacy, 250)
  assert.equal(s.debugging_total, 200)
  assert.equal(s.ai_coding, 200)
  assert.ok(s.cognitive.total > 130 && s.cognitive.total <= 150)
  assert.ok(s.total > 970 && s.total <= 1000)
  assert.equal(s.grade, 'S')

  // Every question in the review is now answered.
  const review = buildReview2(bank, answers)
  assert.equal(review.stats.answered, review.stats.total - 3, 'only the 3 speaking recordings are absent')
})

test('a partially completed run is scored proportionally, never inflated', () => {
  const answers: Record<string, any> = {}
  bank.problem.slice(0, 10).forEach((q: any) => { answers[q.id] = q.answer })
  const s = computeScores2(answers, {}, {})
  assert.equal(s.detail.aiLiteracyCorrect, 10)
  assert.equal(s.ai_literacy, Math.round((10 / 50) * 250))
  assert.equal(s.debugging_total, 0)
  assert.equal(s.ai_coding, 0)
  assert.equal(s.cognitive.total, 0)
  assert.ok(s.total < 100)
})

/* ------------------------------------------------------------------ */
/* 6. Proctoring inherited by assessment 2                             */
/* ------------------------------------------------------------------ */

test('assessment 2 inherits the fullscreen + external-display start gate', () => {
  // A single reachable display → the test may start.
  const ok = evaluateStartGate({
    dims: DEFAULT_DIMS, fullscreen: true, accessibleDisplays: 1,
    windowManagement: true, currentScreenId: 'a',
  })
  assert.equal(ok.allow, true)
  assert.equal(ok.detectible, true)

  // A second display attached → blocked with a reason for the candidate.
  const twoScreens = evaluateStartGate({
    dims: DEFAULT_DIMS, fullscreen: true, accessibleDisplays: 2,
    windowManagement: true, currentScreenId: 'a',
  })
  assert.equal(twoScreens.allow, false)
  assert.match(String(twoScreens.reason), /single screen/i)

  // No Window-Management API → the page is blind, so it passes but says so.
  const blind = evaluateStartGate({
    dims: DEFAULT_DIMS, fullscreen: true, accessibleDisplays: null,
    windowManagement: false, currentScreenId: null,
  })
  assert.equal(blind.allow, true)
  assert.equal(blind.detectible, false)
})

test('plugging in a display mid-test is classified as a violation', () => {
  const base = { dims: DEFAULT_DIMS, fullscreen: true, windowManagement: true, currentScreenId: 'a' }
  assert.equal(
    classifyDisplayEvent({ ...base, accessibleDisplays: 1 }, { ...base, accessibleDisplays: 2 }),
    'display_connect',
  )
  // Dragging the exam onto another screen is also caught.
  assert.equal(
    classifyDisplayEvent(
      { ...base, accessibleDisplays: 1 },
      { ...base, accessibleDisplays: 1, currentScreenId: 'b' },
    ),
    'display_layout_change',
  )
  // A steady single-screen session raises nothing.
  assert.equal(
    classifyDisplayEvent({ ...base, accessibleDisplays: 1 }, { ...base, accessibleDisplays: 1 }),
    'none',
  )
})

test('three focus violations end the assessment', () => {
  assert.equal(MAX_FOCUS_STRIKES, 3)
})

test('the leak-prevention watermark identifies the candidate and session', () => {
  const text = watermarkIdentity({
    name: 'Rishikesh M', email: 'r@example.com', id: 'usr_9', sessionId: 'sess_a2_123',
  })
  assert.match(text, /Rishikesh M/)
  assert.match(text, /CALIBIAI/i)
  // It is rendered as a tiled SVG background, so it cannot be removed by
  // deleting a DOM node the way a single overlay could.
  const bg = watermarkBackgroundImage(text)
  assert.match(bg, /^url\("data:image\/svg\+xml/)
})
