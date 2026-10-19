/**
 * Production-ready cookie and token utilities for CalibiAI.
 *
 * Catches auth tokens and preferences from cookies, custom headers, and standard
 * authorization headers. This makes student sessions resilient to proxies
 * (e.g. LiteSpeed on MilesWeb) that strip standard Authorization headers.
 */

export const AUTH_COOKIE_NAME = 'calibiai_token'
export const SUPABASE_COOKIE_NAME = 'sb-access-token'
export const COOKIE_CONSENT_NAME = 'calibiai_cookie_consent'

/**
 * Extract auth token from an incoming server Request.
 * Priority order:
 * 1. Authorization: Bearer <token>
 * 2. x-access-token / x-supabase-auth (proxy bypass headers)
 * 3. Cookie header: sb-access-token, calibiai_token, supabase-auth-token, or sb-<project>-auth-token
 */
export function extractAuthToken(req: Request): string | null {
  // 1. Authorization header
  const authHeader = req.headers.get('authorization') || ''
  if (authHeader.startsWith('Bearer ') || authHeader.startsWith('bearer ')) {
    const token = authHeader.slice(7).trim()
    if (token) return token
  }

  // 2. Custom headers that reverse proxies (LiteSpeed / Apache / Nginx) do not strip
  const customHeader = req.headers.get('x-access-token') || req.headers.get('x-supabase-auth') || ''
  if (customHeader.trim()) {
    return customHeader.trim()
  }

  // 3. Cookie header
  const rawCookie = req.headers.get('cookie') || ''
  if (!rawCookie) return null

  const parsedCookies: Record<string, string> = {}
  for (const part of rawCookie.split(';')) {
    const [key, ...val] = part.trim().split('=')
    if (key && val.length > 0) {
      try {
        parsedCookies[key.trim()] = decodeURIComponent(val.join('='))
      } catch {
        parsedCookies[key.trim()] = val.join('=')
      }
    }
  }

  // Check direct token cookies
  if (parsedCookies[AUTH_COOKIE_NAME]) return parsedCookies[AUTH_COOKIE_NAME]
  if (parsedCookies[SUPABASE_COOKIE_NAME]) return parsedCookies[SUPABASE_COOKIE_NAME]

  // Check generic Supabase auth cookie
  if (parsedCookies['supabase-auth-token']) {
    try {
      const parsed = JSON.parse(parsedCookies['supabase-auth-token'])
      if (Array.isArray(parsed) && parsed[0]) return parsed[0]
      if (typeof parsed?.access_token === 'string') return parsed.access_token
    } catch {
      return parsedCookies['supabase-auth-token']
    }
  }

  // Check project-specific Supabase cookies (sb-<ref>-auth-token)
  for (const [key, val] of Object.entries(parsedCookies)) {
    if (/^sb-[a-z0-9_-]+-auth-token(\.\d+)?$/i.test(key)) {
      try {
        let content = val
        if (content.startsWith('base64-')) {
          content = Buffer.from(content.slice(7), 'base64').toString('utf8')
        }
        const parsed = JSON.parse(content)
        if (Array.isArray(parsed) && typeof parsed[0] === 'string') return parsed[0]
        if (typeof parsed?.access_token === 'string') return parsed.access_token
      } catch {
        if (val && val.length > 25 && !val.includes('{') && !val.includes('}')) {
          return val
        }
      }
    }
  }

  return null
}

/**
 * Client-side sync: catch and cache the access token in browser cookies.
 * This guarantees subsequent same-origin fetches and page navigations
 * carry authentication even if custom headers are not attached.
 */
export function syncClientAuthCookie(token: string | null, maxAgeSec: number = 60 * 60 * 24 * 7): void {
  if (typeof document === 'undefined') return
  try {
    const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:'
    const secureFlag = isHttps ? '; Secure' : ''
    if (token) {
      const encoded = encodeURIComponent(token)
      document.cookie = `${AUTH_COOKIE_NAME}=${encoded}; path=/; max-age=${maxAgeSec}; SameSite=Lax${secureFlag}`
      document.cookie = `${SUPABASE_COOKIE_NAME}=${encoded}; path=/; max-age=${maxAgeSec}; SameSite=Lax${secureFlag}`
    } else {
      document.cookie = `${AUTH_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax${secureFlag}`
      document.cookie = `${SUPABASE_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax${secureFlag}`
    }
  } catch {
    // Ignore restricted environments
  }
}

/**
 * Client-side helper to read cookie consent status.
 */
export function getCookieConsent(): 'all' | 'essential' | null {
  if (typeof document === 'undefined') return null
  try {
    const local = localStorage.getItem(COOKIE_CONSENT_NAME)
    if (local === 'all' || local === 'essential') return local

    const raw = document.cookie || ''
    for (const piece of raw.split(';')) {
      const [k, v] = piece.trim().split('=')
      if (k === COOKIE_CONSENT_NAME) {
        const val = decodeURIComponent(v || '')
        if (val === 'all' || val === 'essential') return val
      }
    }
  } catch {
    // Fall back to null
  }
  return null
}

/**
 * Client-side helper to record cookie consent with 1-year persistence.
 */
export function setCookieConsent(level: 'all' | 'essential'): void {
  if (typeof document === 'undefined') return
  try {
    localStorage.setItem(COOKIE_CONSENT_NAME, level)
    const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:'
    const secureFlag = isHttps ? '; Secure' : ''
    const maxAge = 60 * 60 * 24 * 365 // 1 year
    document.cookie = `${COOKIE_CONSENT_NAME}=${encodeURIComponent(level)}; path=/; max-age=${maxAge}; SameSite=Lax${secureFlag}`
  } catch {
    // Ignore
  }
}
