-- ============================================================================
-- Calibiai Score — Supabase schema
-- Run in Supabase SQL editor (or `supabase db push`).
-- Each student gets a separate assessment session; every attempt is isolated
-- by student_id + RLS. Auth uses Supabase Auth (supabase-js signInWithPassword).
-- ============================================================================

-- Extension for unique-safe updates
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Institutions (tenant) + profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.institutions (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  tenant_code   text unique not null,
  created_at    timestamptz not null default now()
);

create table if not exists public.profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  email            text not null,
  role             text not null default 'student' check (role in ('student','faculty','institution')),
  full_name        text,
  prn              text,                      -- college PRN / registration number (optional)
  phone            text,
  dob              date,
  gender           text,
  degree           text,
  college          text,
  institution_id   uuid references public.institutions(id),
  graduation_year  int,
  cgpa             numeric(4,2),
  skills           text,
  linkedin_url     text,
  github_url       text,
  ai_avatar        jsonb,                 -- generated AI avatar config {seed, style, version, generated_at}
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Index for fast login lookup by email (used by /api/auth/login)
create index if not exists profiles_email_idx on public.profiles (email);

-- One student per PRN (partial index: blank/absent PRNs never collide, the
-- field is optional). Colleges match CalibiAI records to their own register by
-- PRN, so a duplicate would silently merge two different students.
create unique index if not exists profiles_prn_unique_idx
  on public.profiles (prn)
  where prn is not null and btrim(prn) <> '';

-- Auto-create a profile row when a new auth user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name',
          coalesce(new.raw_user_meta_data->>'role','student'))
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Resume analyses (parsed score/feedback from AI worker)
-- ---------------------------------------------------------------------------
create table if not exists public.resume_analyses (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.profiles(id) on delete cascade,
  storage_key   text,                       -- minio/storage path to uploaded PDF
  resume_score  int,
  parsed        jsonb,
  feedback      jsonb,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Tracking events (WhatsApp community / LinkedIn follow steps)
-- ---------------------------------------------------------------------------
create table if not exists public.tracking_events (
  id            text primary key,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  action        text not null,
  completed     boolean not null default false,
  completed_at  timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists tracking_events_user_idx on public.tracking_events (user_id);
create index if not exists resume_analyses_student_idx on public.resume_analyses (student_id);

-- ---------------------------------------------------------------------------
-- Assessment sessions — one per attempt, per student
-- ---------------------------------------------------------------------------
create table if not exists public.assessment_sessions (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references public.profiles(id) on delete cascade,
  started_at      timestamptz not null default now(),
  expires_at      timestamptz not null default now() + interval '120 minutes',
  duration_sec    int not null default 7200,
  status          text not null default 'in_progress'
                  check (status in ('in_progress','submitted','expired')),
  question_seed   bigint not null default (extract(epoch from now()) * 1000)::bigint, -- per-session option shuffle seed
  tab_switches    int not null default 0,
  answers         jsonb not null default '{}'::jsonb,
  submitted_at    timestamptz,
  created_at      timestamptz not null default now()
);
-- A student only ever has one active session at a time
create unique index if not exists one_active_session_per_student
  on public.assessment_sessions (student_id)
  where status = 'in_progress';

-- ---------------------------------------------------------------------------
-- Final evaluation results (scores)
-- ---------------------------------------------------------------------------
create table if not exists public.assessment_results (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null unique references public.assessment_sessions(id) on delete cascade,
  student_id          uuid not null references public.profiles(id) on delete cascade,
  scores              jsonb not null,      -- full section breakdown + behavioral profile
  total               int not null,
  grade               text,
  percentile         numeric,
  verifiable_hash     text,
  ai_feedback         jsonb,               -- CalibiAI feedback per subjective section
  report_storage_key  text,                -- PDF report path
  created_at          timestamptz not null default now()
);

create index if not exists profiles_role_college_idx on public.profiles (role, college);
create index if not exists assessment_results_student_created_idx
  on public.assessment_results (student_id, created_at desc);
create index if not exists assessment_sessions_student_created_idx
  on public.assessment_sessions (student_id, created_at desc);
create index if not exists assessment_sessions_status_student_idx
  on public.assessment_sessions (status, student_id, created_at desc);

-- ---------------------------------------------------------------------------
-- AI evaluation jobs (CalibiAI) — for speaking/writing/code/prompts
-- ---------------------------------------------------------------------------
create table if not exists public.ai_evaluation_jobs (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.assessment_sessions(id) on delete cascade,
  section       text not null check (section in ('speaking','writing','debugging','feature','prompt')),
  ref_id        text,                       -- question/task id
  payload       jsonb not null,            -- transcript / code / prompt text
  status        text not null default 'pending' check (status in ('pending','done','error')),
  result        jsonb,                      -- {score, rubric:{...}, feedback}
  model         text default 'deepseek-chat',
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.profiles           enable row level security;
alter table public.resume_analyses    enable row level security;
alter table public.tracking_events    enable row level security;
alter table public.assessment_sessions enable row level security;
alter table public.assessment_results enable row level security;
alter table public.ai_evaluation_jobs enable row level security;

-- Profiles: a user reads/updates their own row (the sign-up trigger inserts it);
-- the insert policy also covers re-creates and server-side onboarding upserts
-- made with the user's own access token.
--
-- PostgreSQL has no `create policy if not exists`, so remove only the policies
-- owned by this schema before creating them. This keeps the script safe to run
-- again in the Supabase SQL editor after a partial or previous setup.
drop policy if exists "own profile read" on public.profiles;
drop policy if exists "own profile insert" on public.profiles;
drop policy if exists "own profile update" on public.profiles;

create policy "own profile read"   on public.profiles for select using (auth.uid() = id);
create policy "own profile insert" on public.profiles for insert with check (auth.uid() = id);
create policy "own profile update" on public.profiles for update using (auth.uid() = id);

-- Students own their rows
drop policy if exists "own resumes" on public.resume_analyses;
drop policy if exists "own tracking" on public.tracking_events;
drop policy if exists "own sessions" on public.assessment_sessions;
drop policy if exists "own results" on public.assessment_results;
drop policy if exists "own ai jobs" on public.ai_evaluation_jobs;

create policy "own resumes"   on public.resume_analyses    for all using (auth.uid() = student_id);
create policy "own tracking"  on public.tracking_events    for all using (auth.uid() = user_id);
create policy "own sessions"  on public.assessment_sessions for all using (auth.uid() = student_id);
create policy "own results"   on public.assessment_results  for all using (auth.uid() = student_id);
create policy "own ai jobs"   on public.ai_evaluation_jobs  for all using (
  exists (select 1 from public.assessment_sessions s
          where s.id = session_id and s.student_id = auth.uid())
);

-- Faculty/institution dashboards: read within the same institution
drop policy if exists "tenant results read" on public.assessment_results;
create policy "tenant results read" on public.assessment_results for select using (
  exists (select 1 from public.profiles p
          where p.id = assessment_results.student_id
            and p.institution_id = (select institution_id from public.profiles where id = auth.uid()))
);

-- ============================================================================
-- Storage buckets (resumes, speaking audio, PDF reports)
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('resumes','resumes', false),
       ('speaking','speaking', false),
       ('reports','reports', false)
on conflict (id) do nothing;

-- Users can upload/read only files whose path starts with their uid: "{uid}/..."
-- Keep this schema rerunnable as well; `create policy` itself has no
-- `if not exists` form.
drop policy if exists "own files" on storage.objects;
create policy "own files" on storage.objects for all using (
  bucket_id in ('resumes','speaking','reports')
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- ============================================================================
-- Download view — one row per student: profile + latest resume analysis +
-- latest assessment result. Export from the Supabase table editor
-- (CSV / Excel / JSON) to download all data in one click.
-- (Also provided as standalone migrations: 0002_profile_avatar_and_full_view.sql,
--  0003_profile_prn.sql, and 0006_admin_attempted_and_stats.sql which adds
--  assessment_attempted plus the admin_stats view below.)
-- ============================================================================
create or replace view public.student_profiles_full
with (security_invoker = on)   -- RLS of the underlying tables still applies
as
select
  p.id                    as student_id,
  p.email,
  p.role,
  p.full_name,
  p.prn,
  p.phone,
  p.dob,
  p.gender,
  p.degree,
  p.college,
  p.institution_id,
  p.graduation_year,
  p.cgpa,
  p.skills,
  p.linkedin_url,
  p.github_url,
  p.ai_avatar,
  p.created_at            as profile_created_at,
  p.updated_at            as profile_updated_at,
  r.id                    as resume_id,
  r.storage_key           as resume_storage_key,
  r.resume_score,
  r.parsed                as resume_parsed,
  r.feedback              as resume_feedback,
  r.created_at            as resume_created_at,
  a.session_id            as assessment_session_id,
  a.total                 as talent_score,
  a.grade,
  a.percentile,
  a.scores                as assessment_scores,
  a.ai_feedback           as assessment_ai_feedback,
  a.verifiable_hash,
  a.report_storage_key    as report_storage_key,
  a.created_at            as assessment_created_at,
  (a.session_id is not null
    or exists (
      select 1 from public.assessment_sessions s
      where s.student_id = p.id
        and (s.status in ('submitted', 'expired') or s.submitted_at is not null)
    )
  )                       as assessment_attempted
from public.profiles p
left join lateral (
  select ra.*
  from public.resume_analyses ra
  where ra.student_id = p.id
  order by ra.created_at desc
  limit 1
) r on true
left join lateral (
  select ar.*
  from public.assessment_results ar
  where ar.student_id = p.id
  order by ar.created_at desc
  limit 1
) a on true;

-- Single-row dashboard aggregates for GET /api/admin/meta (stat cards +
-- college dropdown in one ~200-byte row instead of a full-table scan).
create or replace view public.admin_stats
with (security_invoker = on)   -- RLS of the underlying tables still applies
as
select
  count(*)::int                                                     as total_students,
  count(*) filter (where v.assessment_attempted)::int               as assessed_students,
  count(v.talent_score)::int                                        as scored_students,
  round(avg(v.talent_score))::int                                   as avg_score,
  coalesce(
    array_agg(distinct btrim(v.college))
      filter (where v.college is not null and btrim(v.college) <> ''),
    '{}'
  )                                                                 as colleges
from public.student_profiles_full v
where v.role = 'student';

-- ---------------------------------------------------------------------------
-- Feedback submissions (post-assessment candidate feedback)
-- "Which candidate gave which feedback" — written by /api/feedback, read back
-- per student by the admin dashboard. Kept here as well as in
-- supabase/migrations/0004_feedback_submissions.sql (that file is the one to
-- run against an existing database).

create table if not exists public.feedback_submissions (
  id           uuid primary key default gen_random_uuid(),
  -- Real Supabase user (null for local demo ids — see student_ref).
  student_id   uuid references public.profiles(id) on delete set null,
  -- Raw candidate id as sent by the client (`u_84368932`, a UUID, …).
  student_ref  text,
  email        text,
  session_id   text,
  rating       int  not null check (rating between 1 and 5),
  message      text not null check (char_length(btrim(message)) >= 10),
  source       text not null default 'web',
  created_at   timestamptz not null default now()
);

create index if not exists feedback_submissions_student_id_idx
  on public.feedback_submissions (student_id);
create index if not exists feedback_submissions_student_ref_idx
  on public.feedback_submissions (lower(student_ref));
create index if not exists feedback_submissions_email_idx
  on public.feedback_submissions (lower(email));
create index if not exists feedback_submissions_created_at_idx
  on public.feedback_submissions (created_at desc);
create index if not exists feedback_submissions_student_ref_created_idx
  on public.feedback_submissions (student_ref, created_at desc);
create index if not exists feedback_submissions_email_created_idx
  on public.feedback_submissions (lower(email), created_at desc);

alter table public.feedback_submissions enable row level security;

drop policy if exists feedback_insert_any on public.feedback_submissions;
create policy feedback_insert_any on public.feedback_submissions
  for insert with check (true);

drop policy if exists feedback_select_own on public.feedback_submissions;
create policy feedback_select_own on public.feedback_submissions
  for select using (student_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Help requests (in-app support form)
-- Written by POST /api/help. Kept here as well as in
-- supabase/migrations/0005_help_requests.sql (that file is the one to run
-- against an existing database). Replaces the old direct browser POST to an
-- external form service, which had a monthly submission limit.
-- ---------------------------------------------------------------------------
create table if not exists public.help_requests (
  id           uuid primary key default gen_random_uuid(),
  -- Real Supabase user (null when the request came from a local/demo id).
  student_id   uuid references public.profiles(id) on delete set null,
  -- Raw candidate id as sent by the client (`u_84368932`, a UUID, …).
  student_ref  text,
  email        text not null,
  phone        text,
  message      text not null check (char_length(btrim(message)) >= 10),
  page         text,
  source       text not null default 'web',
  created_at   timestamptz not null default now()
);

create index if not exists help_requests_email_idx       on public.help_requests (lower(email));
create index if not exists help_requests_created_at_idx  on public.help_requests (created_at desc);

alter table public.help_requests enable row level security;

-- Anyone may submit (contact form); the app writes with INSERT only, so no
-- update policy exists and a submitted request cannot be rewritten.
drop policy if exists help_requests_insert_any on public.help_requests;
create policy help_requests_insert_any on public.help_requests
  for insert with check (true);

drop policy if exists help_requests_select_own on public.help_requests;
create policy help_requests_select_own on public.help_requests
  for select using (student_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Low-egress admin change probe (migration 0007)
-- ---------------------------------------------------------------------------
drop view if exists public.admin_change_probe;
create view public.admin_change_probe
with (security_invoker = on)
as
select
  (select count(*)::int from public.profiles where role = 'student') as profiles_count,
  (select count(*)::int from public.assessment_results) as results_count,
  (select count(*)::int from public.resume_analyses) as resumes_count,
  (select count(*)::int from public.assessment_sessions) as sessions_count,
  (select count(*)::int from public.feedback_submissions) as feedback_count,
  (select max(updated_at) from public.profiles where role = 'student') as profiles_stamp,
  (select max(created_at) from public.assessment_results) as results_stamp,
  (select max(created_at) from public.resume_analyses) as resumes_stamp,
  (select max(coalesce(submitted_at, created_at)) from public.assessment_sessions) as sessions_stamp,
  (select max(created_at) from public.feedback_submissions) as feedback_stamp;

-- ============================================================================
-- Company-specific mock assessments (also provided as migration
-- 0009_company_assessments.sql). One attempt per student per company.
-- ============================================================================
create table if not exists public.company_assessment_attempts (
  id              uuid primary key,
  student_id      uuid not null references public.profiles(id) on delete cascade,
  company_slug    text not null check (company_slug ~ '^[a-z0-9-]{2,64}$'),
  status          text not null default 'in_progress'
                  check (status in ('in_progress', 'submitted', 'expired')),
  question_seed   bigint not null default 0,
  paper           jsonb not null,
  answers         jsonb not null default '{}'::jsonb,
  proctoring      jsonb not null default '{}'::jsonb,
  started_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  duration_sec    int not null check (duration_sec > 0),
  submitted_at    timestamptz,
  auto_submitted  boolean not null default false,
  submit_reason   text,
  score           numeric(5, 1) check (score is null or (score >= 0 and score <= 100)),
  verdict         text check (verdict is null or verdict in ('ready', 'almost', 'borderline', 'not-yet')),
  result          jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint company_assessment_one_attempt unique (student_id, company_slug)
);
create index if not exists company_attempts_student_idx
  on public.company_assessment_attempts (student_id, updated_at desc);
create index if not exists company_attempts_company_status_idx
  on public.company_assessment_attempts (company_slug, status);

create or replace function public.company_attempt_immutable()
returns trigger
language plpgsql
as $$
begin
  if old.status in ('submitted', 'expired') then
    raise exception 'company assessment attempt % is final', old.id using errcode = 'P0001';
  end if;
  return new;
end
$$;
drop trigger if exists company_attempt_immutable on public.company_assessment_attempts;
create trigger company_attempt_immutable
  before update on public.company_assessment_attempts
  for each row execute function public.company_attempt_immutable();

alter table public.company_assessment_attempts enable row level security;
drop policy if exists "own company attempts read" on public.company_assessment_attempts;
create policy "own company attempts read" on public.company_assessment_attempts
  for select using (auth.uid() = student_id);
drop policy if exists "tenant company attempts read" on public.company_assessment_attempts;
create policy "tenant company attempts read" on public.company_assessment_attempts
  for select using (
    exists (
      select 1 from public.profiles p
       where p.id = company_assessment_attempts.student_id
         and p.institution_id = (select institution_id from public.profiles where id = auth.uid())
    )
  );
-- No write policies: only the server (service role) writes company attempts.

-- ============================================================================
-- CalibiAI average (migration 0010, consolidated)
-- Assessment numbers (0008), the per-student CalibiAI average, and the final
-- shapes of student_profiles_full / admin_stats / admin_change_probe. Kept
-- identical to supabase/migrations/0010_calibiai_average.sql.
-- ============================================================================
do $$
begin
  if to_regclass('public.company_assessment_attempts') is null then
    raise exception 'Apply supabase/migrations/0009_company_assessments.sql before 0010.';
  end if;
end $$;

-- 1. Assessment number (idempotent copy of 0008's column + backfill) ----------
alter table public.assessment_sessions
  add column if not exists assessment_no smallint not null default 1;
alter table public.assessment_results
  add column if not exists assessment_no smallint not null default 1;

update public.assessment_sessions set assessment_no = 2
 where assessment_no = 1 and (answers ->> '__assessment_no') = '2';
update public.assessment_results set assessment_no = 2
 where assessment_no = 1 and (scores ->> 'assessment_no') = '2';

create index if not exists assessment_results_student_assessment_idx
  on public.assessment_results (student_id, assessment_no, created_at desc);
create index if not exists company_attempts_student_status_idx
  on public.company_assessment_attempts (student_id, status);

-- Dependents first, so re-running never trips over view dependencies.
drop view if exists public.admin_stats;
drop view if exists public.student_profiles_full;
drop view if exists public.student_calibiai_scores;

-- 2. Per-student CalibiAI average -------------------------------------------
create view public.student_calibiai_scores
with (security_invoker = on)   -- RLS of the underlying tables still applies
as
with platform as (
  select distinct on (ar.student_id, ar.assessment_no)
         ar.student_id, ar.total
    from public.assessment_results ar
   where ar.total is not null
   order by ar.student_id, ar.assessment_no, ar.created_at desc
),
entries as (
  select student_id, least(100.0, greatest(0.0, total::numeric / 10.0)) as pct, false as is_company
    from platform
  union all
  select student_id, least(100.0, greatest(0.0, score::numeric)) as pct, true as is_company
    from public.company_assessment_attempts
   where status in ('submitted', 'expired') and score is not null
)
select
  student_id,
  round(avg(pct) * 10)::int                        as calibi_score,
  count(*)::int                                    as assessments_taken,
  (count(*) filter (where is_company))::int        as company_taken,
  round(avg(pct) filter (where is_company), 1)     as company_avg
from entries
group by student_id;

comment on view public.student_calibiai_scores is
  'CalibiAI Score per student = round(avg(percent) × 10) over every completed assessment: latest result per assessment_no (/1000) and every submitted/expired company mock (/100). Mirrors lib/calibiScore.ts.';

-- 3. Export view (superset of every earlier shape) ---------------------------
create view public.student_profiles_full
with (security_invoker = on)   -- RLS of the underlying tables still applies
as
select
  p.id                    as student_id,
  p.email,
  p.role,
  p.full_name,
  p.prn,
  p.phone,
  p.dob,
  p.gender,
  p.degree,
  p.college,
  p.institution_id,
  p.graduation_year,
  p.cgpa,
  p.skills,
  p.linkedin_url,
  p.github_url,
  p.ai_avatar,
  p.created_at            as profile_created_at,
  p.updated_at            as profile_updated_at,
  r.id                    as resume_id,
  r.storage_key           as resume_storage_key,
  r.resume_score,
  r.parsed                as resume_parsed,
  r.feedback              as resume_feedback,
  r.created_at            as resume_created_at,
  -- assessment 1 — CalibiAI
  a.session_id            as assessment_session_id,
  a.total                 as talent_score,
  a.grade,
  a.percentile,
  a.scores                as assessment_scores,
  a.ai_feedback           as assessment_ai_feedback,
  a.verifiable_hash,
  a.report_storage_key    as report_storage_key,
  a.created_at            as assessment_created_at,
  (a.session_id is not null
    or exists (
      select 1 from public.assessment_sessions s
      where s.student_id = p.id
        and s.assessment_no = 1
        and (s.status in ('submitted', 'expired') or s.submitted_at is not null)
    )
  )                       as assessment_attempted,
  -- assessment 2 — Capgemini 2027 mock
  b.session_id            as assessment2_session_id,
  b.total                 as assessment2_score,
  b.grade                 as assessment2_grade,
  b.percentile            as assessment2_percentile,
  b.scores                as assessment2_scores,
  b.ai_feedback           as assessment2_ai_feedback,
  b.verifiable_hash       as assessment2_verifiable_hash,
  b.created_at            as assessment2_created_at,
  -- CalibiAI Score (average of every completed assessment)
  c.calibi_score,
  coalesce(c.assessments_taken, 0) as assessments_taken,
  coalesce(c.company_taken, 0)     as company_taken,
  c.company_avg
from public.profiles p
left join lateral (
  select ra.*
  from public.resume_analyses ra
  where ra.student_id = p.id
  order by ra.created_at desc
  limit 1
) r on true
left join lateral (
  select ar.*
  from public.assessment_results ar
  where ar.student_id = p.id and ar.assessment_no = 1
  order by ar.created_at desc
  limit 1
) a on true
left join lateral (
  select ar2.*
  from public.assessment_results ar2
  where ar2.student_id = p.id and ar2.assessment_no = 2
  order by ar2.created_at desc
  limit 1
) b on true
left join public.student_calibiai_scores c on c.student_id = p.id;

comment on view public.student_profiles_full is
  'One row per student: profile + latest resume + assessment 1 (CalibiAI) + assessment 2 (Capgemini 2027 mock) + CalibiAI Score (average of every completed assessment incl. company mocks). Used by the /admin dashboard and exports.';

-- 4. Stat cards --------------------------------------------------------------
create view public.admin_stats
with (security_invoker = on)
as
select
  count(*)::int                                                     as total_students,
  count(*) filter (where v.assessment_attempted)::int               as assessed_students,
  count(v.talent_score)::int                                        as scored_students,
  round(avg(v.talent_score))::int                                   as avg_score,
  coalesce(
    array_agg(distinct btrim(v.college))
      filter (where v.college is not null and btrim(v.college) <> ''),
    '{}'
  )                                                                 as colleges,
  count(v.calibi_score)::int                                        as calibi_students,
  round(avg(v.calibi_score))::int                                   as avg_calibi,
  coalesce(sum(v.company_taken), 0)::int                            as company_attempts_completed
from public.student_profiles_full v
where v.role = 'student';

comment on view public.admin_stats is
  'Single-row aggregates for the /admin stat cards and college dropdown, including the average CalibiAI Score and completed company mocks. Read by GET /api/admin/meta.';

-- 5. Change probe (columns appended — existing columns keep their order) ------
drop view if exists public.admin_change_probe;
create view public.admin_change_probe
with (security_invoker = on)
as
select
  (select count(*)::int from public.profiles where role = 'student') as profiles_count,
  (select count(*)::int from public.assessment_results) as results_count,
  (select count(*)::int from public.resume_analyses) as resumes_count,
  (select count(*)::int from public.assessment_sessions) as sessions_count,
  (select count(*)::int from public.feedback_submissions) as feedback_count,
  (select max(updated_at) from public.profiles where role = 'student') as profiles_stamp,
  (select max(created_at) from public.assessment_results) as results_stamp,
  (select max(created_at) from public.resume_analyses) as resumes_stamp,
  (select max(coalesce(submitted_at, created_at)) from public.assessment_sessions) as sessions_stamp,
  (select max(created_at) from public.feedback_submissions) as feedback_stamp,
  (select count(*)::int from public.company_assessment_attempts) as company_count,
  (select max(updated_at) from public.company_assessment_attempts) as company_stamp;

comment on view public.admin_change_probe is
  'Small change probe for the admin live dashboard (incl. company mocks); contains no student payloads or JSONB.';
-- ===========================================================================
-- AI Mock Interview — Supabase persistence (no data loss)
-- Implements Section 11.3 Core Data Model + extended fields for production:
--   sessions, turns, code submissions, evaluations, reports, consents,
--   integrity events, feedback flags
-- All tables have RLS enabled; only service_role writes (like company attempts).
-- Student can read own rows via own policies.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Interview sessions — one per attempt, max 3 per student enforced in app
-- ---------------------------------------------------------------------------
create table if not exists public.interview_sessions (
  id                uuid primary key,
  student_id        uuid not null references public.profiles(id) on delete cascade,
  attempt_number    smallint not null check (attempt_number between 1 and 3),
  track             text not null check (track in ('swe','ai_ml')),
  year              smallint not null check (year in (2,3)),
  mode              text not null check (mode in ('quick','standard','full')),
  language_style    text not null default 'en' check (language_style in ('en','hinglish')),
  state             text not null default 'SCHEDULED'
                    check (state in (
                      'SCHEDULED','CREATED','CONSENTED','SETUP_CHECK',
                      'WARMUP','FUNDAMENTALS','PROBLEM_SOLVING','PROJECT_OR_DESIGN',
                      'BEHAVIOURAL','WRAP_UP','EVALUATING','REPORT_READY',
                      'PAUSED','DISCONNECTED','ABANDONED','TERMINATED'
                    )),
  previous_active_state text,
  scheduled_for     timestamptz,
  project_context   jsonb,
  blueprint         jsonb not null,
  custom_questions  jsonb not null default '{}'::jsonb,
  consent           jsonb,
  device_check      jsonb,
  hints_by_question jsonb not null default '{}'::jsonb,
  skipped_questions jsonb not null default '[]'::jsonb,
  abuse_strikes     int not null default 0,
  pause_count       int not null default 0,
  paused_at         timestamptz,
  total_paused_sec  int not null default 0,
  started_at        timestamptz,
  ended_at          timestamptz,
  last_active_at    timestamptz not null default now(),
  duration_sec      int not null default 0,
  token_usage       jsonb not null default '{"prompt_tokens":0,"completion_tokens":0,"cached_tokens":0,"estimated_cost_inr":0}'::jsonb,
  model_versions    jsonb not null default '{}'::jsonb,
  report_id         uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- One student max 3 active (non-abandoned) attempts is enforced in app,
-- but add partial unique to prevent duplicate attempt_number
create unique index if not exists interview_sessions_student_attempt_unique
  on public.interview_sessions (student_id, attempt_number);

create index if not exists interview_sessions_student_state_idx
  on public.interview_sessions (student_id, state, created_at desc);
create index if not exists interview_sessions_student_created_idx
  on public.interview_sessions (student_id, created_at desc);
create index if not exists interview_sessions_state_idx
  on public.interview_sessions (state);

-- ---------------------------------------------------------------------------
-- Interview turns — every Q&A turn, no data loss
-- ---------------------------------------------------------------------------
create table if not exists public.interview_turns (
  id                uuid primary key,
  session_id        uuid not null references public.interview_sessions(id) on delete cascade,
  student_id        uuid not null references public.profiles(id) on delete cascade,
  section           text not null,
  question_id       text not null,
  role              text not null check (role in ('interviewer','student')),
  text              text not null,
  is_follow_up      boolean not null default false,
  follow_up_index   int,
  hint_level        smallint not null default 0 check (hint_level between 0 and 3),
  input_mode        text not null default 'text' check (input_mode in ('text','voice','code')),
  code_snapshot     text,
  code_language     text,
  timestamp         timestamptz not null default now(),
  latency_ms        int,
  created_at        timestamptz not null default now()
);

create index if not exists interview_turns_session_idx
  on public.interview_turns (session_id, created_at asc);
create index if not exists interview_turns_student_idx
  on public.interview_turns (student_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Interview code submissions — each run, with test results
-- ---------------------------------------------------------------------------
create table if not exists public.interview_code_submissions (
  id                uuid primary key,
  session_id        uuid not null references public.interview_sessions(id) on delete cascade,
  student_id        uuid not null references public.profiles(id) on delete cascade,
  question_id       text not null,
  language          text not null,
  code              text not null,
  passed            int not null default 0,
  total             int not null default 0,
  test_results      jsonb not null default '[]'::jsonb,
  runtime_ms        int not null default 0,
  submitted_at      timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

create index if not exists interview_code_submissions_session_idx
  on public.interview_code_submissions (session_id, submitted_at desc);

-- ---------------------------------------------------------------------------
-- Interview evaluations — per-answer rubric scoring with evidence
-- ---------------------------------------------------------------------------
create table if not exists public.interview_evaluations (
  id                    uuid primary key,
  session_id            uuid not null references public.interview_sessions(id) on delete cascade,
  student_id            uuid not null references public.profiles(id) on delete cascade,
  question_id           text not null,
  question_prompt       text not null,
  section               text not null,
  topic                 jsonb not null default '[]'::jsonb,
  skipped               boolean not null default false,
  hints_used            smallint not null default 0,
  hint_penalty          numeric(4,2) not null default 0,
  raw_competency_scores jsonb not null default '{}'::jsonb,
  competency_scores     jsonb not null default '{}'::jsonb,
  key_points            jsonb not null default '[]'::jsonb,
  strengths             jsonb not null default '[]'::jsonb,
  gaps                  jsonb not null default '[]'::jsonb,
  student_quote         text,
  model_answer          text,
  model_answer_hint     text,
  code_review           jsonb,
  confidence            numeric(3,2) not null default 0.75,
  low_confidence        boolean not null default false,
  evaluator_engine      text not null default 'grounded-heuristic' check (evaluator_engine in ('deepseek','grounded-heuristic')),
  evaluated_at          timestamptz not null default now(),
  created_at            timestamptz not null default now()
);

create unique index if not exists interview_evaluations_session_question_unique
  on public.interview_evaluations (session_id, question_id);
create index if not exists interview_evaluations_student_idx
  on public.interview_evaluations (student_id, evaluated_at desc);

-- ---------------------------------------------------------------------------
-- Interview reports — final report, overall score computed server-side
-- ---------------------------------------------------------------------------
create table if not exists public.interview_reports (
  id                      uuid primary key,
  session_id              uuid not null unique references public.interview_sessions(id) on delete cascade,
  student_id              uuid not null references public.profiles(id) on delete cascade,
  attempt_number          smallint not null,
  track                   text not null,
  year                    smallint not null,
  mode                    text not null,
  language_style          text not null,
  overall_score           int not null check (overall_score between 0 and 100),
  band                    text not null,
  band_meaning            text not null,
  has_coding              boolean not null default false,
  duration_sec            int not null default 0,
  started_at              timestamptz,
  completed_at            timestamptz not null default now(),
  competencies            jsonb not null default '[]'::jsonb,
  top_strengths           jsonb not null default '[]'::jsonb,
  top_improvements        jsonb not null default '[]'::jsonb,
  question_reviews        jsonb not null default '[]'::jsonb,
  integrity_events        jsonb not null default '[]'::jsonb,
  learning_plan           jsonb not null default '[]'::jsonb,
  trend                   jsonb not null default '{}'::jsonb,
  low_confidence_warning  boolean not null default false,
  ai_summary              text,
  model_versions          jsonb not null default '{}'::jsonb,
  student_rating          jsonb,
  created_at              timestamptz not null default now()
);

create index if not exists interview_reports_student_created_idx
  on public.interview_reports (student_id, created_at desc);
create index if not exists interview_reports_student_score_idx
  on public.interview_reports (student_id, overall_score desc);

-- ---------------------------------------------------------------------------
-- Interview consents — explicit consent per session (GDPR/DPDP)
-- ---------------------------------------------------------------------------
create table if not exists public.interview_consents (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null references public.profiles(id) on delete cascade,
  session_id        uuid not null references public.interview_sessions(id) on delete cascade,
  scope             text not null check (scope in ('ai_notice','record','share_with_faculty','camera_mic')),
  granted_at        timestamptz not null default now(),
  revoked_at        timestamptz,
  details           jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);

create index if not exists interview_consents_session_idx
  on public.interview_consents (session_id);

-- ---------------------------------------------------------------------------
-- Interview integrity events — tab switch, paste, injection, etc.
-- ---------------------------------------------------------------------------
create table if not exists public.interview_integrity_events (
  id                uuid primary key,
  session_id        uuid not null references public.interview_sessions(id) on delete cascade,
  student_id        uuid not null references public.profiles(id) on delete cascade,
  type              text not null check (type in ('tab_switch','large_paste','fast_answer','repeated_answer','prompt_injection','camera_off','off_topic')),
  details           text not null,
  timestamp         timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

create index if not exists interview_integrity_session_idx
  on public.interview_integrity_events (session_id, timestamp asc);

-- ---------------------------------------------------------------------------
-- Interview feedback flags — unfair score flags for golden set (FR-46)
-- ---------------------------------------------------------------------------
create table if not exists public.interview_feedback_flags (
  id                uuid primary key,
  session_id        uuid not null references public.interview_sessions(id) on delete cascade,
  student_id        uuid not null references public.profiles(id) on delete cascade,
  question_id       text not null,
  reason            text not null,
  status            text not null default 'open' check (status in ('open','reviewed','added_to_golden_set')),
  created_at        timestamptz not null default now()
);

create index if not exists interview_feedback_student_idx
  on public.interview_feedback_flags (student_id, created_at desc);
create index if not exists interview_feedback_status_idx
  on public.interview_feedback_flags (status);

-- ===========================================================================
-- Row Level Security — own read, service_role writes (like company attempts)
-- ===========================================================================
alter table public.interview_sessions enable row level security;
alter table public.interview_turns enable row level security;
alter table public.interview_code_submissions enable row level security;
alter table public.interview_evaluations enable row level security;
alter table public.interview_reports enable row level security;
alter table public.interview_consents enable row level security;
alter table public.interview_integrity_events enable row level security;
alter table public.interview_feedback_flags enable row level security;

-- Own read policies
drop policy if exists "own interview sessions read" on public.interview_sessions;
create policy "own interview sessions read" on public.interview_sessions for select using (auth.uid() = student_id);

drop policy if exists "own interview turns read" on public.interview_turns;
create policy "own interview turns read" on public.interview_turns for select using (auth.uid() = student_id);

drop policy if exists "own interview code read" on public.interview_code_submissions;
create policy "own interview code read" on public.interview_code_submissions for select using (auth.uid() = student_id);

drop policy if exists "own interview evals read" on public.interview_evaluations;
create policy "own interview evals read" on public.interview_evaluations for select using (auth.uid() = student_id);

drop policy if exists "own interview reports read" on public.interview_reports;
create policy "own interview reports read" on public.interview_reports for select using (auth.uid() = student_id);

drop policy if exists "own interview consents read" on public.interview_consents;
create policy "own interview consents read" on public.interview_consents for select using (auth.uid() = student_id);

drop policy if exists "own interview integrity read" on public.interview_integrity_events;
create policy "own interview integrity read" on public.interview_integrity_events for select using (auth.uid() = student_id);

drop policy if exists "own interview feedback read" on public.interview_feedback_flags;
create policy "own interview feedback read" on public.interview_feedback_flags for select using (auth.uid() = student_id);

-- Tenant read for faculty/institution (same institution)
drop policy if exists "tenant interview sessions read" on public.interview_sessions;
create policy "tenant interview sessions read" on public.interview_sessions for select using (
  exists (select 1 from public.profiles p where p.id = interview_sessions.student_id and p.institution_id = (select institution_id from public.profiles where id = auth.uid()))
);

drop policy if exists "tenant interview reports read" on public.interview_reports;
create policy "tenant interview reports read" on public.interview_reports for select using (
  exists (select 1 from public.profiles p where p.id = interview_reports.student_id and p.institution_id = (select institution_id from public.profiles where id = auth.uid()))
);

-- No write policies — only service_role writes (server API)

-- ---------------------------------------------------------------------------
-- Update admin views to include interview counts
-- ---------------------------------------------------------------------------
drop view if exists public.admin_stats;
drop view if exists public.student_profiles_full;
drop view if exists public.student_calibiai_scores;

-- Re-create student_calibiai_scores with interviews included (optional, for future)
create view public.student_calibiai_scores
with (security_invoker = on)
as
with platform as (
  select distinct on (ar.student_id, ar.assessment_no)
         ar.student_id, ar.total
    from public.assessment_results ar
   where ar.total is not null
   order by ar.student_id, ar.assessment_no, ar.created_at desc
),
entries as (
  select student_id, least(100.0, greatest(0.0, total::numeric / 10.0)) as pct, false as is_company, false as is_interview
    from platform
  union all
  select student_id, least(100.0, greatest(0.0, score::numeric)) as pct, true as is_company, false as is_interview
    from public.company_assessment_attempts
   where status in ('submitted', 'expired') and score is not null
  union all
  select student_id, least(100.0, greatest(0.0, overall_score::numeric)) as pct, false as is_company, true as is_interview
    from public.interview_reports
)
select
  student_id,
  round(avg(pct) * 10)::int                        as calibi_score,
  count(*)::int                                    as assessments_taken,
  (count(*) filter (where is_company))::int        as company_taken,
  (count(*) filter (where is_interview))::int      as interview_taken,
  round(avg(pct) filter (where is_company), 1)     as company_avg,
  round(avg(pct) filter (where is_interview), 1)   as interview_avg
from entries
group by student_id;

-- Re-create student_profiles_full with interview latest
create view public.student_profiles_full
with (security_invoker = on)
as
select
  p.id                    as student_id,
  p.email,
  p.role,
  p.full_name,
  p.prn,
  p.phone,
  p.dob,
  p.gender,
  p.degree,
  p.college,
  p.institution_id,
  p.graduation_year,
  p.cgpa,
  p.skills,
  p.linkedin_url,
  p.github_url,
  p.ai_avatar,
  p.created_at            as profile_created_at,
  p.updated_at            as profile_updated_at,
  r.id                    as resume_id,
  r.storage_key           as resume_storage_key,
  r.resume_score,
  r.parsed                as resume_parsed,
  r.feedback              as resume_feedback,
  r.created_at            as resume_created_at,
  a.session_id            as assessment_session_id,
  a.total                 as talent_score,
  a.grade,
  a.percentile,
  a.scores                as assessment_scores,
  a.ai_feedback           as assessment_ai_feedback,
  a.verifiable_hash,
  a.report_storage_key    as report_storage_key,
  a.created_at            as assessment_created_at,
  (a.session_id is not null
    or exists (
      select 1 from public.assessment_sessions s
      where s.student_id = p.id
        and s.assessment_no = 1
        and (s.status in ('submitted', 'expired') or s.submitted_at is not null)
    )
  )                       as assessment_attempted,
  b.session_id            as assessment2_session_id,
  b.total                 as assessment2_score,
  b.grade                 as assessment2_grade,
  b.percentile            as assessment2_percentile,
  b.scores                as assessment2_scores,
  b.ai_feedback           as assessment2_ai_feedback,
  b.verifiable_hash       as assessment2_verifiable_hash,
  b.created_at            as assessment2_created_at,
  c.calibi_score,
  coalesce(c.assessments_taken, 0) as assessments_taken,
  coalesce(c.company_taken, 0)     as company_taken,
  coalesce(c.interview_taken, 0)   as interview_taken,
  c.company_avg,
  c.interview_avg,
  ir.id                   as interview_report_id,
  ir.overall_score        as interview_score,
  ir.band                 as interview_band,
  ir.created_at           as interview_created_at
from public.profiles p
left join lateral (
  select ra.* from public.resume_analyses ra where ra.student_id = p.id order by ra.created_at desc limit 1
) r on true
left join lateral (
  select ar.* from public.assessment_results ar where ar.student_id = p.id and ar.assessment_no = 1 order by ar.created_at desc limit 1
) a on true
left join lateral (
  select ar2.* from public.assessment_results ar2 where ar2.student_id = p.id and ar2.assessment_no = 2 order by ar2.created_at desc limit 1
) b on true
left join public.student_calibiai_scores c on c.student_id = p.id
left join lateral (
  select irp.* from public.interview_reports irp where irp.student_id = p.id order by irp.created_at desc limit 1
) ir on true;

create view public.admin_stats
with (security_invoker = on)
as
select
  count(*)::int                                                     as total_students,
  count(*) filter (where v.assessment_attempted)::int               as assessed_students,
  count(v.talent_score)::int                                        as scored_students,
  round(avg(v.talent_score))::int                                   as avg_score,
  coalesce(
    array_agg(distinct btrim(v.college))
      filter (where v.college is not null and btrim(v.college) <> ''),
    '{}'
  )                                                                 as colleges,
  count(v.calibi_score)::int                                        as calibi_students,
  round(avg(v.calibi_score))::int                                   as avg_calibi,
  coalesce(sum(v.company_taken), 0)::int                            as company_attempts_completed,
  coalesce(sum(v.interview_taken), 0)::int                          as interview_attempts_completed,
  round(avg(v.interview_score))::int                                as avg_interview_score
from public.student_profiles_full v
where v.role = 'student';

drop view if exists public.admin_change_probe;
create view public.admin_change_probe
with (security_invoker = on)
as
select
  (select count(*)::int from public.profiles where role = 'student') as profiles_count,
  (select count(*)::int from public.assessment_results) as results_count,
  (select count(*)::int from public.resume_analyses) as resumes_count,
  (select count(*)::int from public.assessment_sessions) as sessions_count,
  (select count(*)::int from public.feedback_submissions) as feedback_count,
  (select max(updated_at) from public.profiles where role = 'student') as profiles_stamp,
  (select max(created_at) from public.assessment_results) as results_stamp,
  (select max(created_at) from public.resume_analyses) as resumes_stamp,
  (select max(coalesce(submitted_at, created_at)) from public.assessment_sessions) as sessions_stamp,
  (select max(created_at) from public.feedback_submissions) as feedback_stamp,
  (select count(*)::int from public.company_assessment_attempts) as company_count,
  (select max(updated_at) from public.company_assessment_attempts) as company_stamp,
  (select count(*)::int from public.interview_sessions) as interview_sessions_count,
  (select count(*)::int from public.interview_reports) as interview_reports_count,
  (select max(updated_at) from public.interview_sessions) as interview_sessions_stamp,
  (select max(created_at) from public.interview_reports) as interview_reports_stamp;


-- ===========================================================================
-- Migration 0012 — atomic assessment writes and row-level security hardening
-- (identical to supabase/migrations/0012_atomic_writes_and_row_security.sql;
--  see docs/DATA_INTEGRITY.md)
-- ===========================================================================
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
