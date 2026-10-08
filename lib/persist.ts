// Supabase persistence helpers used by the API routes. See docs/DATA_INTEGRITY.md.
//
// Each helper receives the client explicitly. Student-owned rows are written and
// read with the STUDENT'S client (getUserClient: row-level security decides what
// is visible), so they do not depend on the service key. Writes report their
// outcome (PersistOutcome) instead of logging and returning success, so a route
// can tell the candidate whether the data actually reached the database.
//
// Assessment start, autosave and final submit are single database functions
// (migration 0012): each step is one transaction, applied completely or not at all.
//
// Feedback and help requests are the exception: Supabase is the DESTINATION and
// the local store is only the retry queue used while Postgres is unreachable (see
// lib/feedbackStore.ts / lib/helpStore.ts). Both write with a plain INSERT.
import { randomUUID } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
// Same deterministic id mapping the "Write candidates into Supabase" job uses,
// so a feedback row written at runtime and the same row replayed by the seed
// job share one primary key (no duplicates).
import { mapId } from './supabaseSeed.ts'

export interface AuthResult {
  user: { id: string; email: string; name?: string }
  access_token: string | null
  refresh_token: string | null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// Explicit projections keep the dashboard/auth reconciliation path bounded even
// when a profile or assessment row gains a large JSON/text column later.
export const PROFILE_SELECT = [
  'id', 'email', 'role', 'full_name', 'prn', 'phone', 'dob', 'gender', 'degree',
  'college', 'institution_id', 'graduation_year', 'cgpa', 'skills',
  'linkedin_url', 'github_url', 'ai_avatar', 'created_at', 'updated_at',
].join(',')

export const ASSESSMENT_RESULT_SELECT = [
  'id', 'session_id', 'student_id', 'scores', 'total', 'grade', 'percentile',
  'verifiable_hash', 'ai_feedback', 'report_storage_key', 'created_at',
].join(',')

/**
 * Which assessment a row belongs to: 1 = the CalibiAI assessment, 2 = the
 * Capgemini 2027 mock. The marker is written into the `scores` / `answers`
 * JSONB (always available) and, when migration 0008 has been applied, into a
 * real `assessment_no` column too. Reading falls back to the JSONB so the
 * feature works even before the migration runs.
 */
export function assessmentNoOf(row: any): number {
  const n = Number(row?.assessment_no ?? row?.scores?.assessment_no ?? row?.answers?.__assessment_no ?? 1)
  return Number.isFinite(n) && n >= 1 ? n : 1
}

function clean(v: any): string | null {
  const s = String(v ?? '').trim()
  return s ? s : null
}

/**
 * Postgres `uuid` columns reject the short local-demo ids the client used to
 * send ("sess_abc123"). The old fallback called `randomUUID()` here, which
 * meant every autosave created a different session id and could expire the
 * previous active row on every request. That is both a correctness bug and a
 * very expensive write storm.
 *
 * Keep real UUIDs unchanged and map local ids deterministically. The scope is
 * part of the namespace so profile, session and result ids cannot collide and
 * retries always address the same Postgres row. `mapId` uses the same stable
 * UUID scheme as the admin seed job.
 */
export function toUuid(value: any, scope = 'profile'): string | null {
  const s = String(value ?? '').trim()
  if (!s) return null
  if (UUID_RE.test(s)) return s
  return mapId(scope, s)
}

/** Email + password live in Supabase Auth (auth.users); metadata seeds the profile row. */
export async function supabaseSignUp(
  client: SupabaseClient,
  input: { email: string; password: string; full_name?: string; role?: string },
): Promise<AuthResult> {
  const useAdmin = !!(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (useAdmin) {
    const { data, error } = await client.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { full_name: input.full_name || '', role: input.role || 'student' },
    })
    if (error) throw new Error(error.message)
    // Issue a session right away so the new account can go straight to onboarding.
    const session = await client.auth.signInWithPassword({ email: input.email, password: input.password })
    if (!session.error && session.data.session) {
      return {
        user: { id: session.data.user!.id, email: session.data.user!.email!, name: input.full_name },
        access_token: session.data.session.access_token,
        refresh_token: session.data.session.refresh_token,
      }
    }
    return { user: { id: data.user!.id, email: data.user!.email!, name: input.full_name }, access_token: null, refresh_token: null }
  }

  const { data, error } = await client.auth.signUp({
    email: input.email,
    password: input.password,
    options: { data: { full_name: input.full_name || '', role: input.role || 'student' } },
  })
  if (error) throw new Error(error.message)
  if (data.session) {
    return {
      user: { id: data.user!.id, email: data.user!.email!, name: input.full_name },
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    }
  }
  // Project may have email confirmation enabled — try signing straight in anyway.
  const si = await client.auth.signInWithPassword({ email: input.email, password: input.password })
  if (!si.error && si.data.session) {
    return {
      user: { id: si.data.user!.id, email: si.data.user!.email!, name: input.full_name },
      access_token: si.data.session.access_token,
      refresh_token: si.data.session.refresh_token,
    }
  }
  throw new Error('Account created — please confirm your email, then sign in.')
}

export async function supabaseSignIn(
  client: SupabaseClient,
  input: { email: string; password: string },
): Promise<AuthResult> {
  const { data, error } = await client.auth.signInWithPassword(input)
  if (error || !data.session) throw new Error(error?.message || 'Invalid credentials.')
  const meta: any = (data.user?.user_metadata as any) || {}
  return {
    user: { id: data.user!.id, email: data.user!.email!, name: meta.full_name || undefined },
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  }
}

/* ------------------------------------------------------------------ */
/* Profile, resume and tracking — rows owned by the signed-in student   */
/* ------------------------------------------------------------------ */
// Callers pass the STUDENT'S client (getUserClient): row-level security then
// limits every statement to that student's own rows. Errors are returned as
// outcomes, never swallowed, so the API can tell the candidate the truth.

/** The Supabase row for an onboarding/profile save. `email` is NOT NULL. */
function profileRow(p: any): Record<string, any> {
  return {
    id: p.id || p.user_id,
    email: clean(p.email),
    full_name: clean(p.full_name),
    prn: clean(p.prn),
    phone: clean(p.phone),
    dob: clean(p.dob),
    gender: clean(p.gender),
    degree: clean(p.degree),
    college: clean(p.college),
    graduation_year: Number(p.graduation_year) || null,
    cgpa: Number(p.cgpa) || null,
    skills: clean(p.skills),
    linkedin_url: clean(p.linkedin_url),
    github_url: clean(p.github_url),
    ai_avatar: p.ai_avatar && typeof p.ai_avatar === 'object' ? p.ai_avatar : null,
    updated_at: new Date().toISOString(),
  }
}

/** Mirrors the full onboarding form (mobile, gender, degree, …) into public.profiles. */
export async function persistProfileOutcome(client: SupabaseClient, p: any): Promise<PersistOutcome> {
  try {
    const { error } = await client.from('profiles').upsert(profileRow(p), { onConflict: 'id' })
    if (error) {
      console.warn('[supabase] profile persist failed:', error.message)
      return outcomeOf(error)
    }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, message: e?.message || String(e) }
  }
}

export async function persistProfile(client: SupabaseClient, p: any): Promise<boolean> {
  return (await persistProfileOutcome(client, p)).ok
}

/** The student's profile row. A failed read is reported, not reported as "no profile". */
export async function readProfile(client: SupabaseClient, userId: string): Promise<{ profile: any | null; error?: PersistOutcome }> {
  try {
    const { data, error } = await client.from('profiles').select(PROFILE_SELECT).eq('id', userId).maybeSingle()
    if (error) return { profile: null, error: outcomeOf(error) }
    return { profile: data || null }
  } catch (e: any) {
    return { profile: null, error: { ok: false, message: e?.message || String(e) } }
  }
}

/** Latest profile row for a user (login/signup route on it; a failed read counts as none). */
export async function fetchProfile(client: SupabaseClient, userId: string): Promise<any | null> {
  return (await readProfile(client, userId)).profile
}

function resumeRow(rec: any): Record<string, any> {
  return {
    student_id: rec.student_id,
    storage_key: rec.storage_key || null,
    resume_score: rec.resume_score ?? 0,
    parsed: {
      name: rec.parsed?.name,
      experience_years: rec.experience?.years ?? rec.parsed?.experience_years ?? 0,
      projects: rec.parsed?.projects ?? 0,
      skills: rec.skills ?? rec.parsed?.skills ?? [],
      engine: rec.engine,
      name_match: rec.name_match,
      detected_name: rec.detected_name,
      flags: rec.flags,
      summary: rec.summary,
      professionalism: rec.professionalism,
      word_count: rec.word_count,
      file_name: rec.file_name,
    },
    feedback: rec.feedback || {},
  }
}

export async function persistResumeOutcome(client: SupabaseClient, rec: any): Promise<PersistOutcome> {
  try {
    const { error } = await client.from('resume_analyses').insert(resumeRow(rec))
    if (error) {
      console.warn('[supabase] resume persist failed:', error.message)
      return outcomeOf(error)
    }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, message: e?.message || String(e) }
  }
}

export const RESUME_SELECT = 'id,student_id,storage_key,resume_score,parsed,feedback,created_at'

/** The student's latest resume analysis, from Postgres. */
export async function readLatestResume(client: SupabaseClient, studentId: string): Promise<{ analysis: any | null; error?: PersistOutcome }> {
  try {
    const { data, error } = await client
      .from('resume_analyses')
      .select(RESUME_SELECT)
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) return { analysis: null, error: outcomeOf(error) }
    return { analysis: data || null }
  } catch (e: any) {
    return { analysis: null, error: { ok: false, message: e?.message || String(e) } }
  }
}

function trackingRow(ev: any): Record<string, any> {
  return {
    id: String(ev.id),
    user_id: ev.user_id,
    action: ev.action || '',
    completed: !!ev.completed,
    completed_at: ev.completed ? (ev.completed_at || new Date().toISOString()) : null,
  }
}

/** WhatsApp / LinkedIn follow steps. The id is deterministic per student and action. */
export async function persistTrackingOutcome(client: SupabaseClient, ev: any): Promise<PersistOutcome> {
  try {
    const { error } = await client.from('tracking_events').upsert(trackingRow(ev), { onConflict: 'id' })
    if (error) {
      console.warn('[supabase] tracking persist failed:', error.message)
      return outcomeOf(error)
    }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, message: e?.message || String(e) }
  }
}

export async function readTrackingEvents(client: SupabaseClient, userId: string): Promise<{ events: any[]; error?: PersistOutcome }> {
  try {
    const { data, error } = await client
      .from('tracking_events')
      .select('id,user_id,action,completed,completed_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
    if (error) return { events: [], error: outcomeOf(error) }
    return { events: data || [] }
  } catch (e: any) {
    return { events: [], error: { ok: false, message: e?.message || String(e) } }
  }
}

/** What happened when a row was written to Postgres (or why it was not). */
export interface PersistOutcome {
  ok: boolean
  /** SQLSTATE from Postgres (`23505`, `42501`, `42P01`, `23503`, …). */
  code?: string
  message?: string
  /** The row was already there — a retry of the same submission id. */
  duplicate?: boolean
  /** The table does not exist yet (the migration has not been applied). */
  tableMissing?: boolean
  /** `student_id` had to be dropped because the referenced profile is missing. */
  detachedFromProfile?: boolean
}

const DUPLICATE_KEY = '23505'
const FK_VIOLATION = '23503'
const UNDEFINED_TABLE = '42P01'

function outcomeOf(error: any): PersistOutcome {
  const code = String(error?.code ?? '').trim() || undefined
  return {
    ok: false,
    code,
    message: String(error?.message ?? error ?? 'Unknown database error'),
    tableMissing: code === UNDEFINED_TABLE,
  }
}

/**
 * Candidate feedback about the assessment ("which candidate gave which
 * feedback") → `public.feedback_submissions`. `student_id` is only written when
 * it is a real UUID: local demo candidates carry `u_…` ids that Postgres cannot
 * store, so the raw id is kept in `student_ref` and the email is stored too, so
 * the admin dashboard can match the feedback either way.
 *
 * The id is mapped with `mapId('feedback', …)` — the same function the
 * "Write candidates into Supabase" seed job uses — so a submission written here
 * and a submission written by the seed job land on the same primary key instead
 * of duplicating.
 */
export function feedbackRow(fb: any): Record<string, any> {
  return {
    id: mapId('feedback', fb.id) || randomUUID(),
    student_id: UUID_RE.test(String(fb.student_id || '')) ? String(fb.student_id) : null,
    student_ref: clean(fb.student_id),
    email: clean(fb.email),
    session_id: clean(fb.session_id),
    rating: Number(fb.rating) || null,
    message: String(fb.message ?? '').trim(),
    source: clean(fb.source) || 'web',
    created_at: fb.created_at || new Date().toISOString(),
  }
}

/**
 * One write attempt.
 *
 * A plain `insert` is tried first — `feedback_submissions` has an insert policy
 * for everyone and postgrest-js sends no `return=representation`, so an
 * anonymous (non-service-role) server key is enough.
 *
 * The old code used `.upsert(…, { onConflict: 'id' })`, which PostgREST turns
 * into `INSERT … ON CONFLICT DO UPDATE`. That statement also needs an UPDATE
 * RLS policy, and the table only has insert + select-own — so every write made
 * with the anon key failed with `42501 new row violates row-level security
 * policy`, the route answered 503, and the candidate was left stuck on
 * `/feedback` with their report unreachable. Duplicates are handled by reading
 * the `23505` error instead of asking the database to merge rows, and an
 * ignore-duplicates upsert (which needs only INSERT) is kept as a fallback.
 */
async function insertWithFallback(
  client: SupabaseClient,
  table: string,
  row: Record<string, any>,
): Promise<PersistOutcome> {
  const { error } = await client.from(table).insert(row)
  if (!error) return { ok: true }
  if (String(error.code) === DUPLICATE_KEY) return { ok: true, duplicate: true }

  const retry = await client.from(table).upsert(row, { onConflict: 'id', ignoreDuplicates: true })
  if (!retry.error) return { ok: true }
  if (String(retry.error.code) === DUPLICATE_KEY) return { ok: true, duplicate: true }

  // Prefer the more actionable of the two errors: a missing table explains every
  // other failure, so that is the one an operator should see.
  const primary = [error, retry.error].find(e => String(e?.code) === UNDEFINED_TABLE) || error
  return outcomeOf(primary)
}

async function writeFeedbackRow(client: SupabaseClient, row: Record<string, any>): Promise<PersistOutcome> {
  return insertWithFallback(client, 'feedback_submissions', row)
}

/** Write one feedback row, with the recoveries above. Never throws. */
export async function persistFeedbackDetailed(client: SupabaseClient, fb: any): Promise<PersistOutcome> {
  try {
    const row = feedbackRow(fb)
    const attempt = await writeFeedbackRow(client, row)
    if (attempt.ok) return attempt
    // The candidate's id can be a perfectly valid UUID with no `profiles` row
    // (a local account whose profile never reached Postgres). Drop the FK and
    // keep `student_ref` + `email` — the admin dashboard matches on both.
    if (attempt.code === FK_VIOLATION && row.student_id) {
      const detached = await writeFeedbackRow(client, { ...row, student_id: null })
      if (detached.ok) return { ...detached, detachedFromProfile: true }
    }
    return attempt
  } catch (e: any) {
    return { ok: false, message: e?.message || String(e) }
  }
}

/** Boolean wrapper kept for callers that only need "did it land?". */
export async function persistFeedback(client: SupabaseClient, fb: any): Promise<boolean> {
  const outcome = await persistFeedbackDetailed(client, fb)
  if (!outcome.ok) console.warn('[supabase] feedback persist failed:', outcome.code || '', outcome.message)
  return outcome.ok
}

/**
 * A support request from the in-app help form → `public.help_requests`.
 * Same insert-first strategy as feedback: no third-party form service, no
 * monthly submission limit, and the row is readable by the team in Supabase.
 */
export function helpRequestRow(req: any): Record<string, any> {
  return {
    id: mapId('help', req.id) || randomUUID(),
    student_id: UUID_RE.test(String(req.student_id || '')) ? String(req.student_id) : null,
    student_ref: clean(req.student_id),
    email: clean(req.email),
    phone: clean(req.phone),
    message: String(req.message ?? '').trim(),
    page: clean(req.page),
    source: clean(req.source) || 'web',
    created_at: req.created_at || new Date().toISOString(),
  }
}

export async function persistHelpRequestDetailed(client: SupabaseClient, req: any): Promise<PersistOutcome> {
  try {
    const row = helpRequestRow(req)
    const attempt = await insertWithFallback(client, 'help_requests', row)
    if (attempt.ok) return attempt
    if (attempt.code === FK_VIOLATION && row.student_id) {
      const detached = await client.from('help_requests').insert({ ...row, student_id: null })
      if (!detached.error) return { ok: true, detachedFromProfile: true }
    }
    return attempt
  } catch (e: any) {
    return { ok: false, message: e?.message || String(e) }
  }
}

/** Every help request (admin view) — null when the table is not there yet. */
export async function fetchAllHelpRequests(client: SupabaseClient): Promise<any[] | null> {
  try {
    const { data, error } = await client
      .from('help_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) {
      console.warn('[supabase] help request read failed:', error.message)
      return null
    }
    return data || []
  } catch (e: any) {
    console.warn('[supabase] help request read failed:', e?.message || e)
    return null
  }
}

/** Every feedback row (admin dashboard) — null when the table is not there yet. */
const FEEDBACK_SELECT = 'id,student_id,student_ref,email,session_id,rating,message,source,created_at'

export async function fetchAllFeedback(client: SupabaseClient, limit = 500): Promise<any[] | null> {
  try {
    const { data, error } = await client
      .from('feedback_submissions')
      .select(FEEDBACK_SELECT)
      .order('created_at', { ascending: false })
      // Feedback is user-entered and unbounded. Never let an admin refresh or
      // candidate lookup transfer the entire history without a hard ceiling;
      // explicit exports can be implemented as a separate paginated job.
      .limit(Math.max(1, Math.min(500, limit)))
    if (error) {
      console.warn('[supabase] feedback read failed:', error.message)
      return null
    }
    return data || []
  } catch (e: any) {
    console.warn('[supabase] feedback read failed:', e?.message || e)
    return null
  }
}

/** Candidate-scoped feedback lookup. Never fetch the global feedback table for
 * a single student: the old endpoint downloaded up to the entire history and
 * filtered it in Node, making egress grow with every candidate's request. */
export async function fetchFeedbackForStudent(
  client: SupabaseClient,
  studentId: string,
  email: string,
): Promise<any[] | null> {
  try {
    const queries: Promise<any>[] = []
    if (studentId.trim()) {
      queries.push(client.from('feedback_submissions').select(FEEDBACK_SELECT).eq('student_ref', studentId.trim()).order('created_at', { ascending: false }).limit(100))
    }
    if (email.trim()) {
      queries.push(client.from('feedback_submissions').select(FEEDBACK_SELECT).eq('email', email.trim().toLowerCase()).order('created_at', { ascending: false }).limit(100))
    }
    if (!queries.length) return []
    const results = await Promise.all(queries)
    if (results.some(r => r.error)) return null
    const seen = new Set<string>()
    return results.flatMap(r => r.data || []).filter((row: any) => {
      const key = String(row.id || `${row.created_at}|${row.message}`)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }).sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ */
/* Assessments — every write is ONE database transaction (migration 0012) */
/* ------------------------------------------------------------------ */
// start / autosave / submit are each a single SQL function call, so the
// database either applies the whole step or none of it:
//   start_assessment_session  closes the previous attempt of the same assessment
//                             and opens the new one;
//   save_assessment_progress  autosave — never reopens or rewrites a finished attempt;
//   submit_assessment         finalises the session AND stores its result, or neither.
// The API never writes these tables with a separate statement any more.

export interface AttemptWrite {
  id: string
  studentId: string
  assessmentNo: number
  answers?: Record<string, unknown>
  tabSwitches?: number
  startedAt?: string | null
  expiresAt?: string | null
  durationSec?: number
  questionSeed?: number | null
}

/** Opens an attempt; closes the same student's previous open attempt of this assessment. */
export async function startAssessmentAttempt(client: SupabaseClient, a: AttemptWrite): Promise<PersistOutcome & { data?: any }> {
  try {
    const { data, error } = await client.rpc('start_assessment_session', {
      p_session_id: a.id,
      p_student_id: a.studentId,
      p_assessment_no: a.assessmentNo,
      p_started_at: a.startedAt ?? null,
      p_expires_at: a.expiresAt ?? null,
      p_duration_sec: a.durationSec ?? 7200,
      p_question_seed: a.questionSeed ?? null,
      p_answers: a.answers ?? {},
    })
    if (error) return outcomeOf(error)
    return { ok: true, data }
  } catch (e: any) {
    return { ok: false, message: e?.message || String(e) }
  }
}

/** Autosave of answers while the attempt is in progress. A finished attempt is returned unchanged. */
export async function saveAssessmentProgress(client: SupabaseClient, a: AttemptWrite): Promise<PersistOutcome & { data?: any }> {
  try {
    const { data, error } = await client.rpc('save_assessment_progress', {
      p_session_id: a.id,
      p_student_id: a.studentId,
      p_assessment_no: a.assessmentNo,
      p_answers: a.answers ?? {},
      p_tab_switches: a.tabSwitches ?? 0,
      p_started_at: a.startedAt ?? null,
      p_expires_at: a.expiresAt ?? null,
      p_duration_sec: a.durationSec ?? 7200,
      p_question_seed: a.questionSeed ?? null,
    })
    if (error) return outcomeOf(error)
    return { ok: true, data }
  } catch (e: any) {
    return { ok: false, message: e?.message || String(e) }
  }
}

export interface SubmitWrite extends AttemptWrite {
  expired: boolean
  submittedAt: string
  scores: Record<string, unknown>
  total: number
  grade: string
  percentile: number | null
  verifiableHash: string | null
  aiFeedback: Record<string, unknown>
}

/** Final submit: session + result in one transaction. Retrying the same submit is safe. */
export async function submitAssessmentAttempt(client: SupabaseClient, s: SubmitWrite): Promise<PersistOutcome & { data?: any }> {
  try {
    const { data, error } = await client.rpc('submit_assessment', {
      p_session_id: s.id,
      p_student_id: s.studentId,
      p_assessment_no: s.assessmentNo,
      p_answers: s.answers ?? {},
      p_tab_switches: s.tabSwitches ?? 0,
      p_expired: !!s.expired,
      p_submitted_at: s.submittedAt,
      p_started_at: s.startedAt ?? null,
      p_expires_at: s.expiresAt ?? null,
      p_duration_sec: s.durationSec ?? 7200,
      p_question_seed: s.questionSeed ?? null,
      p_scores: s.scores,
      p_total: s.total,
      p_grade: s.grade,
      p_percentile: s.percentile,
      p_verifiable_hash: s.verifiableHash,
      p_ai_feedback: s.aiFeedback,
    })
    if (error) return outcomeOf(error)
    return { ok: true, data }
  } catch (e: any) {
    return { ok: false, message: e?.message || String(e) }
  }
}

/** One assessment session row (RLS: the caller's own). A failed read is reported. */
export async function readAssessmentSession(client: SupabaseClient, sessionId: string): Promise<{ session: any | null; error?: PersistOutcome }> {
  try {
    const { data, error } = await client.from('assessment_sessions').select('*').eq('id', sessionId).maybeSingle()
    if (error) return { session: null, error: outcomeOf(error) }
    return { session: data || null }
  } catch (e: any) {
    return { session: null, error: { ok: false, message: e?.message || String(e) } }
  }
}

/** The student's open attempt for one assessment, if any. */
export async function readActiveAssessmentSession(
  client: SupabaseClient,
  studentId: string,
  assessmentNo = 1,
): Promise<{ session: any | null; error?: PersistOutcome }> {
  try {
    // Filtered in Node by the assessment marker so this also works before
    // migration 0008 (the dedicated column) is applied.
    const { data, error } = await client
      .from('assessment_sessions')
      .select('*')
      .eq('student_id', studentId)
      .eq('status', 'in_progress')
      .order('started_at', { ascending: false })
      .limit(5)
    if (error) return { session: null, error: outcomeOf(error) }
    const rows = Array.isArray(data) ? data : []
    return { session: rows.find(row => assessmentNoOf(row) === assessmentNo) || null }
  } catch (e: any) {
    return { session: null, error: { ok: false, message: e?.message || String(e) } }
  }
}

/** The student's latest result for one assessment. A failed read is reported. */
export async function readLatestResult(
  client: SupabaseClient,
  studentId: string,
  assessmentNo = 1,
): Promise<{ result: any | null; error?: PersistOutcome }> {
  try {
    // A student has at most one result per assessment, so a small window is
    // enough; the marker is read from the row (column or JSONB) in Node.
    const { data, error } = await client
      .from('assessment_results')
      .select(ASSESSMENT_RESULT_SELECT)
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(5)
    if (error) return { result: null, error: outcomeOf(error) }
    const rows = Array.isArray(data) ? data : []
    return { result: rows.find(row => assessmentNoOf(row) === assessmentNo) || null }
  } catch (e: any) {
    return { result: null, error: { ok: false, message: e?.message || String(e) } }
  }
}

export async function hasAssessmentResult(client: SupabaseClient, userId: string): Promise<boolean> {
  try {
    const { data } = await client
      .from('assessment_results')
      .select('id')
      .eq('student_id', userId)
      .limit(1)
    return !!data && data.length > 0
  } catch {
    return false
  }
}

/* ------------------------------------------------------------------ */
/* Company assessments (public.company_assessment_attempts)             */
/* ------------------------------------------------------------------ */
// One row per (student, company): the UNIQUE (student_id, company_slug)
// constraint is the database-level guarantee behind "one attempt per company".
// The row id is derived deterministically from the same pair (see
// lib/company/attempts.ts), so racing instances converge on a single row.
// Answer keys are never stored here — only question ids, the per-attempt
// option order, the candidate's answers and the graded result.

export const COMPANY_ATTEMPT_SUMMARY_SELECT = [
  'id', 'student_id', 'company_slug', 'status', 'started_at', 'expires_at', 'duration_sec',
  'submitted_at', 'auto_submitted', 'score', 'verdict', 'skill_items:result->items',
].join(',')

export function companyAttemptRow(a: any): Record<string, any> | null {
  const studentId = toUuid(a.student_id, 'profile')
  if (!studentId) return null
  return {
    id: toUuid(a.id, 'company-attempt') || randomUUID(),
    student_id: studentId,
    company_slug: String(a.company || ''),
    status: a.status || 'in_progress',
    question_seed: Number(a.question_seed) || 0,
    paper: a.paper || {},
    answers: a.answers || {},
    proctoring: a.proctoring || {},
    started_at: a.started_at ? new Date(a.started_at).toISOString() : new Date().toISOString(),
    expires_at: a.expires_at ? new Date(a.expires_at).toISOString() : new Date().toISOString(),
    duration_sec: Number(a.duration_sec) || 0,
    submitted_at: a.submitted_at ? new Date(a.submitted_at).toISOString() : null,
    auto_submitted: !!a.auto_submitted,
    submit_reason: a.submit_reason || null,
    score: a.score == null ? null : Number(a.score),
    verdict: a.result?.verdict || null,
    result: a.result || null,
    updated_at: new Date().toISOString(),
  }
}

export function rowToCompanyAttempt(row: any): any | null {
  if (!row || !row.id) return null
  return {
    id: row.id,
    student_id: row.student_id,
    company: row.company_slug,
    status: row.status,
    question_seed: Number(row.question_seed) || 0,
    paper: row.paper || { blueprint: '', bankVersion: '', rounds: [] },
    answers: row.answers || {},
    proctoring: row.proctoring || { strikes: 0, camera: null, fullscreen: null, events: [] },
    started_at: row.started_at,
    expires_at: row.expires_at,
    duration_sec: Number(row.duration_sec) || 0,
    submitted_at: row.submitted_at || null,
    auto_submitted: !!row.auto_submitted,
    submit_reason: row.submit_reason || null,
    score: row.score == null ? null : Number(row.score),
    result: row.result || null,
    created_at: row.created_at || row.started_at,
    updated_at: row.updated_at || row.started_at,
  }
}

/**
 * Upsert an attempt. `createOnly` inserts without overwriting an existing row
 * (ON CONFLICT DO NOTHING) — used when starting, so a second start can never
 * replace the first attempt's paper or answers.
 */
export async function persistCompanyAttempt(
  client: SupabaseClient,
  attempt: any,
  opts: { createOnly?: boolean } = {},
): Promise<boolean> {
  const row = companyAttemptRow(attempt)
  if (!row) {
    console.warn('[supabase] company attempt persist skipped: invalid student_id')
    return false
  }
  const { error } = await client
    .from('company_assessment_attempts')
    .upsert(row, { onConflict: 'id', ignoreDuplicates: !!opts.createOnly })
  if (error) {
    console.warn('[supabase] company attempt persist failed:', error.message)
    return false
  }
  return true
}

export async function fetchCompanyAttempt(client: SupabaseClient, studentId: string, company: string): Promise<any | null> {
  const sid = toUuid(studentId, 'profile')
  if (!sid) return null
  try {
    const { data, error } = await client
      .from('company_assessment_attempts')
      .select('*')
      .eq('student_id', sid)
      .eq('company_slug', company)
      .maybeSingle()
    if (error) return null
    return rowToCompanyAttempt(data)
  } catch {
    return null
  }
}

/** Status + graded item projections for server-side skill mapping (no paper / candidate answers). */
export async function fetchCompanyAttemptSummaries(client: SupabaseClient, studentId: string): Promise<any[] | null> {
  const sid = toUuid(studentId, 'profile')
  if (!sid) return null
  try {
    const { data, error } = await client
      .from('company_assessment_attempts')
      .select(COMPANY_ATTEMPT_SUMMARY_SELECT)
      .eq('student_id', sid)
    if (error || !Array.isArray(data)) return null
    return data
  } catch {
    return null
  }
}
