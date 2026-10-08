import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// End to end: the real route handlers, lib/persist, lib/db and the repo's
// schema.sql + migrations, on a real Postgres engine (PGlite) behind a
// Supabase-compatible HTTP surface (PostgREST + GoTrue subset, scripts/supabase-e2e).
// Each check states what CORRECT behaviour is, and reads ground truth straight from
// the database. The scenarios run in a child process per key configuration.

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SCENARIOS = path.join(REPO, 'scripts/supabase-e2e/scenarios.mjs')

type Report = { mode: string; results: Array<{ id: string; title: string; pass: boolean; detail: string }> }

function runScenarios(mode: 'service' | 'anon'): Report {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'supabase-e2e-'))
  const report = path.join(dir, `${mode}.json`)
  const res = spawnSync(process.execPath, ['--no-warnings', '--experimental-strip-types', SCENARIOS], {
    cwd: REPO,
    env: { ...process.env, MODE: mode, REPORT: report },
    encoding: 'utf8',
    timeout: 240_000,
  })
  assert.equal(res.status, 0, `scenarios (${mode}) exited with ${res.status}\n${res.stdout}\n${res.stderr}`)
  return JSON.parse(fs.readFileSync(report, 'utf8')) as Report
}

for (const mode of ['service', 'anon'] as const) {
  test(`end to end (${mode === 'service' ? 'service key configured' : 'anon key only'}): student data is stored, read back, and never leaks`, { timeout: 300_000 }, () => {
    const report = runScenarios(mode)
    const failed = report.results.filter(r => !r.pass).map(r => `${r.id} ${r.title} — ${r.detail}`)
    assert.deepEqual(failed, [], `failing checks in mode=${mode}`)
    assert.ok(report.results.length >= 25, `only ${report.results.length} checks ran`)
  })
}
