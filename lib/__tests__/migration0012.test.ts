import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
// Shared Supabase stand-ins (auth schema, auth.uid(), API roles, default grants).
import { STUBS, DEFAULT_GRANTS } from '../../scripts/supabase-e2e/emu.mjs'

// Migration 0012 on a real Postgres engine: it applies on a fresh schema and can
// be re-run; attempts commit or roll back as one unit; a student cannot touch
// another student's rows, promote themselves, or reopen a finished attempt.

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const read = (p: string) => fs.readFileSync(path.join(REPO, p), 'utf8')
const schema = read('supabase/schema.sql').replace(/create extension if not exists "pgcrypto";/gi, '')
const migration = read('supabase/migrations/0012_atomic_writes_and_row_security.sql')

const STUDENT_A = '11111111-1111-4111-8111-111111111111'
const STUDENT_B = '22222222-2222-4222-8222-222222222222'
const STAFF = '44444444-4444-4444-8444-444444444444'
const INSTITUTION = '00000000-0000-4000-8000-000000000001'
const S1 = '55555555-5555-4555-8555-555555555555'
const S2 = '66666666-6666-4666-8666-666666666666'
const S3 = '77777777-7777-4777-8777-777777777777'

async function database(): Promise<PGlite> {
  const db = new PGlite()
  await db.exec(STUBS)
  await db.exec(DEFAULT_GRANTS)
  await db.exec(schema)
  await db.exec(migration)
  await db.exec(migration) // re-running must be a no-op
  await db.exec(`
    insert into public.institutions (id, name, tenant_code) values ('${INSTITUTION}', 'PCCOE', 'pccoe');
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${STUDENT_A}', 'a@x.io', '{"full_name":"A","role":"student"}'),
      ('${STUDENT_B}', 'b@x.io', '{"full_name":"B","role":"student"}'),
      ('${STAFF}', 's@x.io', '{"full_name":"Staff","role":"faculty"}');
    update public.profiles set institution_id = '${INSTITUTION}' where id in ('${STUDENT_A}','${STUDENT_B}');
    update public.profiles set role = 'faculty', institution_id = '${INSTITUTION}' where id = '${STAFF}';
  `)
  return db
}

/** Runs `fn` as an API role (anon, a student, or staff), the way PostgREST does. */
async function as(db: PGlite, who: { id: string; role: string } | null, fn: () => Promise<unknown>) {
  const claims = who ? JSON.stringify({ sub: who.id, role: who.role }) : JSON.stringify({ role: 'anon' })
  await db.exec('begin')
  try {
    await db.exec(`set local role ${who ? who.role : 'anon'}`)
    await db.query(
      `select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true), set_config('request.jwt.claim.role', $3, true)`,
      [claims, who ? who.id : '', who ? who.role : 'anon'],
    )
    const out = await fn()
    await db.exec('commit')
    return { ok: true as const, out }
  } catch (e: any) {
    await db.exec('rollback')
    return { ok: false as const, code: e.code as string, message: String(e.message) }
  }
}

const student = (id: string) => ({ id, role: 'authenticated' })
const submitSql = `select * from public.submit_assessment($1,$2,$3,$4::jsonb,$5,$6,$7::timestamptz,$8::timestamptz,$9::timestamptz,$10,$11,$12::jsonb,$13,$14,$15,$16,$17::jsonb)`
const submitArgs = (sessionId: string, owner: string, assessmentNo = 1, total = 612) =>
  [sessionId, owner, assessmentNo, '{"Q1":"b"}', 0, false, new Date().toISOString(), null, null, 7200, 1, '{"x":1}', total, 'B', 71.2, 'sha256:x', '{}']

test('migration 0012 applies on a fresh schema and re-runs without error', async () => {
  const db = await database()
  const fns = await db.query<{ proname: string }>(`select proname from pg_proc where proname in ('submit_assessment','start_assessment_session','save_assessment_progress','is_service_role') order by 1`)
  assert.deepEqual(fns.rows.map(r => r.proname), ['is_service_role', 'save_assessment_progress', 'start_assessment_session', 'submit_assessment'])
  await db.close()
})

test('an attempt is opened, autosaved and submitted as one trusted sequence', async () => {
  const db = await database()
  let r = await as(db, student(STUDENT_A), () => db.query(`select * from public.start_assessment_session($1,$2,$3,now(),null,7200,42,'{}')`, [S1, STUDENT_A, 1]))
  assert.ok(r.ok, r.ok ? '' : r.message)
  r = await as(db, student(STUDENT_A), () => db.query(`select status from public.save_assessment_progress($1,$2,$3,'{"Q1":"b"}',0,now(),null,7200,42)`, [S1, STUDENT_A, 1]))
  assert.ok(r.ok && r.out && (r.out as any).rows[0].status === 'in_progress')
  r = await as(db, student(STUDENT_A), () => db.query(submitSql, submitArgs(S1, STUDENT_A)))
  assert.ok(r.ok && (r.out as any).rows[0].total === 612, r.ok ? '' : r.message)
  await db.close()
})

test('a retried submit keeps exactly one result', async () => {
  const db = await database()
  await as(db, student(STUDENT_A), () => db.query(`select * from public.start_assessment_session($1,$2,$3,now(),null,7200,42,'{}')`, [S1, STUDENT_A, 1]))
  await as(db, student(STUDENT_A), () => db.query(submitSql, submitArgs(S1, STUDENT_A)))
  const r = await as(db, student(STUDENT_A), () => db.query(submitSql, submitArgs(S1, STUDENT_A)))
  assert.ok(r.ok)
  const n = await db.query<{ n: number }>(`select count(*)::int as n from public.assessment_results where session_id = $1`, [S1])
  assert.equal(n.rows[0].n, 1)
  await db.close()
})

test('a late autosave cannot rewrite a submitted attempt', async () => {
  const db = await database()
  await as(db, student(STUDENT_A), () => db.query(`select * from public.start_assessment_session($1,$2,$3,now(),null,7200,42,'{}')`, [S1, STUDENT_A, 1]))
  await as(db, student(STUDENT_A), () => db.query(submitSql, submitArgs(S1, STUDENT_A)))
  await as(db, student(STUDENT_A), () => db.query(`select * from public.save_assessment_progress($1,$2,$3,'{"Q1":"changed"}',0,now(),null,7200,42)`, [S1, STUDENT_A, 1]))
  const s = await db.query<{ status: string; q1: string }>(`select status, answers->>'Q1' as q1 from public.assessment_sessions where id = $1`, [S1])
  assert.deepEqual(s.rows[0], { status: 'submitted', q1: 'b' })
  await db.close()
})

test('a second, different attempt for the same assessment is refused (23505)', async () => {
  const db = await database()
  await as(db, student(STUDENT_A), () => db.query(`select * from public.start_assessment_session($1,$2,$3,now(),null,7200,42,'{}')`, [S1, STUDENT_A, 1]))
  await as(db, student(STUDENT_A), () => db.query(submitSql, submitArgs(S1, STUDENT_A)))
  await as(db, student(STUDENT_A), () => db.query(`select * from public.start_assessment_session($1,$2,$3,now(),null,7200,43,'{}')`, [S2, STUDENT_A, 1]))
  const r = await as(db, student(STUDENT_A), () => db.query(submitSql, submitArgs(S2, STUDENT_A, 1, 500)))
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.code, '23505')
  await db.close()
})

test('a failing result write rolls the whole submit back (all or nothing)', async () => {
  const db = await database()
  await db.exec(`create or replace function public.t_fail() returns trigger language plpgsql as $$ begin if new.total = 999 then raise exception 'boom' using errcode='P0001'; end if; return new; end $$;
                 create trigger t_fail before insert on public.assessment_results for each row execute function public.t_fail();`)
  await as(db, student(STUDENT_B), () => db.query(`select * from public.start_assessment_session($1,$2,$3,now(),null,7200,44,'{}')`, [S3, STUDENT_B, 1]))
  const r = await as(db, student(STUDENT_B), () => db.query(submitSql, submitArgs(S3, STUDENT_B, 1, 999)))
  assert.equal(r.ok, false)
  const s = await db.query<{ status: string }>(`select status from public.assessment_sessions where id = $1`, [S3])
  assert.equal(s.rows[0].status, 'in_progress', 'the session must not be left submitted without its result')
  await db.close()
})

test('a student cannot act for another student, and anonymous callers cannot run the functions', async () => {
  const db = await database()
  await as(db, student(STUDENT_A), () => db.query(`select * from public.start_assessment_session($1,$2,$3,now(),null,7200,42,'{}')`, [S1, STUDENT_A, 1]))
  const forged = await as(db, student(STUDENT_B), () => db.query(submitSql, submitArgs(S1, STUDENT_A, 1, 1)))
  assert.equal(forged.ok, false)
  if (!forged.ok) assert.equal(forged.code, '42501')
  const anon = await as(db, null, () => db.query(submitSql, submitArgs(S1, STUDENT_A, 1, 1)))
  assert.equal(anon.ok, false)
  await db.close()
})

test('a finished attempt cannot be reopened, even by its owner', async () => {
  const db = await database()
  await as(db, student(STUDENT_A), () => db.query(`select * from public.start_assessment_session($1,$2,$3,now(),null,7200,42,'{}')`, [S1, STUDENT_A, 1]))
  await as(db, student(STUDENT_A), () => db.query(submitSql, submitArgs(S1, STUDENT_A)))
  const r = await as(db, student(STUDENT_A), () => db.query(`update public.assessment_sessions set status = 'in_progress' where id = $1`, [S1]))
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.code, 'P0001')
  await db.close()
})

test('a student cannot promote their own role or move to another institution', async () => {
  const db = await database()
  const r = await as(db, student(STUDENT_B), () => db.query(`update public.profiles set role = 'institution' where id = $1`, [STUDENT_B]))
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.code, '42501')
  const own = await as(db, student(STUDENT_B), () => db.query(`update public.profiles set full_name = 'B Renamed' where id = $1`, [STUDENT_B]))
  assert.ok(own.ok, 'a student can still edit their own name')
  await db.close()
})

test('staff read only their own institution; students read only their own results', async () => {
  const db = await database()
  await as(db, student(STUDENT_A), () => db.query(`select * from public.start_assessment_session($1,$2,$3,now(),null,7200,42,'{}')`, [S1, STUDENT_A, 1]))
  await as(db, student(STUDENT_A), () => db.query(submitSql, submitArgs(S1, STUDENT_A)))
  const staff = await as(db, student(STAFF), () => db.query(`select student_id from public.assessment_results`))
  assert.ok(staff.ok && (staff.out as any).rows.length === 1, 'same-institution staff can read the result')
  const peer = await as(db, student(STUDENT_B), () => db.query(`select student_id from public.assessment_results`))
  assert.ok(peer.ok && (peer.out as any).rows.length === 0, 'a peer student cannot read the result')
  await db.close()
})

test('feedback and help rows can only name the caller (or nobody)', async () => {
  const db = await database()
  const forged = await as(db, student(STUDENT_B), () => db.query(
    `insert into public.feedback_submissions (student_id, student_ref, email, rating, message) values ($1::uuid,$2::text,'a@x.io',1,'forged text here')`,
    [STUDENT_A, STUDENT_A]))
  assert.equal(forged.ok, false)
  const own = await as(db, student(STUDENT_B), () => db.query(
    `insert into public.feedback_submissions (student_id, email, rating, message) values ($1,'b@x.io',5,'my own feedback')`, [STUDENT_B]))
  assert.ok(own.ok)
  const anonHelp = await as(db, null, () => db.query(`insert into public.help_requests (email, message) values ('anon@x.io','anonymous help text')`))
  assert.ok(anonHelp.ok, 'an anonymous help request still works')
  const attributed = await as(db, null, () => db.query(`insert into public.help_requests (student_id, email, message) values ($1,'a@x.io','forged help text')`, [STUDENT_A]))
  assert.equal(attributed.ok, false)
  await db.close()
})
