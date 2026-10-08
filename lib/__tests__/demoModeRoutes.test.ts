import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

// Demo mode (no Supabase configured): the same routes must still run end to end
// against the local JSON store, as the README promises.

register(new URL('../../scripts/supabase-e2e/alias-hooks.mjs', import.meta.url))

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')
const route = (rel: string) => import(pathToFileURL(path.join(REPO, rel)).href)

const STUDENT = 'u_demo_student_1'

async function call(mod: any, method: 'GET' | 'POST', url: string, body?: unknown) {
  const req = new Request(`http://localhost${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const res = method === 'GET' ? await mod.GET(req) : await mod.POST(req)
  return { status: res.status, data: await res.json() }
}

test('demo mode: onboarding, attempt, autosave, submit and the dashboard all work on the local store', async () => {
  const saved = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY }
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'calibi-demo-'))
  const db = await import(pathToFileURL(path.join(REPO, 'lib/db.ts')).href)
  db.setDbDirectory(dir)
  try {
    const profile = await route('app/api/user/profile/route.ts')
    const session = await route('app/api/user/session/route.ts')
    const assessment = await route('app/api/user/assessment/route.ts')
    const submit = await route('app/api/user/assessment/submit/route.ts')
    const scores = await route('app/api/user/scores/route.ts')

    const p = await call(profile, 'POST', '/api/user/profile', {
      user_id: STUDENT, email: 'demo.student@example.com', full_name: 'Demo Student', prn: 'DEMO2026001',
      phone: '9822011111', gender: 'Male', degree: 'B.Tech', college: 'Demo College', graduation_year: 2026, cgpa: 8, skills: 'Python',
    })
    assert.equal(p.status, 200, JSON.stringify(p.data))
    assert.equal(p.data.stored, 'local')

    const s = await call(session, 'POST', '/api/user/session', { student_id: STUDENT, question_seed: 7, assessment_no: 1 })
    assert.equal(s.status, 200, JSON.stringify(s.data))
    const id = s.data.session.id as string

    const a = await call(assessment, 'POST', '/api/user/assessment', { session_id: id, student_id: STUDENT, answers: { Q1: 'b' }, status: 'in_progress', assessment_no: 1 })
    assert.equal(a.status, 200, JSON.stringify(a.data))

    const r = await call(submit, 'POST', '/api/user/assessment/submit', {
      session_id: id, student_id: STUDENT, answers: { Q1: 'b' }, status: 'submitted', assessment_no: 1,
      scores: { total: 612, grade: 'B' }, total: 612, grade: 'B', percentile: 71.2, verifiable_hash: 'h', ai_feedback: {},
    })
    assert.equal(r.status, 200, JSON.stringify(r.data))
    assert.equal(r.data.result.total, 612)

    const read = await call(scores, 'GET', `/api/user/scores?student_id=${STUDENT}`)
    assert.equal(read.data.result?.total, 612, 'the dashboard reads the saved score')
  } finally {
    if (saved.url !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = saved.url
    if (saved.key !== undefined) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = saved.key
    db.resetDbCache()
  }
})
