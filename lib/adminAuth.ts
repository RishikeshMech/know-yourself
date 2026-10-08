// Admin dashboard authentication — a tiny server-side session built on an
// HMAC-signed HttpOnly cookie. It is intentionally independent of the student
// auth (Supabase Auth / local JSON store) so the admin login works the same way
// in demo mode and in production.
//
// Secrets and credentials come from the server environment, never from the
// repository:
//   ADMIN_SECRET     signs the session cookie. Required in production. Outside
//                    production a random value is generated per process.
//   ADMIN_PASSWORD   the admin password. Required in production. Outside
//                    production the documented development value is used.
// In production, sign-in is refused (503) until both are configured — the
// previous build shipped a public fallback secret and password, which let anyone
// who could read the repository sign in and download every student record.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto'

export const ADMIN_USERNAME = 'admin'
export const ADMIN_COOKIE = 'calibiai_admin_session'
const ADMIN_SESSION_HOURS = 8
const DEV_PASSWORD = 'CalibiAdmin@777'
const IS_PRODUCTION = process.env.NODE_ENV === 'production'
const DEV_SECRET = randomBytes(32).toString('hex')

/** The cookie-signing secret, or null when sign-in must stay disabled. */
function signingSecret(): string | null {
  const configured = (process.env.ADMIN_SECRET || '').trim()
  if (configured) return configured
  return IS_PRODUCTION ? null : DEV_SECRET
}

/** The admin password, or null when sign-in must stay disabled. */
export function adminPassword(): string | null {
  const configured = (process.env.ADMIN_PASSWORD || '').trim()
  if (configured) return configured
  return IS_PRODUCTION ? null : DEV_PASSWORD
}

/** Why admin sign-in is unavailable on this server, or null when it is configured. */
export function adminConfigProblem(): string | null {
  if (!signingSecret()) return 'ADMIN_SECRET is not set on the server.'
  if (!adminPassword()) return 'ADMIN_PASSWORD is not set on the server.'
  return null
}

function hmac(data: string): string | null {
  const secret = signingSecret()
  if (!secret) return null
  return createHmac('sha256', secret).update(data).digest('hex')
}

/** Constant-time string comparison (used for the username and password checks). */
export function safeEqual(a: string, b: string): boolean {
  const ah = createHash('sha256').update(String(a)).digest()
  const bh = createHash('sha256').update(String(b)).digest()
  return timingSafeEqual(ah, bh)
}

/** A signed session that expires at `expiresAtMs` (epoch milliseconds). */
export function signSessionUntil(expiresAtMs: number): string {
  const payload = Buffer.from(JSON.stringify({ exp: expiresAtMs })).toString('base64url')
  const signature = hmac(payload)
  if (!signature) throw new Error('Admin sessions are disabled: ADMIN_SECRET is not set.')
  return `v1.${payload}.${signature}`
}

export function signSession(): string {
  return signSessionUntil(Date.now() + ADMIN_SESSION_HOURS * 3600_000)
}

export function verifySessionToken(token: string | undefined | null): boolean {
  if (!token) return false
  const parts = String(token).split('.')
  if (parts.length !== 3 || parts[0] !== 'v1') return false
  const [, payload, sig] = parts
  const expected = hmac(payload)
  if (!expected) return false
  const expectBuf = Buffer.from(expected, 'hex')
  let sigBuf: Buffer
  try {
    sigBuf = Buffer.from(sig, 'hex')
  } catch {
    return false
  }
  if (sigBuf.length !== expectBuf.length) return false
  if (!timingSafeEqual(sigBuf, expectBuf)) return false
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'))
    return typeof data.exp === 'number' && data.exp > Date.now()
  } catch {
    return false
  }
}

/** Read the admin cookie from a Request (plain JS object on the server). */
export function cookieFromRequest(req: Request): string | undefined {
  const raw = req.headers.get('cookie') || ''
  for (const part of raw.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === ADMIN_COOKIE) return decodeURIComponent(rest.join('='))
  }
  return undefined
}

export function isAdminRequest(req: Request): boolean {
  return verifySessionToken(cookieFromRequest(req))
}
