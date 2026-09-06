// Supabase persistence helpers used by the API routes.
// Every function receives the server client explicitly and degrades to a
// logged no-op on failure — the local JSON store remains the source of truth
// in demo mode, Supabase mirrors everything when configured.
import { randomUUID } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface AuthResult {
  user: { id: string; email: string; name?: string }
  access_token: string | null
  refresh_token: string | null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function clean(v: any): string | null {
  const s = String(v ?? '').trim()
  return s ? s : null
}

/**
 * Postgres `uuid` columns reject the short local-demo ids the client used to
 * send ("sess_abc123"), which made every assessment row mirror fail silently
 * ("invalid input syntax for type uuid") — so results never reached Supabase
 * and returning students were treated as first-timers.
 * Map any invalid id to a fresh uuid so Supabase writes always succeed; API
 * routes use the same value for the local JSON store so the two stay in sync.
 * A malformed user id is also rejected (FK constraint) by returning null.
 */
export function toUuid(value: any): string | null {
  const s = String(value ?? '').trim()
  if (!s) return null
  if (UUID_RE.test(s)) return s
  return randomUUID()
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
      .select('*')
      .eq('id', userId)
      .maybeSingle()
    return data || null
  } catch {
    return null
  }
}

export async function persistResumeAnalysis(client: SupabaseClient, rec: any): Promise<boolean> {
  const { error } = await client.from('resume_analyses').insert({
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
  })
  if (error) {
    console.warn('[supabase] resume persist failed:', error.message)
    return false
  }
  return true
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
): Promise<void> {
  try {
    let q = client
      .from('assessment_sessions')
      .update({ status: 'expired' })
      .eq('student_id', studentId)
      .eq('status', 'in_progress')
    if (exceptId) q = q.neq('id', exceptId)
    await q
  } catch (e) {
    console.warn('[supabase] session expiry failed:', (e as Error)?.message || e)
  }
}

/**
 * Mirrors an assessment session (start / progress save / submit status).
 * The local demo ids ("sess_…") are mapped to a real uuid up front, and the
 * partial unique index (one active session per student) is handled by expiring
 * any older active session before retrying.
 */
export async function persistAssessmentSession(client: SupabaseClient, s: any): Promise<boolean> {
  const studentId = toUuid(s.student_id)
  if (!studentId) {
    console.warn('[supabase] session persist skipped: invalid student_id')
    return false
  }
  const row = {
    id: toUuid(s.id) || randomUUID(),
    student_id: studentId,
    started_at: s.started_at ? new Date(s.started_at).toISOString() : new Date().toISOString(),
    expires_at: s.expires_at ? new Date(s.expires_at).toISOString() : new Date(Date.now() + 7200 * 1000).toISOString(),
    duration_sec: Number(s.duration_sec) || 7200,
    status: s.status || 'in_progress',
    question_seed: s.question_seed ? Number(s.question_seed) : undefined,
    tab_switches: Number(s.tab_switches) || 0,
    answers: s.answers || {},
    submitted_at: s.submitted_at ? new Date(s.submitted_at).toISOString() : null,
  }
  const { error } = await client.from('assessment_sessions').upsert(row, { onConflict: 'id' })
  if (error) {
    if ((error as any).code === '23505') {
      await expireActiveAssessmentSessions(client, studentId, row.id)
      const retry = await client.from('assessment_sessions').upsert(row, { onConflict: 'id' })
      if (!retry.error) return true
    }
    console.warn('[supabase] session persist failed:', error.message)
    return false
  }
  return true
}

/** Mirrors the final evaluation result (scores) into public.assessment_results. */
export async function persistAssessmentResult(client: SupabaseClient, r: any): Promise<boolean> {
  const studentId = toUuid(r.student_id)
  const sessionId = toUuid(r.session_id)
  if (!studentId || !sessionId) {
    console.warn('[supabase] result persist skipped: invalid student_id/session_id')
    return false
  }
  const { error } = await client.from('assessment_results').upsert(
    {
      session_id: sessionId,
      student_id: studentId,
      scores: r.scores || {},
      total: Number(r.total) || 0,
      grade: clean(r.grade) || undefined,
      percentile: r.percentile != null ? Number(r.percentile) : undefined,
      verifiable_hash: clean(r.verifiable_hash) || undefined,
      ai_feedback: r.ai_feedback || {},
      created_at: r.created_at ? new Date(r.created_at).toISOString() : undefined,
    },
    { onConflict: 'session_id' },
  )
  if (error) {
    console.warn('[supabase] result persist failed:', error.message)
    return false
  }
  return true
}

/** Loads an assessment session by id from Supabase (service-role read). */
export async function fetchAssessmentSession(client: SupabaseClient, sessionId: string): Promise<any | null> {
  try {
    const { data } = await client
      .from('assessment_sessions')
      .select('*')
      .eq('id', sessionId)
      .maybeSingle()
    return data || null
  } catch {
    return null
  }
}

/** Loads the student's active (in-progress) session from Supabase. */
export async function fetchActiveAssessmentSession(client: SupabaseClient, studentId: string): Promise<any | null> {
  try {
    const { data } = await client
      .from('assessment_sessions')
      .select('*')
      .eq('student_id', studentId)
      .eq('status', 'in_progress')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    return data || null
  } catch {
    return null
  }
}

/** Latest assessment result for a student from Supabase. */
export async function fetchLatestAssessmentResult(client: SupabaseClient, studentId: string): Promise<any | null> {
  try {
    const { data } = await client
      .from('assessment_results')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    return data || null
  } catch {
    return null
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
