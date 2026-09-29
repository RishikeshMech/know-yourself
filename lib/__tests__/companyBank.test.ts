import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import { loadBank } from '../company/bank.ts'
import { SECTIONS } from '../company/sections.ts'
import type { BankQuestion, McqQuestion, WrittenQuestion, CodingQuestion } from '../company/types.ts'

const bank = loadBank()
const mcqs = bank.questions.filter((q): q is McqQuestion => q.kind === 'mcq')
const written = bank.questions.filter((q): q is WrittenQuestion => q.kind === 'written')
const coding = bank.questions.filter((q): q is CodingQuestion => q.kind === 'coding')
const report = JSON.parse(fs.readFileSync('data/company/bank-report.json', 'utf8'))

test('bank: every one of the 11 Ques sections is represented', () => {
  for (const s of SECTIONS) {
    const n = bank.questions.filter((q) => q.section === s.id).length
    assert.ok(n >= 30, `${s.id} (${s.title}) has only ${n} questions`)
  }
})

test('bank: every unique question from the Ques documents made it into the bank', () => {
  for (const [sec, stat] of Object.entries<any>(report.sections)) {
    const fromQues = bank.questions.filter((q) => q.section === sec && q.origin === 'ques').length
    assert.equal(fromQues, stat.unique, `${sec}: ${fromQues} ques-origin items vs ${stat.unique} unique source items`)
    assert.equal(stat.parsed, stat.claimed, `${sec}: parsed ${stat.parsed} of the ${stat.claimed} items the document claims`)
  }
})

test('bank: every source question number is traceable to exactly one bank item', () => {
  for (const [sec, stat] of Object.entries<any>(report.sections)) {
    const refs = bank.questions.filter((q) => q.section === sec && q.origin === 'ques').flatMap((q) => q.sourceRefs || [])
    assert.equal(refs.length, stat.parsed, `${sec}: ${refs.length} refs for ${stat.parsed} source items`)
    assert.equal(new Set(refs).size, refs.length, `${sec}: a source number maps to two bank items`)
  }
})

test('bank: ids are unique and stable-looking', () => {
  const ids = bank.questions.map((q) => q.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const q of bank.questions) assert.match(q.id, /^s\d{1,2}-(m|w)[0-9a-f]{10}$|^s3-c-[a-z0-9-]+$/, q.id)
})

test('bank: every MCQ has 4 distinct options and its key is one of them', () => {
  for (const q of mcqs) {
    assert.equal(q.options.length, 4, q.id)
    assert.equal(new Set(q.options.map((o) => o.trim().toLowerCase())).size, 4, `${q.id}: ${q.options.join(' | ')}`)
    assert.ok(q.options.includes(q.answer), `${q.id}: key not in options`)
  }
})

test('bank: generator artefacts ("(Variant 3)", "(Question 7)") never reach candidates', () => {
  for (const q of bank.questions) {
    const text = 'q' in q ? (q as any).q : (q as any).statement
    assert.doesNotMatch(String(text), /\((practice\s+)?variant\s+\d+\)|\(question\s+\d+\)/i, q.id)
  }
})

test('bank: no two MCQs share the same stem and code', () => {
  const seen = new Map<string, string>()
  for (const q of mcqs) {
    const key = `${q.section}|${q.q.toLowerCase()}|${(q.code || '').toLowerCase()}`
    assert.ok(!seen.has(key), `${q.id} duplicates ${seen.get(key)}`)
    seen.set(key, q.id)
  }
})

test('bank: the four wrong implied keys in the source (ratio #117-#120) are corrected', () => {
  const fixed = report.fixes.filter((f: any) => f.kind === 'wrong-implied-key')
  assert.equal(fixed.length, 4)
  for (const f of fixed) {
    const q = mcqs.find((m) => m.sourceRefs?.includes(f.refs[0]))!
    assert.equal(q.answer, f.correct)
    const m = q.q.match(/ratio (\d+):(\d+)\. If their total is (\d+)/)!
    const smaller = (Number(m[3]) * Math.min(Number(m[1]), Number(m[2]))) / (Number(m[1]) + Number(m[2]))
    assert.equal(Number(q.answer), smaller)
  }
})

test('bank: written prompts carry a usable rubric and sane word limits', () => {
  for (const q of written) {
    assert.ok(q.rubric.length >= 3, q.id)
    assert.ok(q.minWords >= 60 && q.maxWords > q.minWords, q.id)
    for (const p of q.rubric) {
      assert.ok(p.label && p.any.length > 0, q.id)
      for (const phrase of p.any) assert.equal(phrase, phrase.toLowerCase(), `${q.id}: ${phrase}`)
    }
  }
  // Every open-ended source prompt (plain + angle variant) is present.
  for (const sec of ['s4', 's5', 's6', 's7', 's8', 's9', 's10', 's11']) {
    assert.equal(written.filter((q) => q.section === sec && q.origin === 'ques').length, 30, sec)
  }
})

test('bank: coding problems are LeetCode medium/hard with starters, samples and stress tests', () => {
  assert.ok(coding.length >= 40, `only ${coding.length} coding problems`)
  assert.equal(coding.filter((q) => q.difficulty === 'easy').length, 0, 'coding rounds carry no easy warm-ups')
  assert.ok(coding.filter((q) => q.difficulty === 'medium').length >= 20, 'too few medium coding problems')
  assert.ok(coding.filter((q) => q.difficulty === 'hard').length >= 20, 'too few hard coding problems')
  for (const q of coding) {
    assert.ok(q.tests.length >= 6, q.id)
    assert.ok(q.tests.some((t) => t.stress), `${q.id}: needs a stress test`)
    assert.ok(q.tests.some((t) => t.sample), `${q.id}: needs a sample test`)
    assert.ok(q.starter.python.includes(`def ${q.fn.python}(`), q.id)
    assert.ok(q.starter.javascript.includes(`function ${q.fn.javascript}(`), q.id)
    assert.ok(q.examples.length >= 1 && q.statement.length > 40, q.id)
    assert.ok(q.constraints.some((c) => /Expected|O\(/.test(c)), `${q.id}: constraints must state the expected complexity`)
    assert.equal((q as any).solution, undefined, `${q.id}: reference solution leaked into the bank`)
    assert.equal((q as any).brute, undefined, `${q.id}: brute solution leaked into the bank`)
  }
})

test('bank: DSA leans hard — hard is the largest DSA difficulty band', () => {
  const dsa = (bank.questions as BankQuestion[]).filter((q) => q.section === 's3')
  const by = (d: string) => dsa.filter((q) => q.difficulty === d).length
  assert.ok(by('hard') > by('medium') && by('hard') > by('easy'), `E/M/H ${by('easy')}/${by('medium')}/${by('hard')}`)
  assert.ok(dsa.filter((q) => q.kind === 'mcq' && q.difficulty === 'hard').length >= 50)
})

test('bank: difficulty is calibrated — every section offers all three levels', () => {
  const bySection = new Map<string, Set<string>>()
  for (const q of bank.questions as BankQuestion[]) {
    if (!bySection.has(q.section)) bySection.set(q.section, new Set())
    bySection.get(q.section)!.add(q.difficulty)
  }
  for (const [sec, levels] of bySection) assert.equal(levels.size, 3, `${sec}: ${[...levels].join(',')}`)
})
