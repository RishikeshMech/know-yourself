/**
 * Client-side session helpers that keep routing decisions honest.
 *
 * The app caches the signed-in user, profile and scores in localStorage so
 * pages render instantly, but that cache is exactly what went stale when an
 * account was deleted in Supabase and re-created: the guards on `/`, `/login`
 * and `/onboarding` trusted the cached profile and sent the "new" user straight
 * to the student dashboard with the old account's data.
 *
 * The rule is now: Supabase Auth is the source of truth for *who* is signed in.
 * Before routing a cached user, guards call `getLiveUser()` — which validates
 * the token against the auth server (a deleted user's stale JWT fails) — and
 * then reconcile the store against the DB via `reconcileForUser()`.
 */
import { getSupabase } from './supabase'

export interface LiveUser {
  id: string
  email: string
  role: string
  institution_id: string
  name?: string
}

/**
 * The live Supabase auth user, or `null` when definitively signed out / the
 * user no longer exists. Returns `undefined` when the check is inconclusive
 * (e.g. a transient network error, or demo mode) so callers keep the current
 * session instead of wiping it on a flaky connection.
 *
 * Uses `getUser()` — not `getSession()` — because a deleted user's JWT can
 * still sit in supabase-js storage; `getUser()` re-validates against the auth
 * server and returns an error for a user that no longer exists.
 */
export async function getLiveUser(): Promise<LiveUser | null | undefined> {
  const sb = getSupabase()
  if (!sb) return undefined // demo mode — the local store is the source of truth
  try {
    const { data, error } = await sb.auth.getUser()
    if (error) {
      const msg = String(error?.message || '')
      // Transient transport failures are ambiguous — keep whatever we have.
      if (/fetch|network|timeout|retry|ECONN|Failed to fetch/i.test(msg)) return undefined
      return null
    }
    const u: any = data?.user
    if (!u?.id) return null
    return {
      id: u.id,
      email: u.email || '',
      role: u.user_metadata?.role || 'student',
      institution_id: 'inst_iitm',
      name: u.user_metadata?.full_name || u.user_metadata?.name || (u.email || '').split('@')[0],
    }
  } catch {
    return undefined
  }
}
