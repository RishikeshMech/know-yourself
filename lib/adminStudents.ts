// Admin data source — one row per student joining profile + latest assessment
// result + latest resume analysis. Works against whichever backend the app is
// running on: the Supabase `student_profiles_full` view when Supabase env vars
// are set (service-role reads bypass RLS), otherwise the local JSON store.
// Both /api/admin/students and /api/admin/export share this module so the
// on-screen table and the downloaded CSV always agree.
import { getDB } from './db'
import { getServerClient } from './supabaseServer'
import { buildRow, sortRows } from './studentRows'
import type { AdminStudentRow } from './csv'

/** Distinct colleges, alphabetically, non-empty. */
export function distinctColleges(rows: AdminStudentRow[]): string[] {
  const set = new Set<string>()
  for (const r of rows) {
    const c = r.college.trim()
    if (c) set.add(c)
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}

/** Fetch every student (joined) — Supabase first, local JSON store as fallback. */
export async function fetchAllStudents(): Promise<AdminStudentRow[]> {
  const sb = getServerClient()
  if (sb) {
    try {
      const { data, error } = await sb
        .from('student_profiles_full')
        .select('*')
        .eq('role', 'student')
      if (error) {
        console.warn('[admin] Supabase student fetch failed:', error.message)
        return []
      }
      const rows: AdminStudentRow[] = (data || []).map((r: any) =>
        buildRow({
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
        }),
      )
      return sortRows(rows)
    } catch (e: any) {
      console.warn('[admin] Supabase student fetch error:', e?.message || e)
      return []
    }
  }

  // Local demo store — read the JSON file once per request.
  // Iterate *profiles* rather than users: in demo/seed data many profiles were
  // created without a matching row in `users`, so a users-first join would
  // silently drop most students from the admin view.
  try {
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
  } catch (e: any) {
    console.warn('[admin] local student fetch error:', e?.message || e)
    return []
  }
}
