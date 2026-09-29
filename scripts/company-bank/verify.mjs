#!/usr/bin/env node
/**
 * Executes every `verify` block in data/company/supplements/*.json and checks
 * the program's output against the item's answer key.
 *
 *   npm run verify:company-bank
 *
 * verify: { lang: 'python' | 'javascript' | 'c', src?: string, expect?: string }
 *         { lang: 'sql', setup: string, query: string, expect?: string }
 *
 * `src` defaults to the item's `code`. `expect` defaults to the answer text.
 * Output is compared after trimming. SQL results are rendered one row per
 * line with columns joined by " | " (NULL for null), then lines joined by ", ".
 * Items whose interpreter/compiler is missing are reported as skipped.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SUPP = path.join(ROOT, 'data/company/supplements')

const has = (cmd) => spawnSync('sh', ['-c', `command -v ${cmd}`]).status === 0
const tools = { python: has('python3'), javascript: true, c: has('gcc'), sql: has('python3') }

function run(lang, src, v) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cbv-'))
  try {
    if (lang === 'python') {
      return spawnSync('python3', ['-c', src], { encoding: 'utf8', timeout: 10000 })
    }
    if (lang === 'javascript') {
      const file = path.join(tmp, 'm.mjs')
      fs.writeFileSync(file, src)
      return spawnSync(process.execPath, [file], { encoding: 'utf8', timeout: 10000 })
    }
    if (lang === 'c') {
      const file = path.join(tmp, 'm.c')
      const bin = path.join(tmp, 'm')
      const full = /\bmain\s*\(/.test(src)
        ? src
        : `#include <stdio.h>\n#include <string.h>\nint main(void) {\n${src}\nreturn 0;\n}\n`
      fs.writeFileSync(file, full)
      const cc = spawnSync('gcc', ['-std=c11', '-w', '-o', bin, file], { encoding: 'utf8' })
      if (cc.status !== 0) return { status: 1, stdout: '', stderr: cc.stderr }
      return spawnSync(bin, [], { encoding: 'utf8', timeout: 10000 })
    }
    if (lang === 'sql') {
      const py = `
import sqlite3, sys
con = sqlite3.connect(':memory:')
con.executescript(sys.argv[1])
rows = con.execute(sys.argv[2]).fetchall()
fmt = lambda v: 'NULL' if v is None else (str(int(v)) if isinstance(v, float) and v.is_integer() else str(v))
print(', '.join(' | '.join(fmt(c) for c in r) for r in rows))
`
      return spawnSync('python3', ['-c', py, v.setup, v.query], { encoding: 'utf8', timeout: 10000 })
    }
    return { status: 1, stdout: '', stderr: `unknown lang ${lang}` }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

let checked = 0, failed = 0, skipped = 0
for (const f of fs.readdirSync(SUPP).filter((x) => /^s\d+.*\.json$/.test(x)).sort()) {
  const data = JSON.parse(fs.readFileSync(path.join(SUPP, f), 'utf8'))
  for (const it of data.mcq || []) {
    const v = it.verify
    if (!v) continue
    if (!tools[v.lang]) { skipped++; continue }
    const src = v.src ?? it.code ?? ''
    const res = run(v.lang, src, v)
    const out = String(res.stdout || '').trim()
    const want = String(v.expect ?? it.answer).trim()
    checked++
    if (out !== want) {
      failed++
      console.log(`✖ ${f}: ${it.q.slice(0, 90)}\n    expected: ${JSON.stringify(want)}\n    got:      ${JSON.stringify(out)} ${res.stderr ? '\n    stderr: ' + String(res.stderr).trim().slice(0, 300) : ''}`)
    }
  }
}
console.log(`\n${failed ? '✖' : '✔'} verified ${checked} computed answer keys (${failed} failed, ${skipped} skipped: missing toolchain)`)
process.exit(failed ? 1 : 0)
