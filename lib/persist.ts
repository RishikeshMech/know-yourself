// Supabase persistence helpers used by the API routes.
// Every function receives the server client explicitly and degrades to a
// logged no-op on failure — the local JSON store remains the source of truth
// in demo mode, Supabase mirrors everything when configured.
//
// Feedback and help requests are the exception, and deliberately so: for those
// two Supabase is the DESTINATION and the local store is only the retry queue
// used while Postgres is unreachable (see lib/feedbackStore.ts /
// lib/helpStore.ts). Both write with a plain INSERT plus explicit
// unique-violation handling rather than `.upsert()`, so they work with the
// anon key against insert-only RLS policies.
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

/** Postgres error for "column does not exist" — migration 0008 not applied yet. */
const UNDEFINED_COLUMN = '42703'

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

/** Mirrors the full onboarding form (mobile, gender, degree, …) into public.profiles. */
export async function persistProfile(client: SupabaseClient, p: any): Promise<boolean> {
  const row = {
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
  const { error } = await client
    .from('profiles')
    .upsert(row, { onConflict: 'id' })
  if (error) {
    console.warn('[supabase] profile persist failed:', error.message)
    return false
  }
  return true
}

/** Latest profile row for a user (used by login to route returners correctly). */
export async function fetchProfile(client: SupabaseClient, userId: string): Promise<any | null> {
  try {
    const { data } = await client
      .from('profiles')
      .select(PROFILE_SELECT)
      .eq('id', userId)
      .maybeSingle()
    return data || null
  } catch {
    return null
  }
}

export async function persistResumeAnalysis(client: SupabaseClient, rec: any): Promise<boolean> {
  const studentId = toUuid(rec.student_id, 'profile')
  if (!studentId) return false
  const { error } = await client.from('resume_analyses').insert({
    id: toUuid(rec.id || `resume:${studentId}:${rec.created_at || Date.now()}`, 'resume-analysis') || randomUUID(),
    student_id: studentId,
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
    created_at: rec.created_at ? new Date(rec.created_at).toISOString() : undefined,
  })
  if (error) {
    console.error('[supabase] resume persist failed:', error.code, error.message)
    return false
  }
  return true
}

export async function fetchLatestResumeAnalysis(client: SupabaseClient, studentId: string): Promise<any | null> {
  const sid = toUuid(studentId, 'profile')
  if (!sid) return null
  const { data, error } = await client
    .from('resume_analyses')
    .select('id,student_id,storage_key,resume_score,parsed,feedback,created_at')
    .eq('student_id', sid)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data || null
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

export async function persistTrackingEvent(client: SupabaseClient, ev: any): Promise<boolean> {
  const { error } = await client.from('tracking_events').upsert(
    {
      id: ev.id,
      user_id: ev.user_id,
      action: ev.action || '',
      completed: !!ev.completed,
      completed_at: ev.completed ? (ev.completed_at || new Date().toISOString()) : null,
    },
    { onConflict: 'id' },
  )
  if (error) {
    console.warn('[supabase] tracking persist failed:', error.message)
    return false
  }
  return true
}

/** Closes any active session for the student (before creating a new one). */
export async function expireActiveAssessmentSessions(
  client: SupabaseClient,
  studentId: string,
  exceptId?: string,
  assessmentNo?: number,
): Promise<void> {
  try {
    let q = client
      .from('assessment_sessions')
      .update({ status: 'expired' })
      .eq('student_id', studentId)
      .eq('status', 'in_progress')
    if (exceptId) q = q.neq('id', exceptId)
    // Only close sessions of the SAME assessment — starting the Capgemini mock
    // must never expire an unfinished CalibiAI attempt (or vice versa).
    if (assessmentNo) {
      const scoped = await q.eq('assessment_no', assessmentNo)
      if (!scoped.error || String((scoped.error as any)?.code) !== UNDEFINED_COLUMN) return
      // Column missing (migration 0008 not applied) — fall through unscoped.
      let retry = client
        .from('assessment_sessions')
        .update({ status: 'expired' })
        .eq('student_id', studentId)
        .eq('status', 'in_progress')
      if (exceptId) retry = retry.neq('id', exceptId)
      await retry
      return
    }
    await q
  } catch (e) {
    console.warn('[supabase] session expiry failed:', (e as Error)?.message || e)
  }
}

/** Database outcome for a persisted assessment checkpoint or atomic submission. */
export interface AssessmentWriteOutcome {
  ok: boolean
  session?: any
  result?: any
  code?: string
  message?: string
}

function assessmentSessionDbRow(s: any): Record<string, any> | null {
  const studentId = toUuid(s.student_id, 'profile')
  const sessionId = toUuid(s.id || s.session_id, 'session')
  if (!studentId || !sessionId) return null
  const assessmentNo = assessmentNoOf(s)
  const answers = { ...(s.answers || {}), __assessment_no: assessmentNo }
  return {
    id: sessionId,
    student_id: studentId,
    started_at: s.started_at ? new Date(s.started_at).toISOString() : new Date().toISOString(),
    expires_at: s.expires_at ? new Date(s.expires_at).toISOString() : new Date(Date.now() + 7200 * 1000).toISOString(),
    duration_sec: Number(s.duration_sec) || 7200,
    status: 'in_progress',
    question_seed: s.question_seed == null ? undefined : Number(s.question_seed),
    tab_switches: Math.max(0, Number(s.tab_switches) || 0),
    answers,
    submitted_at: null,
    created_at: s.created_at ? new Date(s.created_at).toISOString() : new Date().toISOString(),
    assessment_no: assessmentNo,
  }
}

function assessmentResultDbRow(r: any): Record<string, any> | null {
  const studentId = toUuid(r.student_id, 'profile')
  const sessionId = toUuid(r.session_id, 'session')
  if (!studentId || !sessionId) return null
  const assessmentNo = assessmentNoOf(r)
  return {
    id: toUuid(r.id, 'result') || randomUUID(),
    session_id: sessionId,
    student_id: studentId,
    scores: { ...(r.scores || {}), assessment_no: assessmentNo },
    total: Number(r.total) || 0,
    grade: clean(r.grade) || 'D',
    percentile: r.percentile == null ? 0 : Number(r.percentile),
    verifiable_hash: clean(r.verifiable_hash) || '',
    ai_feedback: r.ai_feedback || {},
    created_at: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
    assessment_no: assessmentNo,
  }
}

/**
 * Persist a start or progress checkpoint using one database-side transaction.
 * `start: true` resumes an existing active attempt instead of overwriting or
 * creating a second one. Checkpoints cannot change ownership or reopen a final
 * session; the database RPC enforces both rules under row locks.
 */
export async function persistAssessmentSession(
  client: SupabaseClient,
  s: any,
  opts: { start?: boolean } = {},
): Promise<AssessmentWriteOutcome> {
  const row = assessmentSessionDbRow(s)
  if (!row) return { ok: false, code: 'INVALID_ASSESSMENT_SESSION', message: 'Missing student/session id' }
  try {
    const { data, error } = await client.rpc('persist_assessment_session', {
      p_session: row,
      p_start: !!opts.start,
    })
    if (error) {
      console.error('[supabase] assessment session transaction failed:', error.code, error.message)
      return { ok: false, code: String(error.code || ''), message: String(error.message || 'Database write failed') }
    }
    const saved = Array.isArray(data) ? data[0] : data
    if (!saved?.id || !saved?.student_id) {
      return { ok: false, code: 'EMPTY_ASSESSMENT_SESSION', message: 'Database returned no session row' }
    }
    return { ok: true, session: saved }
  } catch (error: any) {
    console.error('[supabase] assessment session transaction threw:', error?.message || error)
    return { ok: false, message: String(error?.message || 'Database write failed') }
  }
}

/**
 * Commit the final session state and its result in a single PostgreSQL RPC
 * transaction. If either insert/update fails, both changes roll back. Retrying
 * the same session is idempotent and cannot overwrite another student's row.
 */
export async function persistAssessmentSubmission(
  client: SupabaseClient,
  session: any,
  result: any,
): Promise<AssessmentWriteOutcome> {
  const sessionRow = assessmentSessionDbRow(session)
  const resultRow = assessmentResultDbRow(result)
  if (!sessionRow || !resultRow) {
    return { ok: false, code: 'INVALID_ASSESSMENT_SUBMISSION', message: 'Missing student/session id' }
  }
  if (sessionRow.id !== resultRow.session_id || sessionRow.student_id !== resultRow.student_id || sessionRow.assessment_no !== resultRow.assessment_no) {
    return { ok: false, code: 'ASSESSMENT_SUBMISSION_MISMATCH', message: 'Session/result ownership mismatch' }
  }
  const finalStatus = session.status === 'expired' || session.auto_submitted ? 'expired' : 'submitted'
  const pSession = {
    ...sessionRow,
    status: finalStatus,
    submitted_at: session.submitted_at ? new Date(session.submitted_at).toISOString() : new Date().toISOString(),
  }
  try {
    const { data, error } = await client.rpc('submit_assessment_attempt', {
      p_session: pSession,
      p_result: resultRow,
    })
    if (error) {
      console.error('[supabase] atomic assessment submission failed:', error.code, error.message)
      return { ok: false, code: String(error.code || ''), message: String(error.message || 'Database write failed') }
    }
    const saved = Array.isArray(data) ? data[0] : data
    if (!saved?.session?.id || !saved?.result?.session_id) {
      return { ok: false, code: 'EMPTY_ASSESSMENT_SUBMISSION', message: 'Database returned an incomplete submission' }
    }
    return { ok: true, session: saved.session, result: saved.result }
  } catch (error: any) {
    console.error('[supabase] atomic assessment submission threw:', error?.message || error)
    return { ok: false, message: String(error?.message || 'Database write failed') }
  }
}

/** Loads an assessment session by id from Supabase (service-role read). */
export async function fetchAssessmentSession(client: SupabaseClient, sessionId: string): Promise<any | null> {
  const { data, error } = await client
    .from('assessment_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle()
  if (error) throw error
  return data || null
}

/** Loads the student's active (in-progress) session from Supabase. */
export async function fetchActiveAssessmentSession(
  client: SupabaseClient,
  studentId: string,
  assessmentNo = 1,
): Promise<any | null> {
  // Filtering in Node (rather than `.eq('assessment_no', …)`) keeps this
  // compatible with JSON markers on legacy rows.
  const { data, error } = await client
    .from('assessment_sessions')
    .select('*')
    .eq('student_id', studentId)
    .eq('status', 'in_progress')
    .order('started_at', { ascending: false })
    .limit(10)
  if (error) throw error
  const rows = Array.isArray(data) ? data : []
  return rows.find(row => assessmentNoOf(row) === assessmentNo) || null
}

/** Latest assessment result for a student from Supabase. */
export async function fetchLatestAssessmentResult(
  client: SupabaseClient,
  studentId: string,
  assessmentNo = 1,
): Promise<any | null> {
  // A student has at most one result per assessment; filtering in Node keeps
  // this compatible with legacy JSON markers before the dedicated column.
  const { data, error } = await client
    .from('assessment_results')
    .select(ASSESSMENT_RESULT_SELECT)
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
    .limit(10)
  if (error) throw error
  const rows = Array.isArray(data) ? data : []
  return rows.find(row => assessmentNoOf(row) === assessmentNo) || null
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
  const { data, error } = await client
    .from('company_assessment_attempts')
    .select('*')
    .eq('student_id', sid)
    .eq('company_slug', company)
    .maybeSingle()
  if (error) throw error
  return rowToCompanyAttempt(data)
}

/** Status + graded item projections for server-side skill mapping (no paper / candidate answers). */
export async function fetchCompanyAttemptSummaries(client: SupabaseClient, studentId: string): Promise<any[] | null> {
  const sid = toUuid(studentId, 'profile')
  if (!sid) return null
  const { data, error } = await client
    .from('company_assessment_attempts')
    .select(COMPANY_ATTEMPT_SUMMARY_SELECT)
    .eq('student_id', sid)
  if (error) throw error
  if (!Array.isArray(data)) throw new Error('Supabase returned an invalid company attempts response.')
  return data
}
