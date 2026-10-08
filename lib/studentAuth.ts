/**
 * Who is calling a student route?
 *
 * With Supabase configured, the caller must present their Supabase access token
 * (`Authorization: Bearer …`, which supabase-js keeps in the browser after login).
 * The token is verified with the auth server, and the VERIFIED user id is the
 * only identity used: a request can never read or write another student's rows,
 * whatever `student_id` / `user_id` the body or query claims. A claim that does
 * not match the token is refused (403).
 *
 * The returned client acts as that student (`getUserClient`), so row-level
 * security is a second, database-enforced guard on every query.
 *
 * In local demo mode (no Supabase) there is no token issuer, so the claimed id is
 * used — the same trust model the local JSON store has always had.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { isSupabaseConfigured } from './supabase.ts'
import { getAnonClient, getUserClient } from './supabaseServer.ts'

export type StudentAccess =
  | { ok: true; mode: 'local'; studentId: string; email: string | null }
  | { ok: true; mode: 'supabase'; studentId: string; email: string | null; token: string; client: SupabaseClient }
  | { ok: false; status: number; error: string }

const TTL_MS = 5 * 60_000
const MAX_CACHE = 5000
const verified = new Map<string, { userId: string; email: string | null; until: number }>()

/** Placeholders older clients sent when they had no real identity. */
const NO_IDENTITY = new Set(['', 'unknown', 'undefined', 'null', 'sess_demo'])

/** A claimed id from a body/query, or null when it is a placeholder. */
export function claimedStudentId(value: unknown): string | null {
  const s = String(value ?? '').trim().slice(0, 128)
  return NO_IDENTITY.has(s) ? null : s
}

export function bearerToken(req: Request): string | null {
  const header = req.headers.get('authorization') || ''
  const token = header.replace(/^Bearer\s+/i, '').trim()
  return token || null
}

function tokenExpiryMs(token: string): number | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] || '', 'base64url').toString('utf8'))
    return typeof payload?.exp === 'number' ? payload.exp * 1000 : null
  } catch {
    return null
  }
}

/**
 * Verifies an access token with the auth server. Returns the user, `null` when the
 * token is invalid or expired, or 'unavailable' when the check itself could not run
 * (so callers can answer 503 and let the client retry, instead of signing anyone out).
 */
export async function verifyAccessToken(token: string): Promise<{ userId: string; email: string | null } | null | 'unavailable'> {
  const now = Date.now()
  const hit = verified.get(token)
  if (hit && hit.until > now) return { userId: hit.userId, email: hit.email }
  const anon = getAnonClient()
  if (!anon) return 'unavailable'
  try {
    const { data, error } = await anon.auth.getUser(token)
    if (error || !data?.user?.id) return null
    const user = { userId: data.user.id, email: data.user.email ? String(data.user.email).toLowerCase() : null }
    const exp = tokenExpiryMs(token)
    if (verified.size >= MAX_CACHE) verified.delete(verified.keys().next().value as string)
    verified.set(token, { ...user, until: Math.min(now + TTL_MS, exp ?? now + TTL_MS) })
    return user
  } catch {
    return 'unavailable'
  }
}

/** Who may act on this student route, and through which client. */
export async function resolveStudentAccess(req: Request, claimed?: unknown): Promise<StudentAccess> {
  const id = claimedStudentId(claimed)
  if (!isSupabaseConfigured()) {
    return id
      ? { ok: true, mode: 'local', studentId: id, email: null }
      : { ok: false, status: 400, error: 'Missing student_id' }
  }
  const token = bearerToken(req)
  if (!token) return { ok: false, status: 401, error: 'Your session has expired — please sign in again.' }
  const user = await verifyAccessToken(token)
  if (user === 'unavailable') return { ok: false, status: 503, error: 'Could not verify your session — please retry.' }
  if (!user) return { ok: false, status: 401, error: 'Your session has expired — please sign in again.' }
  if (id && id !== user.userId) return { ok: false, status: 403, error: 'This request belongs to a different account.' }
  const client = getUserClient(token)
  if (!client) return { ok: false, status: 503, error: 'Supabase is not configured on this server.' }
  return { ok: true, mode: 'supabase', studentId: user.userId, email: user.email, token, client }
}

/**
 * Identity for endpoints that also work anonymously (feedback, help requests).
 * Never fails: a missing or invalid token just means "not signed in", so a
 * candidate is never blocked from sending feedback.
 */
export async function optionalStudent(req: Request): Promise<{ studentId: string | null; email: string | null; client: SupabaseClient | null }> {
  if (!isSupabaseConfigured()) return { studentId: null, email: null, client: null }
  const token = bearerToken(req)
  if (!token) return { studentId: null, email: null, client: null }
  const user = await verifyAccessToken(token)
  if (!user || user === 'unavailable') return { studentId: null, email: null, client: null }
  return { studentId: user.userId, email: user.email, client: getUserClient(token) }
}

/** Test seam: forget verified tokens. */
export function clearVerifiedTokensForTests(): void {
  verified.clear()
}
