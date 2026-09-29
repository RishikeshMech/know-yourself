import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'

import { calibiFromSources, calibiGrade, companyEntry, computeCalibiScore, platformEntry } from '../calibiScore.ts'
import { attemptRows, enrichRow, normalizeCompanyAttempt, summarizeCompanies } from '../adminAssessments.ts'
import { buildRow } from '../studentRows.ts'
import { COMPANY_CSV_COLUMNS, CSV_COLUMNS, rowsToCsv } from '../csv.ts'
import { fetchAllStudents, fetchStudentsPage } from '../adminStudents.ts'
import { flushDB, saveAssessmentResult, saveAssessmentSession, saveCompanyAttempt, saveProfile, setDbDirectory } from '../db.ts'

/** Minimal RFC 4180 line parser (quoted cells, doubled quotes). */
function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = '', q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') q = false
      else cur += ch
    } else if (ch === '"') q = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}

/* ------------------------------------------------------------------ */
/* The rule                                                             */
/* ------------------------------------------------------------------ */

test('CalibiAI Score: one assessment → that assessment on the 1000 scale', () => {
  const s = calibiFromSources({ a1: { total: 734, grade: 'B' } })
  assert.equal(s.score, 734)
  assert.equal(s.count, 1)
  assert.equal(s.grade, 'B')
})

test('CalibiAI Score: average of every completed assessment, each normalised', () => {
  const s = calibiFromSources({
    a1: { total: 720 },
    a2: { total: 640 },
    company: [
      { company: 'amazon', status: 'submitted', score: 82.5, verdict: 'ready' },
      { company: 'tcs', status: 'expired', score: 50 },
      { company: 'infosys', status: 'in_progress', score: 99 }, // not finished → ignored
      { company: 'wipro', status: 'submitted', score: null }, // not graded → ignored
    ],
  })
  // (72 + 64 + 82.5 + 50) / 4 = 67.125 → 671
  assert.equal(s.count, 4)
  assert.equal(s.score, 671)
  assert.equal(s.grade, 'B')
  assert.deepEqual(s.entries.map((e) => e.key), ['a1', 'a2', 'company:amazon', 'company:tcs'])
  const cats = Object.fromEntries(s.categories.map((c) => [c.id, c.percent]))
  assert.equal(cats.platform, 68)
  assert.equal(cats['big-tech'], 82.5)
  assert.equal(cats['it-services'], 50)
})

test('CalibiAI Score: no graded assessment → no score', () => {
  const s = calibiFromSources({ company: [{ company: 'tcs', status: 'in_progress', score: null }] })
  assert.equal(s.score, null)
  assert.equal(s.count, 0)
  assert.equal(s.grade, null)
})

test('CalibiAI Score: rounds halves up, clamps out-of-range values, dedupes by assessment', () => {
  // (61.25 + 61.25) / 2 * 10 = 612.5 → 613
  assert.equal(calibiFromSources({ company: [{ company: 'tcs', status: 'submitted', score: 61.25 }, { company: 'wipro', status: 'submitted', score: 61.25 }] }).score, 613)
  assert.equal(computeCalibiScore([platformEntry(1, { total: 1200 })]).score, 1000)
  assert.equal(computeCalibiScore([companyEntry({ company: 'tcs', status: 'submitted', score: -5 })]).score, 0)
  const dup = computeCalibiScore([
    platformEntry(1, { total: 400, created_at: '2026-01-01' }),
    platformEntry(1, { total: 800, created_at: '2026-02-01' }),
  ])
  assert.equal(dup.count, 1)
  assert.equal(dup.score, 800)
  assert.deepEqual([900, 750, 600, 400, 399].map(calibiGrade), ['S', 'A', 'B', 'C', 'D'])
})

/* ------------------------------------------------------------------ */
/* Admin enrichment (pure)                                              */
/* ------------------------------------------------------------------ */

test('admin: company attempts normalise from both the local store and Supabase rows', () => {
  const local = normalizeCompanyAttempt({ company: 'amazon', status: 'submitted', score: 71.5, proctoring: { strikes: 1, camera: true }, result: { verdict: 'almost', rounds: [{ id: 'oa', label: 'Online Assessment', percent: 70, cleared: true }] }, started_at: 's', submitted_at: 't', duration_sec: 6000 })!
  assert.equal(local.name, 'Amazon')
  assert.equal(local.category, 'Global Product & Big Tech')
  assert.equal(local.verdict_label, 'Almost there')
  assert.equal(local.strikes, 1)
  assert.equal(local.rounds[0].label, 'Online Assessment')
  const remote = normalizeCompanyAttempt({ company_slug: 'tcs', status: 'in_progress', score: 12, strikes: 0, camera: false, rounds: null })!
  assert.equal(remote.company, 'tcs')
  assert.equal(remote.score, null, 'in-progress attempts never carry a score')
  assert.equal(remote.verdict_label, 'In progress')
  assert.equal(remote.camera, false)
})

test('admin: enrichRow fills CalibiAI, Capgemini, company-wise and category-wise columns', () => {
  const base = buildRow({ student_id: 's1', email: 'a@b.c', profile: { full_name: 'Asha', college: 'COEP' }, scores: { total: 700, grade: 'B' } })
  assert.equal(base.calibi_score, '700', 'defaults to assessment 1 alone')
  const row = enrichRow(base, {
    a2: { total: 600, grade: 'B', percentile: 70, created_at: '2026-09-01', modules: { english: 150, technical: 200, debugging: 120, ai_coding: 90, cognitive: 40 } },
    company: [
      normalizeCompanyAttempt({ company: 'amazon', status: 'submitted', score: 80, verdict: 'ready', submitted_at: '2026-09-02' })!,
      normalizeCompanyAttempt({ company: 'tcs', status: 'expired', score: 50, verdict: 'borderline', submitted_at: '2026-09-03' })!,
      normalizeCompanyAttempt({ company: 'infosys', status: 'in_progress' })!,
    ],
  })
  assert.equal(row.calibi_score, '650') // (70 + 60 + 80 + 50) / 4
  assert.equal(row.assessments_taken, '4')
  assert.equal(row.a2_score, '600')
  assert.equal(row.a2_english, '150')
  assert.equal(row.company_taken, '2')
  assert.equal(row.company_in_progress, '1')
  assert.equal(row.company_avg, '65')
  assert.equal(row.company_best, 'Amazon 80')
  assert.equal(row.cat_platform, '65')
  assert.equal(row.cat_big_tech, '80')
  assert.equal(row.cat_it_services, '50')
  assert.deepEqual(row.company_scores, { amazon: 80, tcs: 50 })
  assert.match(row.tests_taken, /CalibiAI Assessment \[Platform assessments\]; Capgemini 2027 Mock \[Platform assessments\]; Amazon \[Global Product & Big Tech\]; TCS \[IT Services & Consulting\]/)

  const csv = rowsToCsv([row])
  const [header, line] = csv.replace(/^\uFEFF/, '').split('\r\n')
  const cols = parseCsvLine(header)
  const cells = parseCsvLine(line)
  assert.equal(cols.length, CSV_COLUMNS.length + COMPANY_CSV_COLUMNS.length)
  assert.equal(cells.length, cols.length)
  const cell = (label: string) => cells[cols.indexOf(label)]
  assert.equal(cell('Company - Amazon (/100)'), '80')
  assert.equal(cell('Company - TCS (/100)'), '50')
  assert.equal(cell('Company - Infosys (/100)'), '', 'in-progress mocks have no score')
  assert.equal(cell('CalibiAI Score (average of all assessments, /1000)'), '650')
  assert.equal(cell('CalibiAI Assessment Score (/1000)'), '700')
  assert.equal(cell('Capgemini 2027 Mock Score (/1000)'), '600')
  assert.equal(cell('Category Avg - Global Product & Big Tech (%)'), '80')

  const attempts = attemptRows([row])
  assert.deepEqual(attempts.map((a) => a[7]), ['CalibiAI Assessment', 'Capgemini 2027 Mock', 'Amazon', 'TCS', 'Infosys'])
  assert.equal(attempts[2][9], 'Global Product & Big Tech')
  assert.equal(attempts[4][10], 'in_progress')

  const summary = summarizeCompanies([row])
  const amazon = summary.find((c) => c.company === 'amazon')!
  assert.equal(amazon.completed, 1)
  assert.equal(amazon.average, 80)
  assert.equal(amazon.ready, 1)
  assert.equal(summary.find((c) => c.company === 'infosys')!.in_progress, 1)
})

/* ------------------------------------------------------------------ */
/* Admin end to end on the local store (real fetchAllStudents)          */
/* ------------------------------------------------------------------ */

function useTempStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'calibi-admin-test-'))
  setDbDirectory(dir)
  return async () => {
    await flushDB()
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

function attempt(student: string, company: string, status: 'submitted' | 'expired' | 'in_progress', score: number | null, verdict?: string) {
  const now = new Date().toISOString()
  return {
    id: `${student}-${company}`, student_id: student, company, status, question_seed: 1,
    paper: { rounds: [] } as any, answers: {}, proctoring: { strikes: 2, camera: true, fullscreen: true, events: [] },
    started_at: now, expires_at: now, duration_sec: 6000,
    submitted_at: status === 'in_progress' ? null : now, auto_submitted: status === 'expired',
    score, result: status === 'in_progress' ? null : ({ score, verdict, verdictLabel: '', rounds: [{ id: 'oa', label: 'Online Assessment', weight: 100, earned: 1, possible: 1, percent: score, cleared: true, answered: 1, total: 1 }], sections: [], items: [], answered: 1, total: 1, gradedAt: now, graders: { written: 'heuristic', coding: 'python' } } as any),
    created_at: now, updated_at: now,
  }
}

test('admin (real fetchAllStudents): every assessment, the CalibiAI average and company-wise scores', async (t) => {
  const cleanup = useTempStore()
  t.after(cleanup)
  saveProfile({ id: 'u_top', email: 'top@x.com', full_name: 'Top Student', college: 'COEP' } as any)
  saveProfile({ id: 'u_a1', email: 'a1@x.com', full_name: 'Only A1', college: 'COEP' } as any)
  saveProfile({ id: 'u_none', email: 'none@x.com', full_name: 'Nothing Yet', college: 'MIT' } as any)
  const s1 = saveAssessmentSession({ id: 'sess1', student_id: 'u_top', status: 'submitted', submitted_at: '2026-09-01T10:00:00Z', created_at: '2026-09-01T08:00:00Z', assessment_no: 1 } as any)
  saveAssessmentResult({ id: 'r1', session_id: 'sess1', student_id: 'u_top', total: 700, grade: 'B', percentile: 80, scores: { total: 700, grade: 'B', english: { total: 150 } }, created_at: '2026-09-01T10:00:00Z', assessment_no: 1 } as any)
  saveAssessmentSession({ id: 'sess2', student_id: 'u_top', status: 'submitted', submitted_at: '2026-09-05T10:00:00Z', created_at: '2026-09-05T08:00:00Z', assessment_no: 2 } as any)
  // Newer A2 result — must NOT be shown as the CalibiAI assessment score.
  saveAssessmentResult({ id: 'r2', session_id: 'sess2', student_id: 'u_top', total: 600, grade: 'B', percentile: 70, scores: { total: 600, assessment_no: 2, english: { total: 140 }, ai_literacy: 180, debugging_total: 150, ai_coding: 90, cognitive: { total: 40 } }, created_at: '2026-09-05T10:00:00Z', assessment_no: 2 } as any)
  saveCompanyAttempt(attempt('u_top', 'amazon', 'submitted', 80, 'ready') as any)
  saveCompanyAttempt(attempt('u_top', 'tcs', 'expired', 50, 'borderline') as any)
  saveCompanyAttempt(attempt('u_top', 'infosys', 'in_progress', null) as any)
  saveAssessmentSession({ id: 'sess3', student_id: 'u_a1', status: 'submitted', submitted_at: '2026-09-02T10:00:00Z', created_at: '2026-09-02T08:00:00Z', assessment_no: 1 } as any)
  saveAssessmentResult({ id: 'r3', session_id: 'sess3', student_id: 'u_a1', total: 820, grade: 'A', percentile: 90, scores: { total: 820, grade: 'A' }, created_at: '2026-09-02T10:00:00Z', assessment_no: 1 } as any)
  void s1

  const { students } = await fetchAllStudents()
  const top = students.find((s) => s.student_id === 'u_top')!
  assert.equal(top.score, '700', 'assessment 1 stays assessment 1')
  assert.equal(top.a2_score, '600')
  assert.equal(top.a2_technical, '180')
  assert.equal(top.calibi_score, '650')
  assert.equal(top.assessments_taken, '4')
  assert.equal(top.company_taken, '2')
  assert.equal(top.company_in_progress, '1')
  assert.deepEqual(top.company_scores, { amazon: 80, tcs: 50 })
  assert.equal(top.company_attempts?.find((a) => a.company === 'amazon')?.strikes, 2)
  const a1 = students.find((s) => s.student_id === 'u_a1')!
  assert.equal(a1.calibi_score, '820')
  const none = students.find((s) => s.student_id === 'u_none')!
  assert.equal(none.calibi_score, '')
  assert.equal(none.assessments_taken, '0')

  // Sorting the table by the CalibiAI average (local mode: no Supabase).
  const page = await fetchStudentsPage({ page: 1, pageSize: 10, college: '', q: '', sort: 'calibi', dir: 'desc', assessed: false })
  assert.deepEqual(page.students.map((s) => s.student_id).slice(0, 2), ['u_a1', 'u_top'])
  assert.equal(page.students[1].calibi_score, '650')
})
