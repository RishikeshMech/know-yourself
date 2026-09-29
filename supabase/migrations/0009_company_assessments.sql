-- ============================================================================
-- Migration 0009 — company-specific mock assessments
-- Run in the Supabase SQL editor (or `supabase db push`). Idempotent.
--
-- One row per (student, company). The UNIQUE constraint is the database-level
-- guarantee behind the product rule "a student can take each company
-- assessment only once"; the application derives the row id from the same
-- pair, so racing API instances converge on a single row.
--
-- Answer keys are never stored here — only question ids, the per-attempt
-- option order, the candidate's answers, the proctoring log and the graded
-- result. Writes require the service-role key (SUPABASE_SERVICE_ROLE_KEY);
-- students may only READ their own rows.
-- ============================================================================

create table if not exists public.company_assessment_attempts (
  id              uuid primary key,
  student_id      uuid not null references public.profiles(id) on delete cascade,
  company_slug    text not null check (company_slug ~ '^[a-z0-9-]{2,64}$'),
  status          text not null default 'in_progress'
                  check (status in ('in_progress', 'submitted', 'expired')),
  question_seed   bigint not null default 0,
  paper           jsonb not null,                 -- question ids + option order per round
  answers         jsonb not null default '{}'::jsonb,
  proctoring      jsonb not null default '{}'::jsonb,  -- warnings, camera, event log
  started_at      timestamptz not null default now(),
  expires_at      timestamptz not null,           -- server-authoritative deadline
  duration_sec    int not null check (duration_sec > 0),
  submitted_at    timestamptz,
  auto_submitted  boolean not null default false,
  submit_reason   text,
  score           numeric(5, 1) check (score is null or (score >= 0 and score <= 100)),
  verdict         text check (verdict is null or verdict in ('ready', 'almost', 'borderline', 'not-yet')),
  result          jsonb,                          -- rounds, sections, item grades
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint company_assessment_one_attempt unique (student_id, company_slug)
);

create index if not exists company_attempts_student_idx
  on public.company_assessment_attempts (student_id, updated_at desc);
create index if not exists company_attempts_company_status_idx
  on public.company_assessment_attempts (company_slug, status);

comment on table public.company_assessment_attempts is
  'Company mock assessments (see lib/company). One attempt per student per company, enforced by company_assessment_one_attempt.';

-- A finished attempt is final: it can never be reopened or re-scored.
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

-- Institution staff can read attempts of students in their institution
-- (mirrors "tenant results read" on assessment_results).
drop policy if exists "tenant company attempts read" on public.company_assessment_attempts;
create policy "tenant company attempts read" on public.company_assessment_attempts
  for select using (
    exists (
      select 1 from public.profiles p
       where p.id = company_assessment_attempts.student_id
         and p.institution_id = (select institution_id from public.profiles where id = auth.uid())
    )
  );

-- Intentionally NO insert / update / delete policies: only the server
-- (service role, which bypasses RLS) writes, so a student can never create,
-- reopen or re-score an attempt directly from the browser.
