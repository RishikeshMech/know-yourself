-- ============================================================================
-- Migration 0008 — second assessment (Capgemini 2027 mock)
-- Run in the Supabase SQL editor (or `supabase db push`). Idempotent.
--
-- A student can now take TWO assessments:
--   1 = the original CalibiAI 120-minute assessment (every existing row)
--   2 = the Capgemini 2027 mock, unlocked only after assessment 1 is complete
--
-- `assessment_no` tags each session and each result so the two attempts never
-- overwrite one another. The application also stamps the marker inside the
-- `scores` / `answers` JSONB, so it keeps working before this migration runs —
-- applying it simply makes the column queryable and enforces the one-attempt
-- -per-assessment rules below.
-- ============================================================================

alter table public.assessment_sessions
  add column if not exists assessment_no smallint not null default 1;

alter table public.assessment_results
  add column if not exists assessment_no smallint not null default 1;

comment on column public.assessment_sessions.assessment_no is
  '1 = CalibiAI assessment, 2 = Capgemini 2027 mock assessment.';
comment on column public.assessment_results.assessment_no is
  '1 = CalibiAI assessment, 2 = Capgemini 2027 mock assessment.';

-- Backfill from the JSONB marker for any row written before this migration.
update public.assessment_sessions
   set assessment_no = 2
 where assessment_no = 1
   and (answers ->> '__assessment_no') = '2';

update public.assessment_results
   set assessment_no = 2
 where assessment_no = 1
   and (scores ->> 'assessment_no') = '2';

-- ---------------------------------------------------------------------------
-- One active session per student PER ASSESSMENT.
--
-- The old partial unique index covered (student_id) alone, which would expire a
-- running CalibiAI attempt the moment a student started the Capgemini mock.
-- Re-create it scoped by assessment_no.
-- ---------------------------------------------------------------------------
-- The base schema's index may carry any name, so find every partial unique
-- index on assessment_sessions that does NOT already include assessment_no and
-- drop it. Leaving one in place would expire a running CalibiAI attempt as soon
-- as the student opened the Capgemini mock.
do $$
declare
  idx record;
begin
  for idx in
    select i.relname as name, pg_get_indexdef(ix.indexrelid) as def
      from pg_index ix
      join pg_class i on i.oid = ix.indexrelid
      join pg_class t on t.oid = ix.indrelid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public'
       and t.relname = 'assessment_sessions'
       and ix.indisunique
       and ix.indpred is not null
  loop
    if idx.def not like '%assessment_no%' then
      execute format('drop index if exists public.%I', idx.name);
    end if;
  end loop;
end $$;

create unique index if not exists assessment_sessions_one_active_per_assessment_idx
  on public.assessment_sessions (student_id, assessment_no)
  where status = 'in_progress';

-- Lookup index for "latest result for this student in this assessment".
-- Deliberately NOT unique: historical data may already contain more than one
-- assessment-1 row per student, and the application always reads the newest.
create index if not exists assessment_results_student_assessment_idx
  on public.assessment_results (student_id, assessment_no, created_at desc);

-- ---------------------------------------------------------------------------
-- Re-create the download view so both attempts are exported side by side.
-- ---------------------------------------------------------------------------
drop view if exists public.student_profiles_full;

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
  -- assessment 2 — Capgemini 2027 mock
  b.session_id            as assessment2_session_id,
  b.total                 as assessment2_score,
  b.grade                 as assessment2_grade,
  b.percentile            as assessment2_percentile,
  b.scores                as assessment2_scores,
  b.ai_feedback           as assessment2_ai_feedback,
  b.verifiable_hash       as assessment2_verifiable_hash,
  b.created_at            as assessment2_created_at
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
) b on true;

comment on view public.student_profiles_full is
  'One row per student: profile + latest resume analysis + both assessment results (1 = CalibiAI, 2 = Capgemini 2027 mock). Use the Supabase table editor export (CSV/Excel/JSON) to download all data.';
