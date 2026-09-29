import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

// Runs supabase/migrations/0009_company_assessments.sql on a real PostgreSQL
// engine (PGlite / WASM) to prove the database-level rules — above all that a
// student can hold only ONE attempt per company, and that a finished attempt
// can never be reopened.

const STUDENT_A = '11111111-1111-4111-8111-111111111111'
const STUDENT_B = '22222222-2222-4222-8222-222222222222'
const ID_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ID_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const ID_3 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

const SUPABASE_STUBS = `
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table public.profiles (id uuid primary key, institution_id text default 'inst_a');
insert into public.profiles (id) values ('${STUDENT_A}'), ('${STUDENT_B}');
`

const insert = (id: string, student: string, company = 'tcs') =>
  `insert into public.company_assessment_attempts (id, student_id, company_slug, paper, expires_at, duration_sec)
   values ('${id}', '${student}', '${company}', '{"rounds":[]}', now() + interval '100 minutes', 6000)`

async function freshDb() {
  const db = new PGlite()
  await db.exec(SUPABASE_STUBS)
  await db.exec(fs.readFileSync('supabase/migrations/0009_company_assessments.sql', 'utf8'))
  return db
}

async function rejects(db: PGlite, sql: string, code: string) {
  try {
    await db.exec(sql)
  } catch (e: any) {
    assert.equal(e?.code, code, `expected SQLSTATE ${code}, got ${e?.code}: ${e?.message}`)
    return
  }
  assert.fail(`expected SQLSTATE ${code} for: ${sql.slice(0, 80)}`)
}

test('migration 0009: one attempt per student per company, enforced by Postgres', { timeout: 120_000 }, async () => {
  const db = await freshDb()
  await db.exec(insert(ID_1, STUDENT_A))
  // A second attempt for the same student + company is rejected outright…
  await rejects(db, insert(ID_2, STUDENT_A), '23505')
  // …while another company, or another student, is fine.
  await db.exec(insert(ID_2, STUDENT_A, 'infosys'))
  await db.exec(insert(ID_3, STUDENT_B))
  // The app's create-only upsert (ON CONFLICT DO NOTHING) never overwrites.
  await db.exec(`insert into public.company_assessment_attempts (id, student_id, company_slug, paper, expires_at, duration_sec)
                 values ('${ID_1}', '${STUDENT_A}', 'tcs', '{"rounds":["x"]}', now(), 60) on conflict (id) do nothing`)
  const row = await db.query<{ paper: any; duration_sec: number }>(`select paper, duration_sec from public.company_assessment_attempts where id = '${ID_1}'`)
  assert.deepEqual(row.rows[0].paper, { rounds: [] })
  assert.equal(row.rows[0].duration_sec, 6000)

  // Finishing is allowed once; afterwards the row is immutable.
  await db.exec(`update public.company_assessment_attempts set status = 'submitted', score = 71.5, verdict = 'almost' where id = '${ID_1}'`)
  await rejects(db, `update public.company_assessment_attempts set status = 'in_progress' where id = '${ID_1}'`, 'P0001')
  await rejects(db, `update public.company_assessment_attempts set score = 100 where id = '${ID_1}'`, 'P0001')

  // Data sanity constraints.
  await rejects(db, `update public.company_assessment_attempts set score = 101 where id = '${ID_2}'`, '23514')
  await rejects(db, `update public.company_assessment_attempts set status = 'paused' where id = '${ID_2}'`, '23514')
  await rejects(db, insert('dddddddd-dddd-4ddd-8ddd-dddddddddddd', STUDENT_B, 'Bad Slug!'), '23514')
  await db.close()
})

test('migration 0009: students can read only their own attempts and cannot write any', { timeout: 120_000 }, async () => {
  const db = await freshDb()
  await db.exec(insert(ID_1, STUDENT_A))
  await db.exec(insert(ID_3, STUDENT_B))
  await db.exec(`
    create role app_user nologin;
    grant usage on schema public, auth to app_user;
    grant select, insert, update, delete on public.company_assessment_attempts to app_user;
    grant select on public.profiles to app_user;
    grant execute on function auth.uid() to app_user;
  `)
  await db.exec(`set role app_user; select set_config('request.jwt.claim.sub', '${STUDENT_A}', false);`)
  const mine = await db.query<{ student_id: string }>('select student_id from public.company_assessment_attempts')
  // Same institution → the tenant policy also exposes B's row; own-row policy covers A.
  assert.ok(mine.rows.some((r) => r.student_id === STUDENT_A))
  // No write policy exists: inserts are refused and updates/deletes touch nothing.
  await rejects(db, insert('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', STUDENT_A, 'wipro'), '42501')
  const upd = await db.query(`update public.company_assessment_attempts set score = 99 where student_id = '${STUDENT_A}' returning id`)
  assert.equal(upd.rows.length, 0)
  const del = await db.query(`delete from public.company_assessment_attempts returning id`)
  assert.equal(del.rows.length, 0)
  await db.exec('reset role')
  await db.exec(`update public.profiles set institution_id = 'inst_b' where id = '${STUDENT_B}'`)
  await db.exec(`set role app_user; select set_config('request.jwt.claim.sub', '${STUDENT_A}', false);`)
  const isolated = await db.query<{ student_id: string }>('select student_id from public.company_assessment_attempts')
  assert.deepEqual(isolated.rows.map((r) => r.student_id), [STUDENT_A])
  await db.close()
})
