import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

import { calibiFromSources } from '../calibiScore.ts'
import { COMPANIES } from '../company/catalog.ts'

// Runs the real Supabase schema + migrations on PostgreSQL (PGlite / WASM) and
// proves that the SQL CalibiAI average (migration 0010, used for admin sorting
// and stat cards) equals lib/calibiScore.ts for every student — and that both
// the fresh-install path (schema.sql) and the upgrade path (0006 → 0008 →
// 0009 → 0010) apply cleanly. 0008 used to fail on any database with 0006.

const STUBS = `
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.role() returns text language sql stable as $$ select 'authenticated'::text $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text, public boolean default false);
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
create or replace function storage.filename(name text) returns text language sql immutable as $$ select (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)] $$;
create or replace function storage.extension(name text) returns text language sql immutable as $$ select split_part(name, '.', 2) $$;
`
const read = (f: string) => fs.readFileSync(f, 'utf8')

async function freshDb(): Promise<PGlite> {
  const db = new PGlite({ extensions: { pgcrypto } })
  await db.exec(STUBS)
  await db.exec(read('supabase/schema.sql'))
  return db
}

// Deterministic PRNG so failures are reproducible.
function rng(seed: number) {
  let x = seed >>> 0 || 1
  return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296 }
}
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

interface Seeded {
  id: string
  a1: number | null
  a2: number | null
  company: Array<{ company: string; status: string; score: number | null }>
}

async function seed(db: PGlite, count: number, seedNo: number): Promise<Seeded[]> {
  const r = rng(seedNo)
  const out: Seeded[] = []
  let n = 1
  const sql: string[] = []
  for (let i = 0; i < count; i++) {
    const id = uuid(1000 + i)
    sql.push(`insert into auth.users (id, email) values ('${id}', 's${i}@x.com')`)
    // schema.sql's signup trigger already created the profile — fill it in.
    sql.push(`insert into public.profiles (id, email, full_name, college) values ('${id}', 's${i}@x.com', 'Student ${i}', 'College ${i % 3}')
      on conflict (id) do update set full_name = excluded.full_name, college = excluded.college`)
    const s: Seeded = { id, a1: null, a2: null, company: [] }
    const addResult = (no: number, total: number, minutesAgo: number) => {
      const sid = uuid(500000 + n++)
      sql.push(`insert into public.assessment_sessions (id, student_id, status, submitted_at, assessment_no) values ('${sid}', '${id}', 'submitted', now() - interval '${minutesAgo} minutes', ${no})`)
      sql.push(`insert into public.assessment_results (id, session_id, student_id, scores, total, grade, created_at, assessment_no) values ('${uuid(900000 + n++)}', '${sid}', '${id}', '{"assessment_no": ${no}}', ${total}, 'B', now() - interval '${minutesAgo} minutes', ${no})`)
    }
    if (r() < 0.75) {
      if (r() < 0.3) addResult(1, Math.floor(r() * 1001), 500) // an older, superseded attempt
      s.a1 = Math.floor(r() * 1001)
      addResult(1, s.a1, 300)
      if (r() < 0.5) {
        s.a2 = Math.floor(r() * 1001)
        addResult(2, s.a2, 100) // newer than A1 — must not leak into the A1 columns
      }
    }
    const k = Math.floor(r() * 5)
    const picks = new Set<string>()
    while (picks.size < k) picks.add(COMPANIES[Math.floor(r() * COMPANIES.length)].slug)
    for (const slug of picks) {
      const roll = r()
      const status = roll < 0.2 ? 'in_progress' : roll < 0.35 ? 'expired' : 'submitted'
      const score = status === 'in_progress' ? null : Math.round(r() * 1000) / 10
      s.company.push({ company: slug, status, score })
      sql.push(`insert into public.company_assessment_attempts (id, student_id, company_slug, status, paper, expires_at, duration_sec, score, submitted_at)
        values ('${uuid(700000 + n++)}', '${id}', '${slug}', '${status}', '{"rounds":[]}', now() + interval '1 hour', 6000, ${score === null ? 'null' : score}, ${status === 'in_progress' ? 'null' : 'now()'})`)
    }
    out.push(s)
  }
  await db.exec(sql.join(';\n') + ';')
  return out
}

async function assertParity(db: PGlite, students: Seeded[]) {
  const rows = await db.query<any>(`select student_id, calibi_score, assessments_taken, company_taken, talent_score, assessment2_score from public.student_profiles_full`)
  const byId = new Map(rows.rows.map((x) => [x.student_id, x]))
  let compared = 0
  for (const s of students) {
    const v = byId.get(s.id)
    assert.ok(v, `missing ${s.id} in the view`)
    const ts = calibiFromSources({ a1: s.a1 === null ? null : { total: s.a1 }, a2: s.a2 === null ? null : { total: s.a2 }, company: s.company })
    assert.equal(v.calibi_score, ts.score, `calibi_score for ${s.id}: SQL ${v.calibi_score} vs TS ${ts.score}`)
    assert.equal(Number(v.assessments_taken), ts.count, `assessments_taken for ${s.id}`)
    assert.equal(Number(v.company_taken), s.company.filter((c) => c.status !== 'in_progress').length)
    // Assessment 1 columns come strictly from assessment_no = 1.
    assert.equal(v.talent_score, s.a1)
    assert.equal(v.assessment2_score, s.a2)
    if (ts.score !== null) compared++
  }
  return compared
}

test('migration 0010: fresh install (schema.sql) — SQL CalibiAI average equals lib/calibiScore.ts', { timeout: 180_000 }, async () => {
  const db = await freshDb()
  const students = await seed(db, 40, 7)
  const compared = await assertParity(db, students)
  assert.ok(compared >= 25, `only ${compared} students with a score`)

  const stats = await db.query<any>('select * from public.admin_stats')
  const s = stats.rows[0]
  const withScore = students.map((x) => calibiFromSources({ a1: x.a1 === null ? null : { total: x.a1 }, a2: x.a2 === null ? null : { total: x.a2 }, company: x.company }).score).filter((x): x is number => x !== null)
  assert.equal(s.calibi_students, withScore.length)
  assert.equal(s.avg_calibi, Math.round(withScore.reduce((a, b) => a + b, 0) / withScore.length))
  assert.equal(s.company_attempts_completed, students.reduce((a, x) => a + x.company.filter((c) => c.status !== 'in_progress').length, 0))
  assert.equal(s.total_students, 40)

  const probe = await db.query<any>('select company_count, company_stamp from public.admin_change_probe')
  assert.equal(probe.rows[0].company_count, students.reduce((a, x) => a + x.company.length, 0))

  // Re-running the migrations is safe (idempotent).
  await db.exec(read('supabase/migrations/0008_assessment_no.sql'))
  await db.exec(read('supabase/migrations/0009_company_assessments.sql'))
  await db.exec(read('supabase/migrations/0010_calibiai_average.sql'))
  await db.exec(read('supabase/migrations/0010_calibiai_average.sql'))
  await assertParity(db, students)
})

test('migration 0010: upgrade path 0006 → 0008 → 0009 → 0010 applies and stays consistent', { timeout: 180_000 }, async () => {
  const db = await freshDb()
  const students = await seed(db, 20, 11)
  // Roll the views back to the 0006 shape (not assessment-aware, admin_stats depends on it)…
  await db.exec(read('supabase/migrations/0006_admin_attempted_and_stats.sql'))
  // …then upgrade. 0008 must drop admin_stats before the view it depends on.
  await db.exec(read('supabase/migrations/0008_assessment_no.sql'))
  const mid = await db.query<any>('select assessed_students from public.admin_stats')
  assert.ok(mid.rows[0].assessed_students >= 0)
  await db.exec(read('supabase/migrations/0009_company_assessments.sql'))
  await db.exec(read('supabase/migrations/0010_calibiai_average.sql'))
  await assertParity(db, students)
})

test('migration 0010: refuses to run before 0009 with a clear message', { timeout: 120_000 }, async () => {
  const db = new PGlite({ extensions: { pgcrypto } })
  await db.exec(STUBS)
  await db.exec(`create table public.profiles (id uuid primary key); create table public.assessment_sessions (id uuid primary key, answers jsonb); create table public.assessment_results (id uuid primary key, scores jsonb)`)
  await assert.rejects(db.exec(read('supabase/migrations/0010_calibiai_average.sql')), /0009_company_assessments/)
})
