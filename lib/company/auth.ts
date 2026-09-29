/**
 * Who is calling? — identity check for the company-assessment API.
 *
 * With Supabase configured the caller must present their Supabase access token
 * (`Authorization: Bearer …`, which supabase-js keeps in the browser after
 * login). The token is verified with the auth server and the verified user id
 * is used — a request can never start, save or submit an attempt on behalf of
 * another student, which is what makes the one-attempt rule enforceable.
 * Verified tokens are cached briefly so autosaves do not hit the auth server
 * every few seconds.
 *
 * In local demo mode (no Supabase) there is no token issuer, so the claimed
 * student id is used, consistent with the rest of the demo API.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type Identity = { ok: true; studentId: string } | { ok: false; status: number; error: string }

const TTL_MS = 5 * 60_000
const MAX_CACHE = 5000
const verified = new Map<string, { userId: string; until: number }>()

function tokenExpiryMs(token: string): number | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] || '', 'base64url').toString('utf8'))
    return typeof payload?.exp === 'number' ? payload.exp * 1000 : null
  } catch {
    return null
  }
}

export function clearIdentityCache(): void {
  verified.clear()
}

export async function resolveStudent(
  req: Request,
  claimedId: unknown,
  sb: SupabaseClient | null,
): Promise<Identity> {
  const claimed = String(claimedId ?? '').trim().slice(0, 128)
  if (!sb) {
    return claimed ? { ok: true, studentId: claimed } : { ok: false, status: 400, error: 'Missing student_id' }
  }
  const header = req.headers.get('authorization') || ''
  const token = header.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { ok: false, status: 401, error: 'Your session has expired — please sign in again.' }

  const now = Date.now()
  let userId = ''
  const hit = verified.get(token)
  if (hit && hit.until > now) {
    userId = hit.userId
  } else {
    try {
      const { data, error } = await sb.auth.getUser(token)
      if (error || !data?.user?.id) return { ok: false, status: 401, error: 'Your session has expired — please sign in again.' }
      userId = data.user.id
    } catch {
      return { ok: false, status: 503, error: 'Could not verify your session — please retry.' }
    }
    const exp = tokenExpiryMs(token)
    if (verified.size >= MAX_CACHE) verified.delete(verified.keys().next().value as string)
    verified.set(token, { userId, until: Math.min(now + TTL_MS, exp ?? now + TTL_MS) })
  }
  if (claimed && claimed !== userId) return { ok: false, status: 403, error: 'This attempt belongs to a different account.' }
  return { ok: true, studentId: userId }
}
