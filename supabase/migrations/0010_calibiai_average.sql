-- ============================================================================
-- Migration 0010 — CalibiAI Score = average of every completed assessment
-- Run after 0001–0009 in the Supabase SQL editor (or `supabase db push`).
-- Idempotent and self-sufficient: safe on databases where 0008 failed.
--
-- The student's headline CalibiAI Score is the AVERAGE of every assessment
-- they have completed, each normalised to the 1000-point scale:
--   assessment 1 (CalibiAI, /1000) · assessment 2 (Capgemini 2027 mock, /1000)
--   · every submitted/expired company mock (/100, ×10).
--     calibi_score = round( avg(percent_i) × 10 )
-- The application computes the same number itself (lib/calibiScore.ts — keep
-- the two in sync) and works without this migration; applying it lets the
-- admin table SORT by it in SQL and adds it to the stat cards / change probe.
--
--  1. assessment_no on sessions/results (from 0008, in case 0008 failed).
--  2. student_calibiai_scores — one row per student: calibi_score,
--     assessments_taken, company_taken, company_avg.
--  3. student_profiles_full — re-created as a superset of every earlier shape
--     (0002/0003/0006/0008): assessment 1 strictly from assessment_no = 1,
--     assessment 2 columns, assessment_attempted, plus the CalibiAI columns.
--  4. admin_stats — adds calibi_students, avg_calibi,
--     company_attempts_completed.
--  5. admin_change_probe — adds company_count, company_stamp so the live admin
--     refreshes when a company mock is started or submitted.
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
-- Use DROP+CREATE not CREATE OR REPLACE so re-running after newer migrations
-- (e.g. 0011 interview tables) does not error with \"cannot drop columns\".
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
