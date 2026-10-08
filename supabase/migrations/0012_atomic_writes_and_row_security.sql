-- ============================================================================
-- Migration 0012 — atomic assessment writes and row-level security hardening
--
-- Why this exists (see docs/DATA_INTEGRITY.md):
--   * An assessment submit used to be two separate statements (session, then
--     result). A failure between them left a session marked "submitted" with no
--     result, and a late autosave could reopen a finished attempt.
--   * A student could change their own `role` / `institution_id` through the
--     profile self-update policy, and the feedback / help insert policies let
--     anyone attribute a row to any student.
--
-- What it adds (all idempotent — safe on a fresh schema.sql and on a database
-- that already ran 0002..0011):
--   1. is_service_role()  — true for the service key and the SQL editor only.
--   2. Guards: a finished assessment session is immutable; a student cannot
--      change their own role / institution.
--   3. Atomic functions the API calls in ONE transaction:
--        start_assessment_session  — expire the previous attempt of the same
--                                    assessment and open the new one;
--        save_assessment_progress  — autosave, never reopens a finished attempt;
--        submit_assessment         — finalise the session AND store the result,
--                                    or neither (all-or-nothing).
--   4. Tighter policies: feedback/help rows may only name the caller as their
--      student; staff (faculty / institution) read their own institution only,
--      through a SECURITY DEFINER check so the policy does not depend on RLS of
--      the profiles table it is checking against.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Who is writing? (SECURITY INVOKER on purpose: current_user must be the
--    caller, not the function owner.)
-- ---------------------------------------------------------------------------
create or replace function public.is_service_role()
returns boolean
language sql
stable
as $$
  select coalesce(
           nullif(current_setting('request.jwt.claim.role', true), ''),
           nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
           '') = 'service_role'
      or current_user in ('postgres', 'supabase_admin')
$$;

-- ---------------------------------------------------------------------------
-- 2a. A student cannot promote themselves or move to another institution.
-- ---------------------------------------------------------------------------
create or replace function public.profiles_guard_privileged_columns()
returns trigger
language plpgsql
as $$
begin
  if (new.id is distinct from old.id
      or new.role is distinct from old.role
      or new.institution_id is distinct from old.institution_id)
     and not public.is_service_role() then
    raise exception 'role and institution are managed by the platform'
      using errcode = '42501';
  end if;
  return new;
end
$$;

drop trigger if exists profiles_guard_privileged_columns on public.profiles;
create trigger profiles_guard_privileged_columns
  before update on public.profiles
  for each row execute function public.profiles_guard_privileged_columns();

-- ---------------------------------------------------------------------------
-- 2b. A finished assessment session is a record: its status, answers and
--     ownership can no longer change. (In-progress rows stay writable.)
-- ---------------------------------------------------------------------------
create or replace function public.assessment_session_immutable()
returns trigger
language plpgsql
as $$
begin
  if old.status in ('submitted', 'expired') and (
       new.status is distinct from old.status
    or new.answers is distinct from old.answers
    or new.submitted_at is distinct from old.submitted_at
    or new.student_id is distinct from old.student_id
    or new.assessment_no is distinct from old.assessment_no) then
    raise exception 'assessment session % is final', old.id using errcode = 'P0001';
  end if;
  return new;
end
$$;

drop trigger if exists assessment_sessions_immutable on public.assessment_sessions;
create trigger assessment_sessions_immutable
  before update on public.assessment_sessions
  for each row execute function public.assessment_session_immutable();

-- Sanity guards on stored results. NOT VALID: they constrain new and updated
-- rows without failing on any legacy row that predates them.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'assessment_results_total_range') then
    alter table public.assessment_results
      add constraint assessment_results_total_range check (total between 0 and 1000) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'assessment_results_grade_valid') then
    alter table public.assessment_results
      add constraint assessment_results_grade_valid check (grade is null or grade in ('S','A','B','C','D')) not valid;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Atomic assessment functions (one transaction each, RLS applies because
--    they are SECURITY INVOKER; the service role may act for any student).
-- ---------------------------------------------------------------------------

-- Serialises every write for one (student, assessment) pair, so two requests
-- racing for the same attempt cannot both succeed.
create or replace function public.assessment_lock(p_student_id uuid, p_assessment_no smallint)
returns void
language sql
as $$
  select pg_advisory_xact_lock(hashtextextended(p_student_id::text || ':' || p_assessment_no::text, 0))
$$;

create or replace function public.start_assessment_session(
  p_session_id    uuid,
  p_student_id    uuid,
  p_assessment_no smallint,
  p_started_at    timestamptz,
  p_expires_at    timestamptz,
  p_duration_sec  int,
  p_question_seed bigint,
  p_answers       jsonb
)
returns public.assessment_sessions
language plpgsql
security invoker
set search_path = public
as $$
declare
  v public.assessment_sessions;
begin
  if not public.is_service_role() and p_student_id is distinct from auth.uid() then
    raise exception 'not allowed to start an attempt for another student' using errcode = '42501';
  end if;
  perform public.assessment_lock(p_student_id, p_assessment_no);
  if exists (select 1 from public.assessment_sessions where id = p_session_id and student_id <> p_student_id) then
    raise exception 'session belongs to another student' using errcode = '42501';
  end if;

  -- Close the previous open attempt of the SAME assessment (never the other one).
  update public.assessment_sessions
     set status = 'expired'
   where student_id = p_student_id
     and status = 'in_progress'
     and assessment_no = p_assessment_no
     and id <> p_session_id;

  insert into public.assessment_sessions (
    id, student_id, started_at, expires_at, duration_sec, status, question_seed, answers, tab_switches, assessment_no
  ) values (
    p_session_id, p_student_id,
    coalesce(p_started_at, now()),
    coalesce(p_expires_at, now() + make_interval(secs => coalesce(p_duration_sec, 7200))),
    coalesce(p_duration_sec, 7200), 'in_progress', coalesce(p_question_seed, 0),
    coalesce(p_answers, '{}'::jsonb), 0, p_assessment_no
  )
  on conflict (id) do update set
    answers = excluded.answers
  where public.assessment_sessions.status = 'in_progress';

  select * into v from public.assessment_sessions where id = p_session_id;
  return v;
end
$$;

create or replace function public.save_assessment_progress(
  p_session_id    uuid,
  p_student_id    uuid,
  p_assessment_no smallint,
  p_answers       jsonb,
  p_tab_switches  int,
  p_started_at    timestamptz,
  p_expires_at    timestamptz,
  p_duration_sec  int,
  p_question_seed bigint
)
returns public.assessment_sessions
language plpgsql
security invoker
set search_path = public
as $$
declare
  v public.assessment_sessions;
begin
  if not public.is_service_role() and p_student_id is distinct from auth.uid() then
    raise exception 'not allowed to save another student''s attempt' using errcode = '42501';
  end if;
  perform public.assessment_lock(p_student_id, p_assessment_no);
  if exists (select 1 from public.assessment_sessions where id = p_session_id and student_id <> p_student_id) then
    raise exception 'session belongs to another student' using errcode = '42501';
  end if;

  -- A finished attempt is left exactly as it was submitted (the WHERE clause).
  insert into public.assessment_sessions (
    id, student_id, started_at, expires_at, duration_sec, status, question_seed, answers, tab_switches, assessment_no
  ) values (
    p_session_id, p_student_id,
    coalesce(p_started_at, now()),
    coalesce(p_expires_at, now() + make_interval(secs => coalesce(p_duration_sec, 7200))),
    coalesce(p_duration_sec, 7200), 'in_progress', coalesce(p_question_seed, 0),
    coalesce(p_answers, '{}'::jsonb), coalesce(p_tab_switches, 0), p_assessment_no
  )
  on conflict (id) do update set
    answers = excluded.answers,
    tab_switches = excluded.tab_switches
  where public.assessment_sessions.status = 'in_progress';

  select * into v from public.assessment_sessions where id = p_session_id;
  return v;
end
$$;

create or replace function public.submit_assessment(
  p_session_id     uuid,
  p_student_id     uuid,
  p_assessment_no  smallint,
  p_answers        jsonb,
  p_tab_switches   int,
  p_expired        boolean,
  p_submitted_at   timestamptz,
  p_started_at     timestamptz,
  p_expires_at     timestamptz,
  p_duration_sec   int,
  p_question_seed  bigint,
  p_scores         jsonb,
  p_total          int,
  p_grade          text,
  p_percentile     numeric,
  p_verifiable_hash text,
  p_ai_feedback    jsonb
)
returns public.assessment_results
language plpgsql
security invoker
set search_path = public
as $$
declare
  v public.assessment_results;
  v_status text := case when coalesce(p_expired, false) then 'expired' else 'submitted' end;
begin
  if not public.is_service_role() and p_student_id is distinct from auth.uid() then
    raise exception 'not allowed to submit for another student' using errcode = '42501';
  end if;
  perform public.assessment_lock(p_student_id, p_assessment_no);
  if exists (select 1 from public.assessment_sessions where id = p_session_id and student_id <> p_student_id) then
    raise exception 'session belongs to another student' using errcode = '42501';
  end if;
  -- One finished attempt per assessment. A retry of the SAME session is fine
  -- (handled below); a second, different session is rejected.
  if exists (
    select 1 from public.assessment_results r
     where r.student_id = p_student_id
       and r.assessment_no = p_assessment_no
       and r.session_id <> p_session_id
  ) then
    raise exception 'assessment % was already submitted', p_assessment_no using errcode = '23505';
  end if;

  -- 1) finalise the session (only an in-progress attempt changes)…
  insert into public.assessment_sessions (
    id, student_id, started_at, expires_at, duration_sec, status, question_seed, answers, tab_switches, submitted_at, assessment_no
  ) values (
    p_session_id, p_student_id,
    coalesce(p_started_at, now()),
    coalesce(p_expires_at, now() + make_interval(secs => coalesce(p_duration_sec, 7200))),
    coalesce(p_duration_sec, 7200), v_status, coalesce(p_question_seed, 0),
    coalesce(p_answers, '{}'::jsonb), coalesce(p_tab_switches, 0), coalesce(p_submitted_at, now()), p_assessment_no
  )
  on conflict (id) do update set
    status = excluded.status,
    answers = excluded.answers,
    tab_switches = excluded.tab_switches,
    submitted_at = excluded.submitted_at
  where public.assessment_sessions.status = 'in_progress';

  -- 2) …and store its result. Same transaction: if this fails, step 1 is undone.
  insert into public.assessment_results (
    session_id, student_id, scores, total, grade, percentile, verifiable_hash, ai_feedback, assessment_no
  ) values (
    p_session_id, p_student_id, coalesce(p_scores, '{}'::jsonb), coalesce(p_total, 0),
    p_grade, p_percentile, p_verifiable_hash, coalesce(p_ai_feedback, '{}'::jsonb), p_assessment_no
  )
  on conflict (session_id) do nothing;

  select * into v from public.assessment_results where session_id = p_session_id;
  return v;
end
$$;

-- Helper for the API layer: the function names are part of the contract.
revoke all on function public.start_assessment_session(uuid, uuid, smallint, timestamptz, timestamptz, int, bigint, jsonb) from public, anon;
revoke all on function public.save_assessment_progress(uuid, uuid, smallint, jsonb, int, timestamptz, timestamptz, int, bigint) from public, anon;
revoke all on function public.submit_assessment(uuid, uuid, smallint, jsonb, int, boolean, timestamptz, timestamptz, timestamptz, int, bigint, jsonb, int, text, numeric, text, jsonb) from public, anon;
grant execute on function public.start_assessment_session(uuid, uuid, smallint, timestamptz, timestamptz, int, bigint, jsonb) to authenticated, service_role;
grant execute on function public.save_assessment_progress(uuid, uuid, smallint, jsonb, int, timestamptz, timestamptz, int, bigint) to authenticated, service_role;
grant execute on function public.submit_assessment(uuid, uuid, smallint, jsonb, int, boolean, timestamptz, timestamptz, timestamptz, int, bigint, jsonb, int, text, numeric, text, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Row-level security hardening
-- ---------------------------------------------------------------------------

-- Staff (faculty / institution) may read students of THEIR institution only.
-- SECURITY DEFINER: the check reads profiles without the caller's RLS, so the
-- policy does not depend on being able to see the rows it is checking.
create or replace function public.is_same_institution_staff(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.profiles me
      join public.profiles s on s.id = p_student_id
     where me.id = auth.uid()
       and me.role in ('faculty', 'institution')
       and me.institution_id is not null
       and s.institution_id = me.institution_id
  )
$$;

drop policy if exists "tenant results read" on public.assessment_results;
create policy "tenant results read" on public.assessment_results
  for select using (public.is_same_institution_staff(student_id));

drop policy if exists "tenant company attempts read" on public.company_assessment_attempts;
create policy "tenant company attempts read" on public.company_assessment_attempts
  for select using (public.is_same_institution_staff(student_id));

drop policy if exists "tenant profiles read" on public.profiles;
create policy "tenant profiles read" on public.profiles
  for select using (public.is_same_institution_staff(id));

-- Anyone may submit feedback / a help request, but only as themselves (or as an
-- anonymous row with no student). The row can no longer name another student.
drop policy if exists feedback_insert_any on public.feedback_submissions;
drop policy if exists feedback_insert_scoped on public.feedback_submissions;
create policy feedback_insert_scoped on public.feedback_submissions
  for insert with check (student_id is null or student_id = auth.uid());

drop policy if exists help_requests_insert_any on public.help_requests;
drop policy if exists help_requests_insert_scoped on public.help_requests;
create policy help_requests_insert_scoped on public.help_requests
  for insert with check (student_id is null or student_id = auth.uid());
