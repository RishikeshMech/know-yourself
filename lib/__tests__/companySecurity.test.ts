import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// The company question bank holds every answer key and hidden test. It must
// only ever be read on the server. These guards fail the suite if any client
// component (or anything a client component imports) reaches for it.

const SERVER_ONLY = [
  'data/company/bank.json',
  'company/bank',
  'company/attempts',
  'company/scoring',
  'company/grading',
  'company/codeRunner',
  'company/auth',
  'company/http',
]

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.(tsx?|jsx?)$/.test(e.name)) out.push(p)
  }
  return out
}

const isClient = (src: string) => /^\s*['"]use client['"]/.test(src)
const importsOf = (src: string) => [...src.matchAll(/^\s*import\s+(?!type\b)[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1])

test('security: no client component imports the answer-key bank or server-only company modules', () => {
  const files = [...walk('app'), ...walk('components'), ...walk('lib')].filter((f) => !f.includes('__tests__'))
  const offenders: string[] = []
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8')
    if (!isClient(src)) continue
    for (const spec of importsOf(src)) {
      if (SERVER_ONLY.some((s) => spec.includes(s))) offenders.push(`${f} → ${spec}`)
    }
  }
  assert.deepEqual(offenders, [])
})

test('security: client-safe company modules never import server-only modules', () => {
  for (const f of ['lib/company/catalog.ts', 'lib/company/blueprints.ts', 'lib/company/sections.ts', 'lib/company/review.ts', 'lib/company/client.ts']) {
    const src = fs.readFileSync(f, 'utf8')
    for (const spec of importsOf(src)) {
      assert.ok(!SERVER_ONLY.some((s) => spec.includes(s)), `${f} imports ${spec}`)
    }
  }
})

test('security: the bank is read from disk, never imported (so it cannot be bundled)', () => {
  const offenders: string[] = []
  for (const f of [...walk('app'), ...walk('components'), ...walk('lib')]) {
    if (f.includes('__tests__')) continue
    const src = fs.readFileSync(f, 'utf8')
    if (/from\s+['"][^'"]*data\/company\/bank\.json['"]|require\(\s*['"][^'"]*bank\.json['"]\s*\)/.test(src)) offenders.push(f)
  }
  assert.deepEqual(offenders, [])
})

test('security: every company API route verifies the caller before touching an attempt', () => {
  for (const r of ['route.ts', 'start/route.ts', 'attempt/route.ts', 'save/route.ts', 'submit/route.ts', 'runtests/route.ts', 'result/route.ts', 'evaluate/route.ts']) {
    const src = fs.readFileSync(path.join('app/api/company-assessments', r), 'utf8')
    assert.match(src, /requireStudentApi\(req,/, r)
    assert.match(src, /if \(!ctx\.ok\) return ctx\.response/, r)
  }
})
