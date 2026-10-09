import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const migration = fs.readFileSync('supabase/migrations/0012_atomic_assessment_persistence.sql', 'utf8')

async function database() {
  const db = new PGlite({ extensions: { pgcrypto } })
  await db.exec(`
    create schema if not exists auth;
    create table auth.users (
      id uuid primary key,
      email text,
      raw_user_meta_data jsonb default '{}'::jsonb,
      email_confirmed_at timestamptz,
      last_sign_in_at timestamptz,
      created_at timestamptz default now()
    );
    create or replace function auth.uid() returns uuid
      language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create or replace function auth.role() returns text language sql stable as $$ select 'authenticated'::text $$;
    create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
    do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
    do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
    do $$ begin create role service_role nologin; exception when duplicate_object then null; end $$;
    create schema if not exists storage;
    create table storage.buckets (id text primary key, name text, public boolean default false);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
    create or replace function storage.foldername(name text) returns text[]
      language sql immutable as $$ select string_to_array(name, '/') $$;
    create or replace function storage.filename(name text) returns text
      language sql immutable as $$ select (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)] $$;
    create or replace function storage.extension(name text) returns text
      language sql immutable as $$ select split_part(name, '.', 2) $$;
  `)
  await db.exec(fs.readFileSync('supabase/schema.sql', 'utf8'))
  // Run the upgrade migration exactly as a production database would, and make
  // sure the function/permission definitions are safe to replay.
  await db.exec(migration)
  await db.exec(migration)
  return db
}

const sessionPayload = (id: string, studentId: string, status = 'in_progress', answers: Record<string, unknown> = {}) => ({
  id,
  student_id: studentId,
  assessment_no: 1,
  status,
  started_at: new Date(Date.now() - 60_000).toISOString(),
  expires_at: new Date(Date.now() + 7_200_000).toISOString(),
  duration_sec: 7200,
  question_seed: 4321,
  tab_switches: 0,
  answers,
  created_at: new Date().toISOString(),
})

const resultPayload = (sessionId: string, studentId: string, overrides: Record<string, unknown> = {}) => ({
  id: uuid(901),
  session_id: sessionId,
  student_id: studentId,
  assessment_no: 1,
  scores: { assessment_no: 1, total: 760, english: { total: 165 } },
  total: 760,
  grade: 'A',
  percentile: 84.2,
  verifiable_hash: 'sha256:test',
  ai_feedback: { writing: { notes: 'Clear structure' } },
  created_at: new Date().toISOString(),
  ...overrides,
})

test('assessment persistence migration: start RPC is idempotent and owner-bound', { timeout: 120_000 }, async () => {
  const db = await database()
  const studentId = uuid(101)
  const sessionId = uuid(201)
  const retryId = uuid(202)
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'student@example.com', '{"role":"student"}')`, [studentId])

  const first = await db.query<any>(
    'select public.persist_assessment_session($1::jsonb, true) as saved',
    [JSON.stringify(sessionPayload(sessionId, studentId))],
  )
  assert.equal(first.rows[0].saved.id, sessionId)
  assert.equal(first.rows[0].saved.student_id, studentId)

  // Retrying a start with a different client-generated id must return the
  // canonical in-progress attempt without replacing its timer or paper seed.
  const retry = await db.query<any>(
    'select public.persist_assessment_session($1::jsonb, true) as saved',
    [JSON.stringify({ ...sessionPayload(retryId, studentId), question_seed: 9999 })],
  )
  assert.equal(retry.rows[0].saved.id, sessionId)
  assert.equal(Number(retry.rows[0].saved.question_seed), 4321)
  const count = await db.query<any>('select count(*)::int as n from public.assessment_sessions where student_id = $1', [studentId])
  assert.equal(count.rows[0].n, 1)

  const otherStudent = uuid(102)
  const forged = { ...sessionPayload(sessionId, otherStudent, 'submitted'), status: 'submitted' }
  await assert.rejects(
    db.query('select public.persist_assessment_session($1::jsonb, false)', [JSON.stringify({ ...forged, status: 'in_progress' })]),
    /owner mismatch|permission denied/i,
  )
  const unchanged = await db.query<any>('select status from public.assessment_sessions where id = $1', [sessionId])
  assert.equal(unchanged.rows[0].status, 'in_progress')
  await db.close()
})

test('assessment submission RPC atomically finalizes session and inserts full result; retries are idempotent', { timeout: 120_000 }, async () => {
  const db = await database()
  const studentId = uuid(111)
  const sessionId = uuid(211)
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'atomic@example.com', '{"role":"student"}')`, [studentId])
  await db.query(
    'select public.persist_assessment_session($1::jsonb, true)',
    [JSON.stringify(sessionPayload(sessionId, studentId))],
  )

  // Force an insert-time cast error after the session UPDATE. PostgreSQL must
  // roll the UPDATE back as part of the same function-call transaction.
  const invalid = resultPayload(sessionId, studentId, { percentile: 'not-a-number' })
  await assert.rejects(
    db.query('select public.submit_assessment_attempt($1::jsonb, $2::jsonb)', [
      JSON.stringify(sessionPayload(sessionId, studentId, 'submitted', { EL1: 'b' })),
      JSON.stringify(invalid),
    ]),
    /invalid input syntax/i,
  )
  const rolledBack = await db.query<any>('select status, answers from public.assessment_sessions where id = $1', [sessionId])
  assert.equal(rolledBack.rows[0].status, 'in_progress')
  assert.deepEqual(rolledBack.rows[0].answers, {})
  const noResult = await db.query<any>('select count(*)::int as n from public.assessment_results where session_id = $1', [sessionId])
  assert.equal(noResult.rows[0].n, 0)

  const submitted = await db.query<any>(
    'select public.submit_assessment_attempt($1::jsonb, $2::jsonb) as saved',
    [
      JSON.stringify(sessionPayload(sessionId, studentId, 'submitted', { EL1: 'b', WR1: 'answer' })),
      JSON.stringify(resultPayload(sessionId, studentId)),
    ],
  )
  assert.equal(submitted.rows[0].saved.session.status, 'submitted')
  assert.deepEqual(submitted.rows[0].saved.session.answers, { EL1: 'b', WR1: 'answer' })
  assert.equal(submitted.rows[0].saved.result.session_id, sessionId)
  assert.equal(submitted.rows[0].saved.result.student_id, studentId)
  assert.equal(Number(submitted.rows[0].saved.result.total), 760)
  assert.deepEqual(submitted.rows[0].saved.result.scores, { total: 760, english: { total: 165 }, assessment_no: 1 })

  // A retry with changed payload returns the first committed result and does
  // not create duplicates or overwrite the accepted score.
  const again = await db.query<any>(
    'select public.submit_assessment_attempt($1::jsonb, $2::jsonb) as saved',
    [
      JSON.stringify(sessionPayload(sessionId, studentId, 'submitted', { EL1: 'changed' })),
      JSON.stringify(resultPayload(sessionId, studentId, { total: 100, grade: 'D', scores: { total: 100 } })),
    ],
  )
  assert.equal(Number(again.rows[0].saved.result.total), 760)
  assert.deepEqual(again.rows[0].saved.session.answers, { EL1: 'b', WR1: 'answer' })
  const counts = await db.query<any>(
    `select
       (select count(*)::int from public.assessment_sessions where id = $1) as sessions,
       (select count(*)::int from public.assessment_results where session_id = $1) as results`,
    [sessionId],
  )
  assert.equal(counts.rows[0].sessions, 1)
  assert.equal(counts.rows[0].results, 1)
  await db.close()
})

test('assessment RPCs cannot be executed by authenticated or anonymous browser roles', { timeout: 120_000 }, async () => {
  const db = await database()
  await db.exec('set role authenticated')
  await assert.rejects(
    db.query('select public.persist_assessment_session($1::jsonb, true)', [JSON.stringify(sessionPayload(uuid(301), uuid(103))) ]),
    /permission denied/i,
  )
  await db.exec('reset role')
  await db.exec('set role anon')
  await assert.rejects(
    db.query('select public.submit_assessment_attempt($1::jsonb, $2::jsonb)', [
      JSON.stringify(sessionPayload(uuid(301), uuid(103), 'submitted')),
      JSON.stringify(resultPayload(uuid(301), uuid(103))),
    ]),
    /permission denied/i,
  )
  await db.exec('reset role')
  await db.close()
})
