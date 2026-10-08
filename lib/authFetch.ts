/**
 * Browser-side helpers that present the signed-in student's Supabase access token
 * to the app's API routes. The server verifies the token and uses the verified
 * user id — the body or query string can no longer decide whose data is read or
 * written. In demo mode (no Supabase) there is no token, and the routes use the
 * local store as before.
 */
import { getSupabase } from './supabase.ts'

/** The signed-in student's access token, or null (demo mode or signed out). */
export async function currentAccessToken(): Promise<string | null> {
  try {
    const sb = getSupabase()
    if (!sb) return null
    const { data } = await sb.auth.getSession()
    return data?.session?.access_token ?? null
  } catch {
    return null
  }
}

/** Request headers including `Authorization: Bearer …` when a session exists. */
export async function authHeaders(base: Record<string, string> = {}): Promise<Record<string, string>> {
  const headers: Record<string, string> = { ...base }
  if (!headers.Authorization) {
    const token = await currentAccessToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }
  return headers
}

/** `fetch` that presents the student's access token. */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {})
  if (!headers.has('Authorization')) {
    const token = await currentAccessToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }
  return fetch(input, { ...init, headers })
}
