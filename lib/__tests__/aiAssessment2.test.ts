/**
 * The AI surfaces must be as useful for Assessment 2 (Capgemini 2027 mock) as
 * they already are for Assessment 1 — both the in-exam assistant (CG1..CG4) and
 * the grader's heuristic fallback, which is what candidates get whenever no
 * model key is configured or the model is down.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { chatWithAssistant } from '../aiAssistant.ts'
import { evaluateDebugging, evaluateFeature, evaluateWriting } from '../ai.ts'

const ask = (taskId: string, content: string, currentCode = '') =>
  chatWithAssistant({ taskId, currentCode, messages: [{ role: 'user', content }] })

/* ---------------- in-exam assistant knows the A2 tasks ---------------- */

test('the assistant explains the real root cause of every A2 lab task', async () => {
  const cg1 = await ask('CG1', 'explain the root cause')
  assert.match(cg1.reply, /exactly TWICE|exactly twice/i)
  assert.doesNotMatch(cg1.reply, /Technical Coding Task/, 'must not fall back to the generic stub')

  const cg2 = await ask('CG2', 'explain the root cause')
  assert.match(cg2.reply, /normalis|modulo|k % len/i)

  const cg3 = await ask('CG3', 'explain the root cause')
  assert.match(cg3.reply, /first|leftmost/i)

  const cg4 = await ask('CG4', 'explain the root cause')
  assert.match(cg4.reply, /sort|touch|mutat/i)
})

test('the assistant offers a working solution for each A2 task', async () => {
  for (const [taskId, needle] of [
    ['CG1', 'first_repeated'],
    ['CG2', 'def rotate'],
    ['CG3', 'function firstPos'],
    ['CG4', 'function mergeIntervals'],
  ] as const) {
    const r = await ask(taskId, 'show me the solution')
    assert.match(r.reply, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${taskId} snippet`)
  }
})

test('the assistant lists the edge cases the hidden tests actually check', async () => {
  const cg4 = await ask('CG4', 'what edge cases are tested?')
  assert.match(cg4.reply, /touch/i)
  assert.match(cg4.reply, /mutat/i, 'the no-mutation test must be called out')

  const cg2 = await ask('CG2', 'what edge cases are tested?')
  assert.match(cg2.reply, /multiple of the length|no-op/i)
})

test('the assistant reviews A2 code and flags the classic mistakes', async () => {
  // Mutating sort + "<" comparison are the two traps in CG4.
  const bad = await ask(
    'CG4', 'review my code',
    'function mergeIntervals(i){i.sort((a,b)=>a[0]-b[0]);const o=[];for(const x of i){const l=o[o.length-1];if(l&&x[0]<l[1])l[1]=Math.max(l[1],x[1]);else o.push(x)}return o}',
  )
  assert.match(bad.reply, /Mutation risk|copy/i)
  assert.match(bad.reply, /touch|<=/i)

  const good = await ask(
    'CG4', 'review my code',
    'function mergeIntervals(iv){const a=[...iv].map(x=>[x[0],x[1]]).sort((p,q)=>p[0]-q[0]);const o=[];for(const [s,e] of a){const l=o[o.length-1];if(l&&s<=l[1])l[1]=Math.max(l[1],e);else o.push([s,e])}return o}',
  )
  assert.match(good.reply, /✅/, 'a correct draft should get positive marks')

  // CG1: comparing against 1 instead of 2 is the planted bug.
  const cg1bad = await ask('CG1', 'review my code', 'def first_repeated(s):\n    f={}\n    for c in s: f[c]=f.get(c,0)+1\n    for c in s:\n        if f[c]==1: return c\n    return ""')
  assert.match(cg1bad.reply, /exactly|== 2/i)
})

test('an unknown task still returns usable guidance rather than crashing', async () => {
  const r = await ask('ZZ9', 'help')
  assert.ok(r.reply.length > 40)
  assert.equal(r.engine, 'heuristic')
})

/* ---------------- grader fallback understands A2 tasks ---------------- */

test('the debugging grader separates a real A2 fix from the planted bug', async () => {
  const correct = await evaluateDebugging(
    'CG1', 'def first_repeated(s): ...', 'return the first char appearing exactly twice',
    'def first_repeated(s):\n    freq = {}\n    for ch in s:\n        freq[ch] = freq.get(ch, 0) + 1\n    for ch in s:\n        if freq[ch] == 2:\n            return ch\n    return ""',
  )
  const stillBuggy = await evaluateDebugging(
    'CG1', 'def first_repeated(s): ...', 'return the first char appearing exactly twice',
    'def first_repeated(s):\n    freq = {}\n    for ch in s:\n        freq[ch] = freq.get(ch, 0) + 1\n    for ch in s:\n        if freq[ch] == 1:\n            return ch\n    return ""',
  )
  assert.ok(
    correct.score > stillBuggy.score + 15,
    `a correct fix (${correct.score}) must clearly beat the unchanged bug (${stillBuggy.score})`,
  )
})

test('CG2 and CG3 fixes are graded on their real correctness signal', async () => {
  const cg2good = await evaluateDebugging('CG2', '', '', 'def rotate(arr, k):\n    if not arr:\n        return []\n    k = k % len(arr)\n    return list(arr[-k:]) + list(arr[:-k]) if k else list(arr)')
  const cg2bad = await evaluateDebugging('CG2', '', '', 'def rotate(arr, k):\n    return arr[-k:] + arr[:-k]  # no normalisation at all here')
  assert.ok(cg2good.score > cg2bad.score + 15, `${cg2good.score} vs ${cg2bad.score}`)

  const cg3good = await evaluateDebugging('CG3', '', '', 'function firstPos(a,k){let lo=0,hi=a.length-1,res=-1;while(lo<=hi){const mid=(lo+hi)>>1;if(a[mid]===k){res=mid;hi=mid-1}else if(a[mid]<k){lo=mid+1}else{hi=mid-1}}return res}')
  const cg3bad = await evaluateDebugging('CG3', '', '', 'function firstPos(a,k){let lo=0,hi=a.length-1;while(lo<=hi){const mid=(lo+hi)>>1;if(a[mid]===k){return mid}else if(a[mid]<k){lo=mid+1}else{hi=mid-1}}return -1}')
  assert.ok(cg3good.score > cg3bad.score + 10, `${cg3good.score} vs ${cg3bad.score}`)
})

test('an empty A2 submission always scores zero', async () => {
  const dbg = await evaluateDebugging('CG1', 'buggy', 'fix it', '')
  assert.equal(dbg.score, 0)
  const feat = await evaluateFeature('merge intervals', '', 'CG4')
  assert.equal(feat.score, 0)
  assert.match(feat.improvements.join(' '), /mergeIntervals/, 'the advice must name the A2 task, not the A1 rate limiter')
})

test('the AI-assisted Coding grader rewards a correct CG4 build', async () => {
  const good = await evaluateFeature(
    'merge overlapping intervals',
    'function mergeIntervals(intervals){const s=intervals.map(i=>[i[0],i[1]]).sort((a,b)=>a[0]-b[0]);const out=[];for(const [a,b] of s){const l=out[out.length-1];if(l&&a<=l[1])l[1]=Math.max(l[1],b);else out.push([a,b]);}return out;}',
    'CG4',
  )
  const weak = await evaluateFeature(
    'merge overlapping intervals',
    'function mergeIntervals(intervals){ intervals.sort(); return intervals; }',
    'CG4',
  )
  assert.ok(good.score > weak.score + 10, `${good.score} vs ${weak.score}`)
  assert.ok(good.score >= 60, `a correct implementation should score well, got ${good.score}`)
})

/* ---------------- writing target differs per assessment ---------------- */

test('the writing grader uses the assessment-2 word target', async () => {
  const text = Array(140).fill('word').join(' ') // inside 120–180, below 150
  const a2 = await evaluateWriting(text, 'scenario', { minWords: 120, maxWords: 180 })
  const a1 = await evaluateWriting(text, 'scenario')
  assert.ok(
    a2.rubric.clarity > a1.rubric.clarity,
    'a 140-word answer is on-target for A2 but short for A1',
  )
  assert.match(a2.strengths.join(' ') + a2.improvements.join(' '), /120–180/)
})

test('a blank email scores zero on both assessments', async () => {
  const a2 = await evaluateWriting('', 'scenario', { minWords: 120, maxWords: 180 })
  assert.equal(a2.score, 0)
  assert.match(a2.improvements.join(' '), /120–180/)
})
