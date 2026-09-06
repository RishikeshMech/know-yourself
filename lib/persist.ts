// Supabase persistence helpers used by the API routes.
// Every function receives the server client explicitly and degrades to a
// logged no-op on failure — the local JSON store remains the source of truth
// in demo mode, Supabase mirrors everything when configured.
import type { SupabaseClient } from '@supabase/supabase-js'

export interface AuthResult {
  user: { id: string; email: string; name?: string }
  access_token: string | null
  refresh_token: string | null
}

function clean(v: any): string | null {
  const s = String(v ?? '').trim()
  return s ? s : null
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
