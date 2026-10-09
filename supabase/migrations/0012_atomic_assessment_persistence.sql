-- ============================================================================
-- Migration 0012 — atomic, owner-safe platform assessment persistence
--
-- The API must call these RPCs with a server-only service-role client after it
-- verifies the student's Supabase access token. The client key is never exposed
-- to the browser. A final submission updates the session and inserts the score
-- in one PostgreSQL transaction; an exception rolls both changes back.
-- ============================================================================

create or replace function public.persist_assessment_session(
  p_session jsonb,
  p_start boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_student_id uuid;
  v_assessment_no smallint;
  v_saved public.assessment_sessions%rowtype;
  v_active public.assessment_sessions%rowtype;
  v_status text;
begin
  if jsonb_typeof(p_session) <> 'object' then
    raise exception 'Invalid assessment session payload' using errcode = '22023';
  end if;

  v_id := nullif(p_session->>'id', '')::uuid;
  v_student_id := nullif(p_session->>'student_id', '')::uuid;
  v_assessment_no := coalesce(nullif(p_session->>'assessment_no', '')::smallint, 1);
  v_status := coalesce(nullif(p_session->>'status', ''), 'in_progress');

  if v_id is null or v_student_id is null then
    raise exception 'Assessment session requires id and student_id' using errcode = '22023';
  end if;
  if v_assessment_no not in (1, 2) then
    raise exception 'Invalid assessment number' using errcode = '22023';
  end if;
  if v_status <> 'in_progress' then
    raise exception 'Final sessions must use submit_assessment_attempt' using errcode = '22023';
  end if;

  if p_start then
    -- If the same student retries the start request, return the canonical
    -- active session. Never replace its id, question seed, timer or answers.
    update public.assessment_sessions
       set status = 'expired',
           submitted_at = coalesce(submitted_at, expires_at)
     where student_id = v_student_id
       and assessment_no = v_assessment_no
       and status = 'in_progress'
       and expires_at <= now();

    select * into v_active
      from public.assessment_sessions
     where student_id = v_student_id
       and assessment_no = v_assessment_no
       and status = 'in_progress'
     order by started_at desc
     limit 1
     for update;
    if found then
      return to_jsonb(v_active);
    end if;

    -- A completed/expired attempt is final, even if a client cleared local
    -- storage or sends a newly generated session id.
    if exists (
      select 1 from public.assessment_sessions
       where student_id = v_student_id
         and assessment_no = v_assessment_no
         and (status in ('submitted', 'expired') or submitted_at is not null)
    ) or exists (
      select 1 from public.assessment_results
       where student_id = v_student_id
         and assessment_no = v_assessment_no
    ) then
      raise exception 'Assessment attempt is already final' using errcode = 'P0001';
    end if;

    begin
      insert into public.assessment_sessions (
        id, student_id, started_at, expires_at, duration_sec, status,
        question_seed, tab_switches, answers, submitted_at, created_at, assessment_no
      ) values (
        v_id,
        v_student_id,
        coalesce(nullif(p_session->>'started_at', '')::timestamptz, now()),
        coalesce(nullif(p_session->>'expires_at', '')::timestamptz, now() + interval '120 minutes'),
        greatest(1, coalesce(nullif(p_session->>'duration_sec', '')::int, 7200)),
        'in_progress',
        coalesce(nullif(p_session->>'question_seed', '')::bigint, (extract(epoch from now()) * 1000)::bigint),
        greatest(0, coalesce(nullif(p_session->>'tab_switches', '')::int, 0)),
        coalesce(p_session->'answers', '{}'::jsonb),
        null,
        coalesce(nullif(p_session->>'created_at', '')::timestamptz, now()),
        v_assessment_no
      ) returning * into v_saved;
    exception when unique_violation then
      -- A second worker may have started the same student concurrently. The
      -- unique active-session index serializes the race; return its row.
      select * into v_saved
        from public.assessment_sessions
       where student_id = v_student_id
         and assessment_no = v_assessment_no
         and status = 'in_progress'
       order by started_at desc
       limit 1
       for update;
      if not found then
        raise;
      end if;
    end;
    return to_jsonb(v_saved);
  end if;

  -- Autosave/checkpoint: lock and update only the owner’s active session.
  select * into v_saved
    from public.assessment_sessions
   where id = v_id
   for update;
  if not found then
    raise exception 'Assessment session not found' using errcode = 'P0002';
  end if;
  if v_saved.student_id <> v_student_id or v_saved.assessment_no <> v_assessment_no then
    raise exception 'Assessment session owner mismatch' using errcode = '42501';
  end if;
  if v_saved.status <> 'in_progress' then
    return to_jsonb(v_saved);
  end if;

  update public.assessment_sessions
     set answers = coalesce(p_session->'answers', answers),
         tab_switches = greatest(tab_switches, greatest(0, coalesce(nullif(p_session->>'tab_switches', '')::int, 0)))
   where id = v_id
  returning * into v_saved;

  return to_jsonb(v_saved);
end;
$$;

create or replace function public.submit_assessment_attempt(
  p_session jsonb,
  p_result jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_student_id uuid;
  v_assessment_no smallint;
  v_result_session_id uuid;
  v_result_student_id uuid;
  v_result_assessment_no smallint;
  v_status text;
  v_session public.assessment_sessions%rowtype;
  v_result public.assessment_results%rowtype;
begin
  if jsonb_typeof(p_session) <> 'object' or jsonb_typeof(p_result) <> 'object' then
    raise exception 'Invalid assessment submission payload' using errcode = '22023';
  end if;

  v_id := nullif(p_session->>'id', '')::uuid;
  v_student_id := nullif(p_session->>'student_id', '')::uuid;
  v_assessment_no := coalesce(nullif(p_session->>'assessment_no', '')::smallint, 1);
  v_result_session_id := nullif(p_result->>'session_id', '')::uuid;
  v_result_student_id := nullif(p_result->>'student_id', '')::uuid;
  v_result_assessment_no := coalesce(nullif(p_result->>'assessment_no', '')::smallint, 1);
  v_status := coalesce(nullif(p_session->>'status', ''), 'submitted');

  if v_id is null or v_student_id is null or v_result_session_id is null or v_result_student_id is null then
    raise exception 'Submission requires matching session and student ids' using errcode = '22023';
  end if;
  if v_id <> v_result_session_id or v_student_id <> v_result_student_id then
    raise exception 'Session/result ownership mismatch' using errcode = '42501';
  end if;
  if v_assessment_no not in (1, 2) or v_assessment_no <> v_result_assessment_no then
    raise exception 'Session/result assessment mismatch' using errcode = '22023';
  end if;
  if v_status not in ('submitted', 'expired') then
    raise exception 'Invalid final assessment status' using errcode = '22023';
  end if;
  if jsonb_typeof(p_result->'scores') <> 'object' then
    raise exception 'Assessment scores must be a JSON object' using errcode = '22023';
  end if;

  -- The start RPC must have committed first. This prevents final submissions
  -- from inventing a session id or attaching a result to another candidate.
  select * into v_session
    from public.assessment_sessions
   where id = v_id
   for update;
  if not found then
    raise exception 'Assessment session not found' using errcode = 'P0002';
  end if;
  if v_session.student_id <> v_student_id or v_session.assessment_no <> v_assessment_no then
    raise exception 'Assessment session owner mismatch' using errcode = '42501';
  end if;

  -- A duplicate POST is safe: return the first committed result unchanged.
  select * into v_result
    from public.assessment_results
   where session_id = v_id
   for update;
  if found then
    if v_result.student_id <> v_student_id or v_result.assessment_no <> v_assessment_no then
      raise exception 'Assessment result owner mismatch' using errcode = '42501';
    end if;
    if v_session.status = 'in_progress' then
      update public.assessment_sessions
         set status = v_status,
             submitted_at = coalesce(nullif(p_session->>'submitted_at', '')::timestamptz, now()),
             answers = coalesce(p_session->'answers', answers),
             tab_switches = greatest(tab_switches, greatest(0, coalesce(nullif(p_session->>'tab_switches', '')::int, 0)))
       where id = v_id
      returning * into v_session;
    end if;
    return jsonb_build_object('session', to_jsonb(v_session), 'result', to_jsonb(v_result));
  end if;

  if v_session.status = 'in_progress' then
    update public.assessment_sessions
       set status = v_status,
           submitted_at = coalesce(nullif(p_session->>'submitted_at', '')::timestamptz, now()),
           answers = coalesce(p_session->'answers', answers),
           tab_switches = greatest(tab_switches, greatest(0, coalesce(nullif(p_session->>'tab_switches', '')::int, 0)))
     where id = v_id
    returning * into v_session;
  end if;

  insert into public.assessment_results (
    id, session_id, student_id, scores, total, grade, percentile,
    verifiable_hash, ai_feedback, created_at, assessment_no
  ) values (
    coalesce(nullif(p_result->>'id', '')::uuid, gen_random_uuid()),
    v_id,
    v_student_id,
    p_result->'scores',
    greatest(0, least(1000, coalesce(nullif(p_result->>'total', '')::int, 0))),
    nullif(p_result->>'grade', ''),
    nullif(p_result->>'percentile', '')::numeric,
    nullif(p_result->>'verifiable_hash', ''),
    coalesce(p_result->'ai_feedback', '{}'::jsonb),
    coalesce(nullif(p_result->>'created_at', '')::timestamptz, now()),
    v_assessment_no
  ) returning * into v_result;

  return jsonb_build_object('session', to_jsonb(v_session), 'result', to_jsonb(v_result));
end;
$$;

-- The RPCs intentionally bypass table RLS only for the trusted application
-- server. The API verifies the caller's Supabase JWT and binds the student id
-- before calling either function. Browser/anon/authenticated roles cannot call
-- these SECURITY DEFINER functions directly.
revoke all on function public.persist_assessment_session(jsonb, boolean) from public, anon, authenticated;
revoke all on function public.submit_assessment_attempt(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.persist_assessment_session(jsonb, boolean) to service_role;
grant execute on function public.submit_assessment_attempt(jsonb, jsonb) to service_role;

comment on function public.persist_assessment_session(jsonb, boolean) is
  'Owner-safe, transactional start/resume and autosave for platform assessment sessions. Service-role API only.';
comment on function public.submit_assessment_attempt(jsonb, jsonb) is
  'Atomically finalizes one platform assessment session and inserts its result. Retries are idempotent. Service-role API only.';
