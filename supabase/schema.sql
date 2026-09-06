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
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Index for fast login lookup by email (used by /api/auth/login)
create index if not exists profiles_email_idx on public.profiles (email);

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
  ai_feedback         jsonb,               -- DeepSeek feedback per subjective section
  report_storage_key  text,                -- PDF report path
  created_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- AI evaluation jobs (DeepSeek) — for speaking/writing/code/prompts
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
