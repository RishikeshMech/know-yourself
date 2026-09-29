import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { setDbDirectory, resetDbCache, flushDB, getCompanyAttempt } from '../db.ts'
import { loadBank } from '../company/bank.ts'
import { heuristicGrade } from '../company/grading.ts'
import {
  SUBMIT_GRACE_MS, attemptIdFor, clientView, listSummaries, mergeProctoring, saveProgress,
  sanitizeAnswers, seedFor, startAttempt, submitAttempt,
} from '../company/attempts.ts'
import type { McqQuestion } from '../company/types.ts'

const bank = loadBank()
// Deterministic, subprocess-free scoring for these tests.
const score = {
  gradeWritten: async (q: any, a: string) => heuristicGrade(q, a),
  runCode: async (q: any, code: string) => ({ passed: code.includes('PASS') ? q.tests.length : 0, total: q.tests.length, results: [], engine: 'python' as const }),
}

function freshStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'calibiai-company-'))
  setDbDirectory(dir)
  return dir
}

function clock(start = Date.parse('2026-09-28T10:00:00Z')) {
  let t = start
  return { now: () => new Date(t), advance: (ms: number) => { t += ms } }
}

test('attempts: first start creates an attempt with a server-side deadline', async () => {
  freshStore()
  const c = clock()
  const res = await startAttempt('u_alice', 'tcs', { now: c.now, bank, score })
  assert.equal(res.outcome, 'created')
  assert.equal(res.attempt.status, 'in_progress')
  assert.equal(res.attempt.id, attemptIdFor('u_alice', 'tcs'))
  assert.equal(new Date(res.attempt.expires_at).getTime() - c.now().getTime(), res.attempt.duration_sec * 1000)
  assert.equal(res.attempt.duration_sec, 100 * 60)
})

test('attempts: starting again resumes the SAME paper and timer (no second attempt)', async () => {
  freshStore()
  const c = clock()
  const first = await startAttempt('u_bob', 'infosys', { now: c.now, bank, score })
  c.advance(5 * 60_000)
  const again = await startAttempt('u_bob', 'infosys', { now: c.now, bank, score })
  assert.equal(again.outcome, 'resumed')
  assert.deepEqual(again.attempt.paper, first.attempt.paper)
  assert.equal(again.attempt.expires_at, first.attempt.expires_at)
})

test('attempts: after submission the assessment can never be started again', async () => {
  freshStore()
  const c = clock()
  await startAttempt('u_carol', 'wipro', { now: c.now, bank, score })
  const sub = await submitAttempt('u_carol', 'wipro', { answers: {} }, { now: c.now, bank, score })
  assert.ok(sub.ok && !sub.alreadySubmitted)
  const again = await startAttempt('u_carol', 'wipro', { now: c.now, bank, score })
  assert.equal(again.outcome, 'completed')
  // …and survives a process restart (durable store).
  resetDbCache()
  const afterRestart = await startAttempt('u_carol', 'wipro', { now: c.now, bank, score })
  assert.equal(afterRestart.outcome, 'completed')
})

test('attempts: submitting twice returns the first result (idempotent)', async () => {
  freshStore()
  const c = clock()
  await startAttempt('u_dan', 'google', { now: c.now, bank, score })
  const one = await submitAttempt('u_dan', 'google', { answers: {} }, { now: c.now, bank, score })
  const two = await submitAttempt('u_dan', 'google', { answers: { anything: 'x' } }, { now: c.now, bank, score })
  assert.ok(one.ok && two.ok)
  if (one.ok && two.ok) {
    assert.equal(two.alreadySubmitted, true)
    assert.equal(two.attempt.submitted_at, one.attempt.submitted_at)
    assert.equal(two.attempt.score, one.attempt.score)
  }
})

test('attempts: different companies and different students are independent', async () => {
  freshStore()
  const c = clock()
  await startAttempt('u_erin', 'tcs', { now: c.now, bank, score })
  await submitAttempt('u_erin', 'tcs', { answers: {} }, { now: c.now, bank, score })
  assert.equal((await startAttempt('u_erin', 'accenture', { now: c.now, bank, score })).outcome, 'created')
  assert.equal((await startAttempt('u_frank', 'tcs', { now: c.now, bank, score })).outcome, 'created')
})

test('attempts: papers differ between students for the same company', () => {
  assert.notEqual(seedFor('u_1', 'tcs'), seedFor('u_2', 'tcs'))
  assert.equal(seedFor('u_1', 'tcs'), seedFor('u_1', 'tcs'))
})

test('attempts: correct MCQ answers are scored on the server', async () => {
  freshStore()
  const c = clock()
  const { attempt } = await startAttempt('u_gina', 'tcs', { now: c.now, bank, score })
  const answers: Record<string, string> = {}
  let mcqCount = 0
  for (const r of attempt.paper.rounds) for (const it of r.items) {
    const q = bank.byId.get(it.id)!
    if (q.kind === 'mcq') { answers[q.id] = (q as McqQuestion).answer; mcqCount++ }
  }
  const res = await submitAttempt('u_gina', 'tcs', { answers }, { now: c.now, bank, score })
  assert.ok(res.ok)
  if (!res.ok) return
  const r = res.attempt.result!
  const mcqItems = r.items.filter((i) => i.kind === 'mcq')
  assert.equal(mcqItems.length, mcqCount)
  assert.ok(mcqItems.every((i) => i.correct && i.earned === i.marks))
  const foundation = r.rounds.find((x) => x.id === 'foundation')!
  assert.equal(foundation.percent, 100)
  assert.equal(foundation.cleared, true)
})

test('attempts: wrong or forged answers earn nothing', async () => {
  freshStore()
  const c = clock()
  const { attempt } = await startAttempt('u_hank', 'tcs', { now: c.now, bank, score })
  const answers: Record<string, string> = {}
  for (const r of attempt.paper.rounds) for (const it of r.items) {
    const q = bank.byId.get(it.id)!
    if (q.kind === 'mcq') answers[q.id] = (q as McqQuestion).options.find((o) => o !== (q as McqQuestion).answer)!
  }
  answers['s1-mdeadbeef00'] = 'not in paper'
  const res = await submitAttempt('u_hank', 'tcs', { answers }, { now: c.now, bank, score })
  assert.ok(res.ok)
  if (res.ok) {
    assert.equal(res.attempt.result!.rounds.find((x) => x.id === 'foundation')!.percent, 0)
    assert.ok(!('s1-mdeadbeef00' in res.attempt.answers))
  }
})

test('attempts: autosave stores answers and is refused after the deadline', async () => {
  freshStore()
  const c = clock()
  const { attempt } = await startAttempt('u_ivy', 'cognizant', { now: c.now, bank, score })
  const mcq = attempt.paper.rounds[0].items[0]
  const saved = await saveProgress('u_ivy', 'cognizant', { [mcq.id]: mcq.options![1] }, { strikes: 1 }, { now: c.now, bank, score })
  assert.ok(saved.ok)
  assert.equal(getCompanyAttempt('u_ivy', 'cognizant')!.answers[mcq.id], mcq.options![1])
  c.advance(attempt.duration_sec * 1000 + 61_000)
  const late = await saveProgress('u_ivy', 'cognizant', {}, {}, { now: c.now, bank, score })
  assert.equal(late.ok, false)
})

test('attempts: an abandoned attempt is finalised with its last autosave', async () => {
  freshStore()
  const c = clock()
  const { attempt } = await startAttempt('u_jay', 'tcs', { now: c.now, bank, score })
  const it = attempt.paper.rounds[0].items[0]
  const q = bank.byId.get(it.id) as McqQuestion
  await saveProgress('u_jay', 'tcs', { [q.id]: q.answer }, {}, { now: c.now, bank, score })
  c.advance(attempt.duration_sec * 1000 + SUBMIT_GRACE_MS + 1)
  const list = await listSummaries('u_jay', { now: c.now, bank, score })
  assert.equal(list.length, 1)
  assert.equal(list[0].status, 'expired')
  assert.equal(list[0].auto_submitted, true)
  const stored = getCompanyAttempt('u_jay', 'tcs')!
  assert.equal(stored.result!.items.find((x) => x.id === q.id)!.correct, true)
  assert.equal((await startAttempt('u_jay', 'tcs', { now: c.now, bank, score })).outcome, 'completed')
})

test('attempts: a late final submission is ignored beyond the grace window', async () => {
  freshStore()
  const c = clock()
  const { attempt } = await startAttempt('u_kim', 'tcs', { now: c.now, bank, score })
  const it = attempt.paper.rounds[0].items[0]
  const q = bank.byId.get(it.id) as McqQuestion
  c.advance(attempt.duration_sec * 1000 + SUBMIT_GRACE_MS + 5_000)
  const res = await submitAttempt('u_kim', 'tcs', { answers: { [q.id]: q.answer } }, { now: c.now, bank, score })
  assert.ok(res.ok)
  if (res.ok) {
    assert.equal(res.attempt.status, 'expired')
    assert.equal(res.attempt.answers[q.id], undefined)
  }
})

test('attempts: coding answers are re-run on the server at submission', async () => {
  freshStore()
  const c = clock()
  const { attempt } = await startAttempt('u_lee', 'infosys', { now: c.now, bank, score })
  const coding = attempt.paper.rounds.flatMap((r) => r.items).filter((i) => bank.byId.get(i.id)!.kind === 'coding')
  assert.equal(coding.length, 2)
  const res = await submitAttempt('u_lee', 'infosys', {
    answers: { [coding[0].id]: { lang: 'python', code: '# PASS' }, [coding[1].id]: { lang: 'javascript', code: '// wrong' } },
  }, { now: c.now, bank, score })
  assert.ok(res.ok)
  if (res.ok) {
    const round = res.attempt.result!.rounds.find((r) => r.id === 'coding')!
    assert.equal(round.percent, 50)
  }
})

test('attempts: the client view hides keys and tests', async () => {
  freshStore()
  const c = clock()
  const { attempt } = await startAttempt('u_max', 'amazon', { now: c.now, bank, score })
  const view = clientView(attempt, { now: c.now, bank })
  const json = JSON.stringify(view)
  assert.doesNotMatch(json, /"answer"|"tests"|"rubric"|"question_seed"/)
  assert.equal(view.attempt.id, attempt.id)
  assert.equal(view.server_now, c.now().toISOString())
})

test('sanitizeAnswers keeps only well-formed answers for paper items', async () => {
  freshStore()
  const c = clock()
  const { attempt } = await startAttempt('u_ned', 'swiggy', { now: c.now, bank, score })
  const items = attempt.paper.rounds.flatMap((r) => r.items)
  const mcq = items.find((i) => bank.byId.get(i.id)!.kind === 'mcq')!
  const code = items.find((i) => bank.byId.get(i.id)!.kind === 'coding')!
  const text = items.find((i) => bank.byId.get(i.id)!.kind === 'written')!
  const clean = sanitizeAnswers(attempt.paper, {
    [mcq.id]: 'definitely not an option',
    [code.id]: { lang: 'rust', code: 'fn main() {}' },
    [text.id]: 'x'.repeat(50_000),
    foreign: 'nope',
  }, bank)
  assert.equal(clean[mcq.id], undefined)
  assert.deepEqual(clean[code.id], { lang: 'python', code: 'fn main() {}' })
  assert.equal(String(clean[text.id]).length, 12_000)
  assert.equal(clean.foreign, undefined)
})

test('mergeProctoring is monotonic, bounded and ignores malformed events', () => {
  const a = mergeProctoring(undefined, { strikes: 2, camera: true, events: [{ type: 'tab_switch', at: '2026-09-28T10:00:00Z' }, { type: '', at: 'x' }] })
  assert.equal(a.strikes, 2)
  assert.equal(a.events.length, 1)
  const b = mergeProctoring(a, { strikes: 1, events: [{ type: 'tab_switch', at: '2026-09-28T10:00:00Z' }] })
  assert.equal(b.strikes, 2, 'strikes never decrease')
  assert.equal(b.events.length, 1, 'duplicate events are dropped')
  assert.equal(b.camera, true)
  const many = mergeProctoring(b, { events: Array.from({ length: 500 }, (_, i) => ({ type: 'blur', at: new Date(Date.UTC(2026, 8, 28, 10, 0, i)).toISOString() })) })
  assert.ok(many.events.length <= 120)
})

test('attempts: the local store holds exactly one row per student and company', async () => {
  const dir = freshStore()
  const c = clock()
  await Promise.all([
    startAttempt('u_oz', 'tcs', { now: c.now, bank, score }),
    startAttempt('u_oz', 'tcs', { now: c.now, bank, score }),
    startAttempt('u_oz', 'tcs', { now: c.now, bank, score }),
  ])
  await flushDB()
  const rows = JSON.parse(fs.readFileSync(path.join(dir, 'calibiai_db.runtime.json'), 'utf8')).company_attempts
  assert.equal(rows.filter((r: any) => r.student_id === 'u_oz' && r.company === 'tcs').length, 1)
})
