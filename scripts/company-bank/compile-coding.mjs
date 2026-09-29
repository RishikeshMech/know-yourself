#!/usr/bin/env node
/**
 * Compile the coding-problem authoring sources (scripts/company-bank/coding/)
 * into data/company/supplements/s03-coding.json, which build.mjs then turns
 * into the bank.
 *
 *   npm run compile:coding          (node --experimental-strip-types)
 *
 * For every problem it:
 *   1. runs the Python AND the JavaScript reference solution through the real
 *      judge harness in "compute" mode;
 *   2. requires both to finish every test inside its time limit and to agree
 *      byte-for-byte on every output (two independent implementations);
 *   3. fills in each missing `expected` — a literal when small, otherwise a
 *      sha256 digest of the canonical JSON;
 *   4. re-judges both references (so hand-written expectations are checked
 *      too) and fails if a reference uses more than 40 % of a stress limit;
 *   5. runs the optional naive `brute` solutions and reports which tests they
 *      pass or time out on (proof that the stress tests bite).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { computeOutputs, runCodingTests, testLimitMs } from '../../lib/company/codeRunner.ts'
import { MEDIUM } from './coding/medium.mjs'
import { HARD } from './coding/hard.mjs'
import { RETIRE, PATCHES, BRUTE } from './coding/patches.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const FILE = path.join(ROOT, 'data/company/supplements/s03-coding.json')
const LITERAL_MAX = 1500
const MAX_SHARE = 0.4
const LANGS = ['python', 'javascript']

const compact = (v) => JSON.stringify(v).replace(/\s+/g, '')
const isGen = (v) => JSON.stringify(v).includes('"$gen"')

function markSamples(p) {
  if (p.tests.some((t) => t.sample)) return
  const inputs = (p.examples || []).map((e) => String(e.input || '').replace(/\s+/g, ''))
  for (const t of p.tests) {
    if (isGen(t.args)) continue
    if (inputs.some((inp) => t.args.every((a) => inp.includes(compact(a))))) t.sample = true
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i) }
  }))
  return out
}

const data = JSON.parse(fs.readFileSync(FILE, 'utf8'))
const byOld = new Map(data.coding.map((p) => [p.slug, p]))

// 1. existing problems minus retired ones, with patches applied
let problems = data.coding.filter((p) => !RETIRE.includes(p.slug)).map((p) => structuredClone(p))
for (const p of problems) {
  const patch = PATCHES[p.slug]
  if (patch?.constraints) p.constraints = patch.constraints
  for (const t of patch?.tests || []) {
    const i = p.tests.findIndex((x) => x.name === t.name)
    if (i === -1) p.tests.push(structuredClone(t))
    else p.tests[i] = structuredClone(t)
  }
  if (BRUTE[p.slug]) p.brute = BRUTE[p.slug]
}
// 2. authored problems replace/add by slug
for (const np of [...MEDIUM, ...HARD]) {
  problems = problems.filter((p) => p.slug !== np.slug)
  problems.push(structuredClone(np))
}
for (const p of problems) {
  if (!p.starter) {
    p.starter = {
      python: `def ${p.fn.python}(${pyParams(p)}):\n    # Write your solution here.\n    pass\n`,
      javascript: `function ${p.fn.javascript}(${jsParams(p)}) {\n  // Write your solution here.\n}\n`,
    }
  }
  markSamples(p)
}

function pyParams(p) {
  const m = String(p.solution.python).match(new RegExp(`def ${p.fn.python}\\(([^)]*)\\)`))
  return m ? m[1] : '*args'
}
function jsParams(p) {
  const m = String(p.solution.javascript).match(new RegExp(`function ${p.fn.javascript}\\(([^)]*)\\)`))
  return m ? m[1] : '...args'
}

const problemsErrors = []
const report = []

await mapLimit(problems, 3, async (p) => {
  const q = { fn: p.fn, compare: p.compare || 'exact', tests: p.tests }
  const [py, js] = await Promise.all(LANGS.map((lang) => computeOutputs(q, p.solution[lang], lang)))
  const errs = []
  if (py.error || js.error) errs.push(`reference crashed: py=${py.error || 'ok'} js=${js.error || 'ok'}`)
  let slowest = { share: 0, name: '' }
  p.tests.forEach((t, i) => {
    const a = py.outputs[i], b = js.outputs[i]
    if (!a || !b) return errs.push(`${t.name}: missing output`)
    if (a.status !== 'passed') errs.push(`${t.name}: python reference ${a.status} ${a.message || ''}`)
    if (b.status !== 'passed') errs.push(`${t.name}: javascript reference ${b.status} ${b.message || ''}`)
    if (a.status === 'passed' && b.status === 'passed') {
      const agree = p.compare === 'float' ? Math.abs(Number(a.value) - Number(b.value)) < 1e-9 : a.digest === b.digest
      if (!agree) errs.push(`${t.name}: Python and JavaScript references disagree (${JSON.stringify(a.value).slice(0, 80)} vs ${JSON.stringify(b.value).slice(0, 80)})`)
      if (t.expected === undefined) {
        const lit = JSON.stringify(a.value)
        t.expected = lit.length <= LITERAL_MAX || p.compare === 'float' ? a.value : { $digest: a.digest }
      }
    }
    for (const [lang, o] of [['python', a], ['javascript', b]]) {
      const share = (o?.ms || 0) / testLimitMs(t, lang)
      if (share > slowest.share) slowest = { share, name: `${t.name} (${lang} ${o.ms}ms / ${testLimitMs(t, lang)}ms)` }
      if (t.stress && share > MAX_SHARE) errs.push(`${t.name}: ${lang} reference uses ${Math.round(share * 100)}% of its limit (${o.ms}ms)`)
    }
  })
  // Judge both references against the final expectations (checks literals too).
  if (!errs.length) {
    for (const lang of LANGS) {
      const r = await runCodingTests(q, p.solution[lang], lang)
      if (r.passed !== r.total) errs.push(`${lang} reference judged ${r.passed}/${r.total}: ${r.results.filter((x) => !x.passed).map((x) => `${x.name}=${x.status}`).join(', ')} ${r.error || ''}`)
    }
  }
  // Brute-force proofs (informational here; asserted by the test-suite).
  const brute = []
  for (const lang of LANGS) {
    if (!p.brute?.[lang] || errs.length) continue
    const r = await runCodingTests(q, p.brute[lang], lang)
    const tle = r.results.filter((x) => x.status === 'tle').length
    const bad = r.results.filter((x) => x.status === 'wrong' || x.status === 'error').map((x) => x.name)
    brute.push(`${lang} brute ${r.passed}/${r.total} (TLE ${tle}${bad.length ? `, WRONG/ERR: ${bad.join('; ')}` : ''})`)
  }
  if (errs.length) problemsErrors.push(`${p.slug}:\n    ${errs.join('\n    ')}`)
  report.push(`${p.difficulty.padEnd(6)} ${p.slug.padEnd(34)} tests ${String(p.tests.length).padStart(2)} (stress ${p.tests.filter((t) => t.stress).length}) slowest ${Math.round(slowest.share * 100)}% ${slowest.name}${brute.length ? '\n         ' + brute.join(' | ') : ''}`)
})

if (problemsErrors.length) {
  console.error(`\n✗ ${problemsErrors.length} problem(s) failed:\n  ${problemsErrors.join('\n  ')}`)
  process.exit(1)
}

const order = { medium: 0, hard: 1 }
problems.sort((a, b) => order[a.difficulty] - order[b.difficulty] || a.slug.localeCompare(b.slug))
const out = {
  section: data.section,
  _about: 'LeetCode-style coding problems (medium/hard only) for the company coding rounds. AUTHORING SOURCE: scripts/company-bank/coding/*.mjs — edit there and run `npm run compile:coding`; this file is generated. Hidden tests run server-side in Python or JavaScript with per-test time limits; stress tests use deterministic generators ({"$gen": …}) and large expected outputs are stored as sha256 digests. Reference and brute-force solutions never reach the bank or the browser; lib/__tests__/companyCoding.test.ts re-verifies them.',
  coding: problems.map(({ slug, title, topic, difficulty, statement, examples, constraints, fn, starter, compare, tests, solution, brute }) => ({
    slug, title, topic, difficulty, statement, examples, constraints, fn, starter, compare: compare || 'exact', tests, solution, ...(brute ? { brute } : {}),
  })),
}
fs.writeFileSync(FILE, JSON.stringify(out, null, 1) + '\n')
report.sort()
console.log(report.join('\n'))
const counts = problems.reduce((m, p) => ((m[p.difficulty] = (m[p.difficulty] || 0) + 1), m), {})
console.log(`\n✓ ${problems.length} problems (${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}), ${problems.reduce((s, p) => s + p.tests.length, 0)} tests, ${problems.reduce((s, p) => s + p.tests.filter((t) => t.stress).length, 0)} stress → ${path.relative(ROOT, FILE)}`)
if (byOld.size !== problems.length) console.log(`  (was ${byOld.size} problems; retired ${RETIRE.filter((s) => byOld.has(s)).length})`)
