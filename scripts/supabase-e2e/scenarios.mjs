// End-to-end scenarios against the REAL repo code (route handlers + lib/persist +
// lib/db) and the REAL schema.sql on PGlite, driven the way the browser drives it.
//
//   MODE=service node scenarios.mjs   # SUPABASE_SERVICE_ROLE_KEY is set on the server
//   MODE=anon    node scenarios.mjs   # only the anon key is configured on the server
//
// Each check states what CORRECT behaviour is. Ground truth is read straight from
// Postgres as the superuser (RLS does not apply), never through the app.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { SupabaseEmu, STUBS, DEFAULT_GRANTS, EMU_URL } from './emu.mjs'
import { bootApp, route, REPO } from './boot.mjs'
import { pathToFileURL } from 'node:url'

const MODE = process.env.MODE === 'anon' ? 'anon' : 'service'
const OUT = process.env.REPORT || path.join(os.tmpdir(), `supabase-e2e-${MODE}.json`)

// Schema under test: the consolidated schema plus any later migration in the repo.
const migDir = path.join(REPO, 'supabase/migrations')
const later = fs.readdirSync(migDir).filter(f => /^(\d+)_.*\.sql$/.test(f) && Number(f.slice(0, 4)) >= 12).sort()
const files = [
  fs.readFileSync(path.join(REPO, 'supabase/schema.sql'), 'utf8').replace(/create extension if not exists "pgcrypto";/gi, ''),
  ...later.map(f => fs.readFileSync(path.join(migDir, f), 'utf8')),
]

const emu = await SupabaseEmu.create({ stubs: STUBS, files, extraSql: DEFAULT_GRANTS + "\ninsert into public.institutions (id, name, tenant_code) values ('00000000-0000-4000-8000-000000000001', 'PCCOE', 'pccoe') on conflict do nothing;" })
const { dir: storeDir, db: localDb } = await bootApp({ emu, serviceKey: MODE === 'service' })

const results = []
const check = (id, title, pass, detail = '') => {
  results.push({ id, title, pass: !!pass, detail: String(detail).slice(0, 300) })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${id} ${title}${detail ? '  — ' + String(detail).slice(0, 220) : ''}`)
}
const sql = async (q, p = []) => (await emu.db.query(q, p)).rows   // superuser: ground truth

// ---- HTTP helpers that mirror the browser -------------------------------------
const J = (x) => JSON.stringify(x)
async function api(mod, method, url, { token, body, cookie, headers = {} } = {}) {
  const h = { 'Content-Type': 'application/json', ...headers }
  if (token) h.Authorization = `Bearer ${token}`
  if (cookie) h.Cookie = cookie
  const init = { method, headers: h }
  if (body !== undefined) init.body = J(body)
  const req = new Request(`http://localhost${url}`, init)
  const fn = method === 'GET' ? mod.GET : mod.POST
  const res = await fn(req)
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  return { status: res.status, data }
}

// ---- routes ---------------------------------------------------------------------
const R = {
  profile: await route('app/api/user/profile/route.ts'),
  session: await route('app/api/user/session/route.ts'),
  assessment: await route('app/api/user/assessment/route.ts'),
  submit: await route('app/api/user/assessment/submit/route.ts'),
  scores: await route('app/api/user/scores/route.ts'),
  resumeRead: await route('app/api/user/resume/route.ts'),
  resumeAnalyze: await route('app/api/user/resume/analyze/route.ts'),
  tracking: await route('app/api/user/tracking/route.ts'),
  feedback: await route('app/api/feedback/route.ts'),
  help: await route('app/api/help/route.ts'),
  adminStudents: await route('app/api/admin/students/route.ts'),
}

// ---- accounts (Supabase Auth signup, as the app's signup does) ------------------
async function signup(email, name) {
  const r = await emu.handle(new Request(`${EMU_URL}/auth/v1/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: 'x' },
    body: J({ email, password: 'Secret#123', data: { full_name: name, role: 'student' } }),
  }))
  const j = await r.json()
  return { id: j.user.id, token: j.access_token, email }
}
const A = await signup('aarti@example.com', 'Aarti Deshmukh')   // the student under test
const B = await signup('rohan@example.com', 'Rohan Kulkarni')   // another student (victim/attacker)
const C = await signup('neha@example.com', 'Neha Patil')        // third student (session tests)
const D = await signup('dev@example.com', 'Dev Joshi')          // missing-id submit test

const profileBody = (id, extra = {}) => ({
  user_id: id, email: (id === A.id ? A.email : id === B.id ? B.email : id === C.id ? C.email : D.email), full_name: 'Aarti Deshmukh', prn: 'PCCOE2021045', phone: '9822011111',
  dob: '2003-04-11', gender: 'Female', degree: 'B.Tech', college: 'PCCOE', graduation_year: 2026,
  cgpa: 8.2, skills: 'Python, SQL', linkedin_url: '', github_url: '', ...extra,
})

// Scores shaped like computeScores() output (what the browser submits).
const scores = (total) => ({
  english: { listening: 42, speaking: 38, reading: 45, writing: 40, total: 165, max: 200 },
  problem_solving: 78, ai_debugging: 66, ai_feature: 71, prompt_engineering: 82,
  cognitive: { grid: 34, logical: 30, cognitive_score: 64, behavioral_total: 118, total: 182, max: 200 },
  total, grade: 'A', percentile: 84.2, verifiable_hash: 'sha256:abc-123', assessment_no: 1,
})

async function startSession(student, assessmentNo = 1) {
  // instructions/page.tsx sends the signed-in student's id and a fresh seed.
  const r = await api(R.session, 'POST', '/api/user/session', {
    token: student.token, body: { student_id: student.id, question_seed: 424242, assessment_no: assessmentNo, duration_sec: 7200 },
  })
  return r
}

// =============================================================================
console.log(`\n=== mode: ${MODE} (${MODE === 'service' ? 'SUPABASE_SERVICE_ROLE_KEY set' : 'anon key only'}) ===\n`)

// ---- Student A: the full journey -------------------------------------------------
{
  const r = await api(R.profile, 'POST', '/api/user/profile', { token: A.token, body: profileBody(A.id) })
  const row = (await sql(`select phone, college, prn from public.profiles where id = $1`, [A.id]))[0]
  check('P1', 'onboarding profile is stored in Supabase', row?.college === 'PCCOE' && row?.phone === '9822011111',
    `route supabase=${r.data?.supabase} db college=${row?.college ?? '∅'}`)
}
{
  const form = new FormData()
  form.append('file', new File(['Aarti Deshmukh\nB.Tech CSE 2026\nSkills: Python, SQL, React\nProjects: URL shortener (Node, Redis)'], 'resume.txt', { type: 'text/plain' }))
  form.append('user_id', A.id); form.append('full_name', 'Aarti Deshmukh'); form.append('email', A.email)
  form.append('degree', 'B.Tech'); form.append('skills', 'Python, SQL')
  const req = new Request('http://localhost/api/user/resume/analyze', { method: 'POST', headers: { Authorization: `Bearer ${A.token}` }, body: form })
  const res = await R.resumeAnalyze.POST(req)
  const j = await res.json()
  const row = (await sql(`select count(*)::int as n from public.resume_analyses where student_id = $1`, [A.id]))[0]
  check('P2', 'resume analysis is stored in Supabase', row.n >= 1, `route status=${res.status} supabase=${j.supabase} db rows=${row.n}`)
}
{
  const r = await api(R.tracking, 'POST', '/api/user/tracking', { token: A.token, body: { user_id: A.id, action: 'join_whatsapp', completed: true } })
  const row = (await sql(`select completed from public.tracking_events where user_id = $1 and action = 'join_whatsapp'`, [A.id]))[0]
  check('P3', 'WhatsApp tracking event is stored in Supabase', row?.completed === true, `route supabase=${r.data?.supabase} db=${row ? row.completed : '∅'}`)
}
let sA
{
  const r = await startSession(A)
  sA = r.data?.session
  const row = (await sql(`select status, assessment_no from public.assessment_sessions where id = $1`, [sA?.id || '00000000-0000-0000-0000-000000000000']))[0]
  check('P4', 'assessment start is stored in Supabase (in_progress)', row?.status === 'in_progress', `route supabase=${r.data?.supabase} db status=${row?.status ?? '∅'}`)
}
{
  const answers = { Q1: 'b', Q2: 'c', WRITING: 'I built a URL shortener with Redis caching.' }
  const r = await api(R.assessment, 'POST', '/api/user/assessment', {
    token: A.token, body: { session_id: sA.id, student_id: A.id, answers, status: 'in_progress', assessment_no: 1 },
  })
  const row = (await sql(`select answers from public.assessment_sessions where id = $1`, [sA.id]))[0]
  check('P5', 'autosave of answers is stored in Supabase', row?.answers?.Q1 === 'b', `route supabase=${r.data?.supabase} db has Q1=${row?.answers?.Q1 ?? '∅'}`)
}
const finalAnswers = { Q1: 'b', Q2: 'c', WRITING: 'I built a URL shortener with Redis caching.' }
{
  // doSubmit(): step 1 marks the session submitted, step 2 writes the result.
  await api(R.assessment, 'POST', '/api/user/assessment', {
    token: A.token, body: { session_id: sA.id, student_id: A.id, answers: finalAnswers, status: 'submitted', tab_switches: 0, submitted_at: new Date().toISOString(), assessment_no: 1 },
  })
  const r2 = await api(R.submit, 'POST', '/api/user/assessment/submit', {
    token: A.token, body: { session_id: sA.id, student_id: A.id, scores: scores(612), total: 612, grade: 'B', percentile: 71.2, verifiable_hash: 'sha256:abc-123', ai_feedback: {}, assessment_no: 1 },
  })
  const s = (await sql(`select status from public.assessment_sessions where id = $1`, [sA.id]))[0]
  const res = (await sql(`select total from public.assessment_results where session_id = $1`, [sA.id]))[0]
  check('P6', 'submit writes session AND result to Supabase', s?.status === 'submitted' && res?.total === 612,
    `route status=${r2.status} supabase=${r2.data?.supabase} db session=${s?.status ?? '∅'} result=${res?.total ?? '∅'}`)
  check('P7', 'submit response confirms the durable Supabase write', r2.status === 200 && r2.data?.supabase === true,
    `status=${r2.status} supabase=${r2.data?.supabase}`)
}

// ---- Fresh server instance: local JSON store is empty (serverless / redeploy) ---
const freshDir = fs.mkdtempSync(path.join(os.tmpdir(), 'calibi-fresh-'))
localDb.setDbDirectory(freshDir)
{
  const r = await api(R.scores, 'GET', `/api/user/scores?student_id=${A.id}`, { token: A.token })
  check('P8', 'dashboard reads the saved CalibiAI score after a restart', r.data?.result?.total === 612, `total=${r.data?.result?.total ?? 'null'}`)
  const rr = await api(R.resumeRead, 'GET', `/api/user/resume?student_id=${A.id}`, { token: A.token })
  check('P9', 'dashboard reads the saved resume analysis after a restart', !!rr.data?.analysis, `analysis=${rr.data?.analysis ? 'yes' : 'null'}`)
  const tr = await api(R.tracking, 'GET', `/api/user/tracking?user_id=${A.id}`, { token: A.token })
  const found = (tr.data?.tracking || []).some((e) => e.action === 'join_whatsapp' && e.completed)
  check('P10', 'tracking status is read back after a restart', found, `events=${(tr.data?.tracking || []).length}`)
}

// ---- Missing client id at submit (fixed/unfixed client race) ----------------------
{
  const sD = (await startSession(D)).data?.session
  const r = await api(R.submit, 'POST', '/api/user/assessment/submit', {
    token: D.token, body: { session_id: sD?.id, student_id: 'unknown', scores: scores(455), total: 455, grade: 'C', percentile: 50, verifiable_hash: 'h', ai_feedback: {}, assessment_no: 1 },
  })
  const s = (await sql(`select status from public.assessment_sessions where id = $1`, [sD?.id || '00000000-0000-0000-0000-000000000000']))[0]
  const res = (await sql(`select student_id, total from public.assessment_results where session_id = $1`, [sD?.id || '00000000-0000-0000-0000-000000000000']))[0]
  check('P11', 'submit with student_id "unknown" still stores the result for the real student',
    res?.total === 455 && res?.student_id === D.id && s?.status === 'submitted',
    `route status=${r.status} supabase=${r.data?.supabase} result=${res ? res.total + ' for ' + (res.student_id === D.id ? 'D' : 'other') : '∅'} session=${s?.status ?? '∅'}`)
}

// ---- Retry of an already-submitted session must be idempotent --------------------
{
  await api(R.submit, 'POST', '/api/user/assessment/submit', {
    token: A.token, body: { session_id: sA.id, student_id: A.id, scores: scores(612), total: 612, grade: 'B', percentile: 71.2, verifiable_hash: 'sha256:abc-123', ai_feedback: {}, assessment_no: 1 },
  })
  const n = (await sql(`select count(*)::int as n from public.assessment_results where session_id = $1`, [sA.id]))[0]?.n ?? 0
  check('P12', 'retrying a submit keeps exactly one result (idempotent)', n === 1, `rows=${n}`)
}

// ---- Atomicity: a failing result write must not leave the session half-submitted --
{
  const sC = (await startSession(C)).data?.session
  await emu.db.exec(`create or replace function public.emu_fail_result() returns trigger language plpgsql as $$
              begin if new.total = 999 then raise exception 'injected failure' using errcode = 'P0001'; end if; return new; end $$;
              drop trigger if exists emu_fail_result on public.assessment_results;
              create trigger emu_fail_result before insert on public.assessment_results for each row execute function public.emu_fail_result();`)
  await api(R.assessment, 'POST', '/api/user/assessment', {
    token: C.token, body: { session_id: sC.id, student_id: C.id, answers: { Q1: 'a' }, status: 'submitted', submitted_at: new Date().toISOString(), assessment_no: 1 },
  })
  const r = await api(R.submit, 'POST', '/api/user/assessment/submit', {
    token: C.token, body: { session_id: sC.id, student_id: C.id, scores: scores(999), total: 999, grade: 'S', percentile: 99, verifiable_hash: 'h', ai_feedback: {}, assessment_no: 1 },
  })
  const s = (await sql(`select status from public.assessment_sessions where id = $1`, [sC.id]))[0]
  const n = (await sql(`select count(*)::int as n from public.assessment_results where session_id = $1`, [sC.id]))[0].n
  // Correct: the write is all-or-nothing — the caller is told it failed and the session is not left "submitted" without a result.
  const atomic = !(s?.status === 'submitted' && n === 0)
  check('P13', 'a failed result write rolls the submit back (no half-submitted session)', atomic && r.status >= 400,
    `route status=${r.status} session=${s?.status ?? '∅'} results=${n}`)
  await emu.db.exec(`drop trigger if exists emu_fail_result on public.assessment_results; drop function if exists public.emu_fail_result();`)
}

// ---- A late autosave must never reopen a submitted attempt -----------------------
{
  await api(R.assessment, 'POST', '/api/user/assessment', {
    token: A.token, body: { session_id: sA.id, student_id: A.id, answers: { Q1: 'changed-after-submit' }, status: 'in_progress', assessment_no: 1 },
  })
  const s = (await sql(`select status, answers from public.assessment_sessions where id = $1`, [sA.id]))[0]
  check('P15', 'a late autosave cannot reopen or rewrite a submitted attempt',
    s?.status === 'submitted' && s?.answers?.Q1 === 'b', `db status=${s?.status ?? '∅'} Q1=${s?.answers?.Q1 ?? '∅'}`)
}

// ---- Privilege: a student must not be able to promote their own profile ---------
{
  // Plain PostgREST-style update as the student (RLS applies, no service role).
  let outcome
  await emu.db.exec('begin')
  try {
    await emu.db.exec(`set local role authenticated`)
    await emu.db.query(`select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)`, [J({ sub: C.id, role: 'authenticated' }), C.id])
    await emu.db.query(`update public.profiles set role = 'institution', institution_id = '00000000-0000-4000-8000-000000000001' where id = $1`, [C.id])
    outcome = 'updated'
    await emu.db.exec('commit')
  } catch (e) { outcome = 'blocked ' + e.code; await emu.db.exec('rollback') }
  const role = (await sql(`select role from public.profiles where id = $1`, [C.id]))[0]?.role
  check('L10', 'a student cannot change their own role / institution', role === 'student', `update=${outcome} role=${role}`)
}

// ---- Starting a new attempt expires the previous one, atomically -----------------
{
  const s1 = (await startSession(C)).data?.session
  const s2 = (await startSession(C)).data?.session
  const active = await sql(`select id from public.assessment_sessions where student_id = $1 and status = 'in_progress' and assessment_no = 1`, [C.id])
  check('P14', 'a new attempt expires the previous one (exactly one active)', active.length === 1 && active[0].id === s2?.id,
    `active=${active.length} s1=${s1?.id?.slice(0, 8)} s2=${s2?.id?.slice(0, 8)}`)
}

// ---- Leakage: anonymous and cross-student access ---------------------------------
{
  const r = await api(R.profile, 'GET', `/api/user/profile?user_id=${A.id}`, {})
  const leaked = !!(r.data?.profile || r.data?.profile === null && false)
  const phone = r.data?.profile?.phone
  check('L1', 'anonymous caller cannot read a student profile (PII)', r.status >= 400 && !phone, `status=${r.status} phone=${phone ?? '∅'}`)
  void leaked
}
{
  const r = await api(R.profile, 'POST', '/api/user/profile', { body: profileBody(A.id, { full_name: 'PWNED' }) })
  const name = (await sql(`select full_name from public.profiles where id = $1`, [A.id]))[0]?.full_name ?? null
  check('L2', 'anonymous caller cannot overwrite a student profile', r.status >= 400 && name !== 'PWNED', `status=${r.status} name=${name}`)
}
{
  const r = await api(R.scores, 'GET', `/api/user/scores?student_id=${A.id}`, { token: B.token })
  check('L3', 'another student cannot read my CalibiAI score', !r.data?.result, `status=${r.status} result=${r.data?.result ? 'LEAKED total ' + r.data.result.total : 'none'}`)
}
{
  const r = await api(R.submit, 'POST', '/api/user/assessment/submit', {
    token: B.token, body: { session_id: sA.id, student_id: A.id, scores: scores(1), total: 1, grade: 'D', percentile: 1, verifiable_hash: 'x', ai_feedback: {}, assessment_no: 1 },
  })
  const total = (await sql(`select total from public.assessment_results where session_id = $1`, [sA.id]))[0]?.total ?? null
  check('L4', 'another student cannot overwrite my submitted result', total === 612, `status=${r.status} total=${total}`)
}
{
  const r = await api(R.scores, 'GET', `/api/user/scores?student_id=${A.id}`, {})
  check('L5', 'anonymous caller cannot read scores by student id', !r.data?.result, `status=${r.status} result=${r.data?.result ? 'LEAKED' : 'none'}`)
}
{
  const r = await api(R.resumeRead, 'GET', `/api/user/resume?student_id=${A.id}`, {})
  check('L6', 'anonymous caller cannot read a resume analysis', !r.data?.analysis, `status=${r.status} analysis=${r.data?.analysis ? 'LEAKED' : 'none (store empty; see P9)'}`)
}
{
  const r = await api(R.feedback, 'POST', '/api/feedback', {
    body: { student_id: A.id, email: A.email, rating: 1, message: 'forged: submitted by someone else', source: 'web' },
  })
  const row = (await sql(`select student_id from public.feedback_submissions where message like 'forged:%' order by created_at desc limit 1`))[0]
  check('L7', 'feedback cannot be attributed to a student without that student signing in',
    !row || row.student_id === null, `status=${r.status} attributed_to=${row ? (row.student_id ? 'student A' : 'nobody') : '∅'}`)
}
{
  const r = await api(R.help, 'POST', '/api/help', {
    body: { id: 'help_forged_1', student_id: A.id, email: A.email, phone: '9822011111', message: 'forged help request text', page: '/x' },
  })
  const row = (await sql(`select student_id from public.help_requests where message = 'forged help request text'`))[0]
  check('L8', 'help requests cannot be attributed to a student without signing in',
    !row || row.student_id === null, `status=${r.status} attributed_to=${row ? (row.student_id ? 'student A' : 'nobody') : '∅'}`)
}

// ---- Admin: end-to-end visibility and access ------------------------------------
{
  const { signSession } = await import(pathToFileURL(path.join(REPO, 'lib/adminAuth.ts')).href)
  // The admin console's own session cookie (what /api/admin/login sets).
  const cookie = `calibiai_admin_session=${signSession()}`
  const r = await api(R.adminStudents, 'GET', '/api/admin/students?page=1&pageSize=50', { cookie })
  const rows = r.data?.students || r.data?.rows || []
  const me = rows.find((x) => x.student_id === A.id || x.id === A.id)
  if (MODE === 'service') {
    check('A1', 'admin sees the student end-to-end (profile + resume + CalibiAI score)',
      !!me && me.college === 'PCCOE' && String(me.score) === '612' && String(me.resume_score || '') !== '' && String(me.resume_score) !== '0',
      me ? `college=${me.college} score=${me.score} resume=${me.resume_score}` : `status=${r.status} rows=${rows.length} ${r.data?.error || ''}`)
  } else {
    check('A1', 'admin is told the service role key is required (no silent empty list)',
      r.status >= 500 || /service.?role/i.test(JSON.stringify(r.data || '')) || !!(r.data?.warning),
      `status=${r.status} warning=${String(r.data?.warning || r.data?.error || '').slice(0, 120)}`)
  }
}
{
  // Forged admin session: sign with the publicly known default secret.
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + 3600_000 })).toString('base64url')
  const crypto = await import('node:crypto')
  const sig = crypto.createHmac('sha256', 'calibiai-admin-local-secret-change-me').update(payload).digest('hex')
  const r = await api(R.adminStudents, 'GET', '/api/admin/students?page=1&pageSize=5', { cookie: `calibiai_admin_session=v1.${payload}.${sig}` })
  check('L9', 'a forged admin session (public default secret) is rejected', r.status === 401, `status=${r.status}`)
}

// ---- Company assessments: a second stream of student data ----------------------
{
  const co = await route('app/api/company-assessments/start/route.ts')
  const cs = await route('app/api/company-assessments/submit/route.ts')
  const ca = await route('app/api/company-assessments/attempt/route.ts')
  const started = await api(co, 'POST', '/api/company-assessments/start', { token: A.token, body: { student_id: A.id, company: 'tcs' } })
  const row = (await sql(`select status from public.company_assessment_attempts where student_id = $1 and company_slug = 'tcs'`, [A.id]))[0]
  if (MODE === 'service') {
    check('C1', 'company assessment start is stored in Supabase', started.status === 200 && row?.status === 'in_progress',
      `route status=${started.status} db=${row?.status ?? '∅'}`)
  } else {
    check('C1', 'company assessment start is refused with a clear error when it cannot be stored',
      started.status === 503 && !row, `route status=${started.status} ${String(started.data?.error || '').slice(0, 80)}`)
  }
  if (MODE === 'service') {
    const submitted = await api(cs, 'POST', '/api/company-assessments/submit', { token: A.token, body: { student_id: A.id, company: 'tcs', answers: {}, proctoring: {}, auto: false } })
    const done = (await sql(`select status, score from public.company_assessment_attempts where student_id = $1 and company_slug = 'tcs'`, [A.id]))[0]
    check('C2', 'company assessment submit is stored in Supabase', submitted.status === 200 && done?.status === 'submitted' && done?.score != null,
      `route status=${submitted.status} db status=${done?.status ?? '∅'} score=${done?.score ?? '∅'}`)
  }
  const peek = await api(ca, 'GET', `/api/company-assessments/attempt?student_id=${A.id}&company=tcs`, { token: B.token })
  check('C3', 'another student cannot read my company assessment attempt', !peek.data?.attempt && peek.status >= 400,
    `status=${peek.status} attempt=${peek.data?.attempt ? 'LEAKED' : 'none'}`)
}

// ---- report -----------------------------------------------------------------------
const failed = results.filter(r => !r.pass)
fs.writeFileSync(OUT, JSON.stringify({ mode: MODE, results }, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} checks pass in mode=${MODE}  (report: ${OUT})`)
void storeDir
process.exit(0)
