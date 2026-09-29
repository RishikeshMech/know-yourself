import test from 'node:test'
import assert from 'node:assert/strict'

import { loadBank } from '../company/bank.ts'
import { gradeWritten, guardAnswer, heuristicGrade } from '../company/grading.ts'
import { scoreAttempt, toPublicResult, verdictFor } from '../company/scoring.ts'
import { buildPaper } from '../company/paper.ts'
import type { WrittenQuestion } from '../company/types.ts'

const bank = loadBank()
const processThread = bank.questions.find(
  (q): q is WrittenQuestion => q.kind === 'written' && q.base.startsWith('Explain the difference between a process and a thread') && !q.angle,
)!

const STRONG = `A process is an independent program in execution with its own address space, while a thread is a
lightweight unit of execution inside a process. Threads share memory and resources such as the heap and open files,
so they communicate through shared variables, whereas processes need IPC mechanisms like pipes, sockets or message
passing. Creating a thread and context switching between threads is cheaper because there is less overhead.
However, sharing memory introduces race conditions, so threads need synchronization with a mutex, lock or semaphore.
For example, a browser runs each tab as a separate process for fault isolation: if one tab crashes it does not bring
down the whole process of another tab, while a web server may use a pool of threads to handle requests efficiently.`

test('grading: blank, tiny, gibberish, repetitive and copied answers score 0', () => {
  for (const bad of ['', '   ', 'process thread memory', '@@@ ### $$$ %%% '.repeat(20), 'thread '.repeat(80), processThread.q]) {
    const g = heuristicGrade(processThread, bad)
    assert.equal(g.score, 0, JSON.stringify(bad.slice(0, 30)))
    assert.ok(guardAnswer(processThread, bad))
  }
})

test('grading: a strong, structured answer scores well and lists its strengths', () => {
  const g = heuristicGrade(processThread, STRONG)
  assert.ok(g.score >= 80, `score ${g.score}`)
  assert.ok(g.strengths.length >= 2)
  assert.equal(g.engine, 'heuristic')
})

test('grading: a fluent but off-topic answer cannot score on presentation alone', () => {
  // Prompts from other sections (sibling OS prompts such as "race conditions"
  // legitimately overlap with an answer about processes and threads).
  const offTopic = bank.questions.filter((q): q is WrittenQuestion =>
    q.kind === 'written' && !q.angle && q.section !== 's4')
  assert.ok(offTopic.length >= 60)
  for (const q of offTopic) {
    const g = heuristicGrade(q, STRONG)
    assert.ok(g.score <= 45, `${q.q.slice(0, 50)} scored ${g.score} for an answer about processes and threads`)
  }
})

test('grading: a keyword list without explanation is capped', () => {
  const stuffed = 'address space shared memory context switch ipc pipe crash isolation mutex lock semaphore race condition ' +
    'lightweight overhead separate memory shared variable message passing socket fault whole process synchronization'
  assert.ok(heuristicGrade(processThread, stuffed).score <= 40)
})

test('grading: a relevant but partial answer lands in the middle', () => {
  const partial = 'A process has its own separate memory. A thread runs inside a process and threads share memory with each other. ' +
    'Because of that, threads are lighter to create than processes and switching between them has less overhead. ' +
    'Processes are more isolated from each other, which makes them safer but heavier to run on the operating system.'
  const g = heuristicGrade(processThread, partial)
  assert.ok(g.score > 25 && g.score < 80, `score ${g.score}`)
  assert.ok(g.improvements.length > 0)
})

test('grading: without an LLM key gradeWritten falls back to the heuristic engine', async () => {
  const saved = { a: process.env.CALIBIAI_API_KEY, b: process.env.DEEPSEEK_API_KEY }
  delete process.env.CALIBIAI_API_KEY
  delete process.env.DEEPSEEK_API_KEY
  try {
    const g = await gradeWritten(processThread, STRONG)
    assert.equal(g.engine, 'heuristic')
    assert.equal(g.score, heuristicGrade(processThread, STRONG).score)
  } finally {
    if (saved.a !== undefined) process.env.CALIBIAI_API_KEY = saved.a
    if (saved.b !== undefined) process.env.DEEPSEEK_API_KEY = saved.b
  }
})

test('verdicts: bands and sectional cut-offs', () => {
  assert.equal(verdictFor(80, true), 'ready')
  assert.equal(verdictFor(80, false), 'almost')
  assert.equal(verdictFor(62, true), 'almost')
  assert.equal(verdictFor(50, true), 'borderline')
  assert.equal(verdictFor(20, true), 'not-yet')
})

test('scoring: an empty submission scores 0 and weights sum correctly', async () => {
  const paper = buildPaper('product', 1, bank)
  const r = await scoreAttempt(paper, {}, bank, {
    gradeWritten: async (q, a) => heuristicGrade(q, a),
    runCode: async (q) => ({ passed: 0, total: q.tests.length, results: [], engine: 'python' }),
  })
  assert.equal(r.score, 0)
  assert.equal(r.answered, 0)
  assert.equal(r.verdict, 'not-yet')
  assert.equal(r.rounds.reduce((s, x) => s + x.weight, 0), 100)
})

test('scoring: public results never expose MCQ correctness', async () => {
  const paper = buildPaper('tcs', 2, bank)
  const r = await scoreAttempt(paper, {}, bank, {
    gradeWritten: async (q, a) => heuristicGrade(q, a),
    runCode: async (q) => ({ passed: 0, total: q.tests.length, results: [], engine: 'python' }),
  })
  const pub = toPublicResult(r)
  assert.ok(pub.items.every((i) => i.kind !== 'mcq'))
  assert.ok(pub.topics.length > 5)
  assert.doesNotMatch(JSON.stringify(pub), /"correct"/)
})

test('scoring: public results summarise performance by area with readable labels', async () => {
  const paper = buildPaper('tcs', 4, bank)
  const answers: Record<string, string> = {}
  for (const r of paper.rounds) for (const it of r.items) {
    const q = bank.byId.get(it.id)!
    if (q.kind === 'mcq' && q.area === 'quant') answers[q.id] = (q as any).answer
  }
  const r = await scoreAttempt(paper, answers, bank, {
    gradeWritten: async (q, a) => heuristicGrade(q, a),
    runCode: async (q) => ({ passed: 0, total: q.tests.length, results: [], engine: 'python' }),
  })
  const pub = toPublicResult(r)
  const quant = pub.areas.find((a) => a.section === 's1' && a.area === 'quant')!
  assert.equal(quant.label, 'Quantitative Aptitude')
  assert.equal(quant.percent, 100)
  const verbal = pub.areas.find((a) => a.section === 's1' && a.area === 'verbal')!
  assert.equal(verbal.percent, 0)
  assert.ok(pub.areas.some((a) => a.area === 'coding'))
})
