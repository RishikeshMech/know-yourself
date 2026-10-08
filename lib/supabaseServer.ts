// Server-side Supabase clients for API routes. Three kinds, and the difference
// is the security model:
//
//   getUserClient(token)  Acts AS the signed-in student: anon key + the student's
//                         own access token. Row-level security applies, so the
//                         student can only read and write their own rows. Use this
//                         for every student-owned read and write. It needs NO
//                         service key.
//   getServiceClient()    Service role — bypasses RLS. Only for trusted server work
//                         that has already decided who may see what: the admin
//                         console, company results, and checks that must read a
//                         row whose owner is verified first. Null when the service
//                         key is not configured.
//   getServerClient()     Legacy helper: service role when configured, otherwise
//                         the anon key. Only for public writes that carry no
//                         identity (anonymous feedback and help requests, the
//                         queue flush). Do not use it for student data.
//
// Returns null when Supabase is not configured (or the package is the compile-time
// stub), so callers fall back to the local JSON demo store.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { isSupabaseConfigured } from './supabase.ts'

const AUTH_OPTIONS = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } as const

function env(name: string): string {
  return (process.env[name] || '').trim()
}

let anonCached: SupabaseClient | null | undefined
let serviceCached: SupabaseClient | null | undefined
let legacyCached: SupabaseClient | null | undefined

/** Anon key, no user identity. Used to verify access tokens (GET /auth/v1/user). */
export function getAnonClient(): SupabaseClient | null {
  if (anonCached !== undefined) return anonCached
  anonCached = null
  if (!isSupabaseConfigured()) return null
  const url = env('NEXT_PUBLIC_SUPABASE_URL')
  const key = env('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  if (!url || !key) return null
  try {
    anonCached = createClient(url, key, { auth: AUTH_OPTIONS })
  } catch (e) {
    console.warn('[supabase] anon client unavailable:', (e as Error)?.message)
    anonCached = null
  }
  return anonCached
}

/** True when the server holds the service role key (RLS-bypassing writes are possible). */
export function hasServiceKey(): boolean {
  return !!env('SUPABASE_SERVICE_ROLE_KEY') && isSupabaseConfigured()
}

/** Service role client, or null when Supabase or the service key is not configured. */
export function getServiceClient(): SupabaseClient | null {
  if (serviceCached !== undefined) return serviceCached
  serviceCached = null
  if (!hasServiceKey()) return null
  try {
    serviceCached = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: AUTH_OPTIONS })
  } catch (e) {
    console.warn('[supabase] service client unavailable:', (e as Error)?.message)
    serviceCached = null
  }
  return serviceCached
}

/** Legacy: service client when configured, otherwise the anon client. See the header. */
export function getServerClient(): SupabaseClient | null {
  if (legacyCached !== undefined) return legacyCached
  legacyCached = null
  if (!isSupabaseConfigured()) return null
  const key = env('SUPABASE_SERVICE_ROLE_KEY') || env('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  const url = env('NEXT_PUBLIC_SUPABASE_URL')
  if (!url || !key) return null
  try {
    legacyCached = createClient(url, key, { auth: AUTH_OPTIONS })
  } catch (e) {
    console.warn('[supabase] server client unavailable:', (e as Error)?.message, '— using local demo store.')
    legacyCached = null
  }
  return legacyCached
}

// One client per access token, bounded. Each one carries that student's JWT, so
// PostgREST evaluates RLS as that student for every request made through it.
const USER_CLIENT_LIMIT = 500
const userClients = new Map<string, SupabaseClient>()

/** Acts as the student who owns `accessToken` (RLS applies). Null when not configured. */
export function getUserClient(accessToken: string): SupabaseClient | null {
  const token = String(accessToken || '').trim()
  if (!token || !isSupabaseConfigured()) return null
  const hit = userClients.get(token)
  if (hit) return hit
  const url = env('NEXT_PUBLIC_SUPABASE_URL')
  const anonKey = env('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  if (!url || !anonKey) return null
  let client: SupabaseClient
  try {
    client = createClient(url, anonKey, {
      auth: AUTH_OPTIONS,
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
  } catch (e) {
    console.warn('[supabase] user client unavailable:', (e as Error)?.message)
    return null
  }
  if (userClients.size >= USER_CLIENT_LIMIT) userClients.delete(userClients.keys().next().value as string)
  userClients.set(token, client)
  return client
}

export function isSupabaseBackend(): boolean {
  return !!getServerClient()
}

/** Test seam: drop cached clients (e.g. after the environment changed). */
export function resetSupabaseClientsForTests(): void {
  anonCached = undefined
  serviceCached = undefined
  legacyCached = undefined
  userClients.clear()
}
