import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import { computeOutputs, runBudgetMs, runCodingTests, summarizeRun, testLimitMs, MAX_RUN_MS } from '../company/codeRunner.ts'
import { loadBank } from '../company/bank.ts'
import type { CodingQuestion } from '../company/types.ts'

// Reference and brute-force solutions live only in the supplement (never in
// the bank or the browser). Running them through the real judge proves every
// hidden test — including the generated stress tests — is correct, passable
// in BOTH languages, and actually rejects inefficient algorithms.
const supplement = JSON.parse(fs.readFileSync('data/company/supplements/s03-coding.json', 'utf8'))
const bank = loadBank()
const Q = (slug: string) => {
  const q = bank.byId.get(`s3-c-${slug}`) as CodingQuestion
  assert.ok(q, `missing ${slug} in bank`)
  return q
}
const LANGS = ['python', 'javascript'] as const

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await fn(items[next++])
  }))
}

test('coding: every reference solution passes every hidden test (incl. stress) in Python and JavaScript', async () => {
  const failures: string[] = []
  await mapLimit(supplement.coding, 3, async (p: any) => {
    const q = Q(p.slug)
    for (const lang of LANGS) {
      const r = await runCodingTests(q, p.solution[lang], lang)
      if (r.passed !== q.tests.length || r.total !== q.tests.length) {
        failures.push(`${p.slug}/${lang}: ${r.passed}/${r.total} ${r.results.filter((x) => !x.passed).map((x) => `${x.name}=${x.status}`).join(', ')} ${r.error || ''}`)
      }
    }
  })
  assert.deepEqual(failures, [])
})

test('coding: naive solutions pass the samples but get "Time Limit Exceeded" on a stress test', async () => {
  // Limits are scaled down 4× here purely to keep the suite fast — the naive
  // solutions are 5–1000× slower than the references, so they still time out.
  const pairs: Array<[any, (typeof LANGS)[number]]> = []
  for (const p of supplement.coding) for (const lang of LANGS) if (p.brute?.[lang]) pairs.push([p, lang])
  assert.ok(pairs.length >= 30, `only ${pairs.length} brute-force proofs`)
  const failures: string[] = []
  await mapLimit(pairs, 2, async ([p, lang]) => {
    const base = Q(p.slug)
    const q: CodingQuestion = {
      ...base,
      tests: base.tests.filter((t) => t.sample || t.stress).map((t) => (t.stress ? { ...t, limitMs: Math.round(testLimitMs(t, lang) / 4) } : t)),
    }
    const r = await runCodingTests(q, p.brute[lang], lang)
    if (r.results.some((x) => x.sample && !x.passed)) failures.push(`${p.slug}/${lang}: a correct-but-slow solution failed a sample`)
    if (!r.results.some((x) => x.stress && x.status === 'tle')) failures.push(`${p.slug}/${lang}: no stress test timed out`)
    if (r.results.some((x) => x.status === 'wrong' || x.status === 'error')) failures.push(`${p.slug}/${lang}: brute produced a wrong answer/error`)
  })
  assert.deepEqual(failures, [])
})

test('coding: stress generators expand identically in Python and JavaScript', async () => {
  const specs = [
    { $gen: 'ints', n: 50000, lo: -1000000000, hi: 1000000000, seed: 7 },
    { $gen: 'distinct', n: 3000, lo: 1, hi: 20000, seed: 3 },
    { $gen: 'perm', n: 1000, seed: 11, base: 1 },
    { $gen: 'str', n: 20000, alphabet: 'abcxyz', seed: 5 },
    { $gen: 'range', start: 10, stop: -10, step: -3 },
    { $gen: 'repeat', value: { $gen: 'ints', n: 3, lo: 0, hi: 9, seed: 2 }, n: 4 },
    { $gen: 'strrepeat', value: 'ab', n: 5 },
    { $gen: 'concat', parts: [{ $gen: 'range', start: 0, stop: 5 }, [9, 9], { $gen: 'ints', n: 3, lo: 1, hi: 3, seed: 9 }] },
    { $gen: 'sorted', of: { $gen: 'ints', n: 2000, lo: -50, hi: 50, seed: 4 }, desc: true },
    { $gen: 'grid', rows: 30, cols: 40, lo: 0, hi: 2, seed: 8 },
    { $gen: 'grid', rows: 20, cols: 20, values: ['1', '0', '0'], seed: 17 },
    { $gen: 'affine', rows: 3, cols: 4, a: 4, b: 1, c: 0 },
    { $gen: 'intervals', n: 1000, lo: 0, hi: 100000, maxLen: 50, seed: 6 },
    { $gen: 'edges', n: 2000, m: 8000, wlo: 1, whi: 100, seed: 13, base: 1 },
    { $gen: 'edges', n: 500, m: 900, directed: false, seed: 21 },
    { $gen: 'edges', n: 3000, m: 6000, acyclic: true, seed: 43 },
    { $gen: 'choice', n: 3000, values: [-1, 1, 2], seed: 23 },
    { $gen: 'shuffle', of: { $gen: 'countup', k: 50, base: 7 }, seed: 29 },
    { $gen: 'chunks', of: { $gen: 'ints', n: 1003, lo: -9, hi: 9, seed: 31 }, size: 10, sort: true },
    { $gen: 'col', of: { $gen: 'intervals', n: 500, lo: 1, hi: 1000000000, minLen: 1, maxLen: 1000, seed: 37 }, index: 1 },
    { $gen: 'patch', of: { $gen: 'grid', rows: 5, cols: 5, lo: 1, hi: 1 }, cells: [[0, 0, 2], [4, 4, 0]] },
    { $gen: 'strs', n: 3000, len: 5, alphabet: 'abcdef', unique: true, seed: 41 },
    { $gen: 'zip', parts: [{ $gen: 'ints', n: 200, lo: 0, hi: 1, seed: 3 }, { $gen: 'ints', n: 200, lo: 1, hi: 600, seed: 4 }] },
    { nested: [{ $gen: 'ints', n: 5, lo: 0, hi: 1, seed: 99 }], k: 3 },
  ]
  const q = {
    fn: { python: 'ident', javascript: 'ident' }, compare: 'exact',
    tests: specs.map((s, i) => ({ name: `g${i}`, args: [s], expected: null })),
  } as unknown as CodingQuestion
  const py = await computeOutputs(q, 'def ident(x):\n    return x\n', 'python')
  const js = await computeOutputs(q, 'function ident(x) { return x }', 'javascript')
  assert.equal(py.error, undefined)
  assert.equal(js.error, undefined)
  specs.forEach((s, i) => {
    assert.equal(py.outputs[i].status, 'passed')
    assert.equal(py.outputs[i].digest, js.outputs[i].digest, `generator ${(s as any).$gen || 'object'} differs between languages`)
  })
  // Spot-check semantics, not just agreement.
  assert.deepEqual(py.outputs[4].value, [10, 7, 4, 1, -2, -5, -8])
  assert.deepEqual(py.outputs[11].value, [[0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11]])
  assert.equal((py.outputs[0].value as number[]).length, 50000)
  const distinct = py.outputs[1].value as number[]
  assert.equal(new Set(distinct).size, distinct.length)
})

test('coding: per-test verdicts — wrong answers, crashes, syntax errors, missing functions and empty code', async () => {
  const q = Q('subarray-sum-equals-k')
  const wrong = await runCodingTests(q, 'def subarray_sum(nums, k):\n    return 0\n', 'python')
  assert.ok(wrong.passed > 0 && wrong.passed < wrong.total, 'k=0-style cases pass, others fail')
  const sample = wrong.results.find((r) => r.name === 'example 1')!
  assert.equal(sample.status, 'wrong')
  assert.equal(sample.sample, true)
  assert.equal(sample.got, '0')
  assert.equal(sample.expected, '2')
  const hidden = wrong.results.find((r) => !r.sample && r.status === 'wrong')!
  assert.equal(hidden.got, undefined, 'hidden tests never reveal expected output')
  assert.equal(hidden.expected, undefined)

  const crash = await runCodingTests(q, 'def subarray_sum(nums, k):\n    raise ValueError("boom")\n', 'python')
  assert.equal(crash.passed, 0)
  assert.ok(crash.results.every((r) => r.status === 'error'))
  assert.match(String(crash.results[0].message), /ValueError: boom/)

  const syntax = await runCodingTests(q, 'function subarraySum( {', 'javascript')
  assert.equal(syntax.passed, 0)
  assert.equal(syntax.total, q.tests.length)
  assert.match(String(syntax.error), /failed to run/)

  const wrongName = await runCodingTests(q, 'def something_else():\n    pass\n', 'python')
  assert.match(String(wrongName.error), /subarray_sum/)

  const empty = await runCodingTests(q, '   ', 'python')
  assert.equal(empty.passed, 0)
  assert.match(String(empty.error), /No code submitted/)
})

test('coding: an infinite loop times out per test, skips the rest and stays inside the run budget', async () => {
  const q = Q('subarray-sum-equals-k')
  for (const [lang, code] of [['javascript', 'function subarraySum() { while (true) {} }'], ['python', 'def subarray_sum(nums, k):\n    while True:\n        pass\n']] as const) {
    const t0 = Date.now()
    const r = await runCodingTests(q, code, lang)
    const took = Date.now() - t0
    assert.equal(r.passed, 0)
    assert.ok(r.results.every((x) => x.status === 'tle'), `${lang}: every test is TLE`)
    assert.ok(r.results.some((x) => /Not run/.test(x.message || '')), `${lang}: later tests are skipped`)
    assert.ok(took < runBudgetMs(q, lang), `${lang}: finished in ${took}ms`)
  }
})

test('coding: a slow-but-correct solution earns partial credit and a clear summary', async () => {
  const q = Q('subarray-sum-equals-k')
  const brute = supplement.coding.find((p: any) => p.slug === 'subarray-sum-equals-k').brute.python
  const r = await runCodingTests(q, brute, 'python')
  const stress = r.results.filter((x) => x.stress)
  assert.ok(stress.length >= 2 && stress.every((x) => x.status === 'tle'))
  assert.equal(r.passed, r.total - stress.length)
  assert.match(summarizeRun(r), /time limit exceeded/)
})

test('coding: large outputs are judged by digest', async () => {
  const q = Q('product-except-self')
  assert.ok(q.tests.some((t) => t.expected && typeof t.expected === 'object' && '$digest' in (t.expected as object)))
  // Correct for small inputs, wrong (one element off) for large ones.
  const code = `function productExceptSelf(nums) {
  const n = nums.length, out = new Array(n).fill(1)
  let left = 1
  for (let i = 0; i < n; i++) { out[i] = left; left *= nums[i] }
  let right = 1
  for (let i = n - 1; i >= 0; i--) { out[i] *= right; right *= nums[i] }
  if (n > 1000) out[0] += 1
  return out
}`
  const r = await runCodingTests(q, code, 'javascript')
  const stress = r.results.filter((x) => x.stress)
  assert.ok(stress.length && stress.every((x) => x.status === 'wrong'))
  assert.ok(r.results.filter((x) => !x.stress).every((x) => x.passed))
})

test('coding: comparison is type-strict (1 is not True) but tolerant of 2.0 == 2', async () => {
  const part = Q('partition-equal-subset-sum')
  const r = await runCodingTests(part, 'def can_partition(nums):\n    return 1\n', 'python')
  assert.equal(r.passed, 0)
  const sub = Q('subarray-sum-equals-k')
  const f = await runCodingTests(sub, 'def subarray_sum(nums, k):\n    seen = {0: 1}\n    t = c = 0\n    for x in nums:\n        t += x\n        c += seen.get(t - k, 0)\n        seen[t] = seen.get(t, 0) + 1\n    return float(c)\n', 'python')
  assert.equal(f.passed, f.total)
})

test('coding: unordered-nested comparison accepts any grouping order', async () => {
  const q = Q('group-anagrams')
  const code = `function groupAnagrams(words) {
    const m = {}
    for (const w of words) { const k = [...w].sort().join(''); (m[k] = m[k] || []).unshift(w) }
    return Object.values(m).reverse()
  }`
  const r = await runCodingTests(q, code, 'javascript')
  assert.equal(r.passed, r.total)
})

test('coding: JavaScript runs at full speed, supports export syntax, hides require/process and ignores console output', async () => {
  const q = Q('character-replacement')
  // Math.* in a hot loop — ~80× slower in a separate vm context; must pass here.
  const code = `export function characterReplacement(s, k) {
  console.log('debug output is ignored')
  if (typeof require !== 'undefined' || typeof process !== 'undefined') return -1
  const count = new Array(26).fill(0)
  let best = 0, maxf = 0, left = 0
  for (let right = 0; right < s.length; right++) {
    const c = s.charCodeAt(right) - 65
    count[c]++
    maxf = Math.max(maxf, count[c])
    while (right - left + 1 - maxf > k) { count[s.charCodeAt(left) - 65]--; left++ }
    best = Math.max(best, Math.floor(right - left + 1))
  }
  return best
}`
  const r = await runCodingTests(q, code, 'javascript')
  assert.equal(r.passed, r.total, JSON.stringify(r.results.filter((x) => !x.passed)))
  const py = await runCodingTests(q, `def character_replacement(s, k):\n    print("noise " * 1000)\n    count = {}\n    best = maxf = left = 0\n    for right, ch in enumerate(s):\n        count[ch] = count.get(ch, 0) + 1\n        maxf = max(maxf, count[ch])\n        while right - left + 1 - maxf > k:\n            count[s[left]] -= 1\n            left += 1\n        best = max(best, right - left + 1)\n    return best\n`, 'python')
  assert.equal(py.passed, py.total)
})

test('coding: every problem has samples, stress tests and a bounded run budget', () => {
  for (const p of supplement.coding) {
    const q = Q(p.slug)
    assert.ok(q.tests.some((t) => t.sample), `${p.slug}: no sample test`)
    assert.ok(q.tests.some((t) => t.stress), `${p.slug}: no stress test`)
    for (const t of q.tests.filter((x) => x.sample)) assert.doesNotMatch(JSON.stringify(t.args), /\$gen/, `${p.slug}: sample uses a generator`)
    for (const lang of LANGS) assert.ok(runBudgetMs(q, lang) <= MAX_RUN_MS)
  }
})
