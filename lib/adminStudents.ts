// Admin data source — one row per student joining profile + latest assessment
// result + latest resume analysis. The admin reads BOTH backends and merges
// them: the Supabase `student_profiles_full` view (service-role reads bypass
// RLS) and the local JSON store. Neither store is a complete picture on its
// own — students who signed up through the deployed app exist only in Postgres,
// while the curated/demo candidates shipped in `calibiai_db.json` (non-UUID
// `u_…` ids) were never inserted into Postgres and exist only locally. Reading
// just one of them is what made the dashboard show a fraction of the students
// the rest of the app can serve.
//
// Both /api/admin/students and /api/admin/export share this module so the
// on-screen table and the downloaded CSV always agree.
//
// fetchAllStudents() returns a richer result object (rows + source + per-store
// counts + warning) so the dashboard can tell the admin *where* the data came
// from and surface a clear reason when Supabase is configured but something is
// off (e.g. the flattened export view has not been created yet). The Supabase
// query always tries the view first and falls back to the base tables, and a
// Supabase failure never hides the local rows.
import { getDB } from './db'
import { getServerClient } from './supabaseServer'
import { buildRow, mergeStudentRows, sortRows } from './studentRows'
import type { AdminStudentRow } from './csv'

export interface AdminStudentsResult {
  /** Fully joined rows, ready for the table / CSV. */
  students: AdminStudentRow[]
  /** Which backend produced the rows: Supabase or the local JSON demo store. */
  source: 'supabase' | 'local'
  /** Optional human-readable note about a fallback / degraded read. */
  warning?: string
  /** How many rows came from each store (after de-duplication). */
  sources?: { supabase: number; local: number }
}

/** What could prevent reading every row; collated so the UI can show it. */
export interface FetchError {
  message: string
}

/** Build one AdminStudentRow from a Supabase `student_profiles_full` view row. */
function fromViewRow(r: any): AdminStudentRow {
  return buildRow({
    student_id: r.student_id,
    email: r.email,
    role: r.role,
    profile: r,
    scores: r.assessment_scores
      ? {
          scores: r.assessment_scores,
          total: r.talent_score,
          grade: r.grade,
          percentile: r.percentile,
          verifiable_hash: r.verifiable_hash,
          created_at: r.assessment_created_at,
        }
      : null,
    resume_score: r.resume_score,
    resume_parsed: r.resume_parsed,
    verifiable_hash: r.verifiable_hash,
    assessed_at: r.assessment_created_at,
    created_at: r.profile_created_at,
  })
}

/**
 * Fallback join against the base tables. Used when `student_profiles_full` does
 * not exist (e.g. only `supabase/schema.sql` was partially applied) so the
 * admin dashboard still shows real data instead of silently going empty.
 */
async function fetchFromBaseTables(sb: any): Promise<{ rows: AdminStudentRow[]; error?: FetchError }> {
  try {
    const [profilesQ, resumesQ, resultsQ] = await Promise.all([
      sb.from('profiles').select('*').eq('role', 'student'),
      sb.from('resume_analyses').select('*').order('created_at', { ascending: false }),
      sb.from('assessment_results').select('*').order('created_at', { ascending: false }),
    ])
    if (profilesQ.error) return { rows: [], error: { message: profilesQ.error.message } }
    // Resumes / results are best-effort — keep profiles even if these fail.
    const resumes: any[] = resumesQ.data || []
    const results: any[] = resultsQ.data || []
    const byStudent = (arr: any[]) => {
      const map = new Map<string, any>()
      for (const row of arr) {
        const key = String(row.student_id || '')
        if (!key) continue
        // Prefer the first (already newest-first) row on a per-student basis.
        if (!map.has(key)) map.set(key, row)
      }
      return map
    }
    const latestResume = byStudent(resumes)
    const latestResult = byStudent(results)

    const rows = (profilesQ.data || []).map((p: any) =>
      buildRow({
        student_id: p.id,
        email: p.email,
        role: p.role,
        profile: p,
        scores: latestResult.get(p.id) || null,
        resume_score: latestResume.get(p.id)?.resume_score,
        resume_parsed: latestResume.get(p.id)?.parsed,
        verifiable_hash: latestResult.get(p.id)?.verifiable_hash,
        assessed_at: latestResult.get(p.id)?.created_at,
        created_at: p.created_at,
      }),
    )
    return { rows: sortRows(rows) }
  } catch (e: any) {
    return { rows: [], error: { message: e?.message || 'Base-table fallback failed.' } }
  }
}

/**
 * Rows from the local JSON store (seed `calibiai_db.json` overridden by the
 * gitignored `calibiai_db.runtime.json` once the app has written live demo
 * data). Extracted so `fetchAllStudents()` can merge it with Supabase.
 *
 * Iterate *profiles* rather than users: in demo/seed data many profiles were
 * created without a matching row in `users`, so a users-first join would
 * silently drop most students from the admin view.
 */
function fetchLocalStudents(): AdminStudentRow[] {
  const db = getDB()
  const rows: AdminStudentRow[] = []
  const seen = new Set<string>()
  for (const profile of db.profiles) {
    seen.add(profile.id)
    const user = db.users.find(u => u.id === profile.id)
    const result = db.assessment_results
      .filter(r => r.student_id === profile.id)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
    const resume = db.resume_analyses
      .filter(r => r.student_id === profile.id)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
    rows.push(
      buildRow({
        student_id: profile.id,
        email: profile.email || user?.email,
        role: user?.role || 'student',
        profile,
        scores: result || null,
        resume_score: resume?.resume_score,
        resume_parsed: resume?.parsed,
        verifiable_hash: result?.verifiable_hash,
        assessed_at: result?.created_at,
        created_at: profile.updated_at || user?.created_at,
      }),
    )
  }
  // Registered accounts that somehow never got a profile row still count.
  for (const user of db.users) {
    if (seen.has(user.id)) continue
    rows.push(
      buildRow({
        student_id: user.id,
        email: user.email,
        role: user.role,
        profile: {},
        created_at: user.created_at,
      }),
    )
  }
  return sortRows(rows)
}

/**
 * Fetch every student (joined) — Supabase rows merged with the local JSON
 * store, so a student is missing only if they exist in neither. Never throws:
 * returns a result object with a diagnostic `warning` instead.
 */
export async function fetchAllStudents(): Promise<AdminStudentsResult> {
  const sb = getServerClient()
  let remote: AdminStudentRow[] = []
  let warning = ''

  if (sb) {
    try {
      // 1) Prefer the flattened export view.
      const { data, error } = await sb
        .from('student_profiles_full')
        .select('*')
        .eq('role', 'student')
      if (!error) {
        remote = (data || []).map((r: any) => fromViewRow(r))
        // The view is RLS-protected (security_invoker). With the anon key and no
        // service role, the server-side admin request has no auth context, so
        // RLS hides every row and Postgres looks empty. Surface that clearly.
        if (remote.length === 0 && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
          warning =
            'No live students were returned. The admin is reading Supabase with the anon key, which is restricted by Row Level Security. Set SUPABASE_SERVICE_ROLE_KEY so the admin can read every student record.'
        }
      } else {
        // 2) The view is missing / errored — fall back to the base tables.
        const viewWarning = `student_profiles_full view: ${error.message}`
        const fallback = await fetchFromBaseTables(sb)
        if (!fallback.error) {
          remote = fallback.rows
          warning = `${viewWarning}. Showing results joined from the base tables instead.`
        } else {
          warning = `Could not load students from Supabase: ${fallback.error.message}`
        }
      }
    } catch (e: any) {
      warning = `Could not load students from Supabase: ${e?.message || e}`
    }
  }

  // 3) Local demo store — always read, then merge. Students seeded into
  //    calibiai_db.json were never written to Postgres, so a Supabase-only
  //    read can never show them.
  let local: AdminStudentRow[] = []
  try {
    local = fetchLocalStudents()
  } catch (e: any) {
    const localError = `Could not load students from the local store: ${e?.message || e}`
    warning = warning ? `${warning} ${localError}` : localError
  }

  const merged = mergeStudentRows(remote, local)
  return {
    students: merged.rows,
    source: sb ? 'supabase' : 'local',
    sources: { supabase: merged.remote, local: merged.local },
    warning: warning || undefined,
  }
}
