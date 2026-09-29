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
