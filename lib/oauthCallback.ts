/**
 * Parsing of the URL Supabase lands the browser on after a Google sign-in.
 *
 * Supabase supports two OAuth grant styles and they arrive in *different parts
 * of the URL*:
 *
 *  - PKCE      → `?code=…`            (query string)  — exchange with
 *                                       `exchangeCodeForSession(code)`
 *  - Implicit  → `#access_token=…&refresh_token=…`  (fragment) — install with
 *                                       `setSession({ access_token, refresh_token })`
 *
 * `@supabase/supabase-js` defaults `flowType` to `'implicit'`, so before this
 * helper existed the callback page looked only at `window.location.search`,
 * found no `code`, skipped the exchange, saw a `null` session and bounced the
 * freshly-authenticated user straight back to `/login`. Reading both halves of
 * the URL (plus the `error*` params Supabase uses when it refuses the
 * `redirect_to`) keeps the callback correct no matter which grant the project
 * is configured for.
 *
 * Kept dependency-free and DOM-free so `npm test` can exercise it directly.
 */

export interface AuthCallbackParams {
  /** PKCE authorization code (`?code=`), single-use. */
  code: string | null
  /** Implicit-grant access token (`#access_token=`). */
  accessToken: string | null
  /** Implicit-grant refresh token (`#refresh_token=`). */
  refreshToken: string | null
  /** Provider/Supabase error, e.g. `access_denied` or `otp_expired`. */
  error: string | null
  /** Human-readable detail for `error`. */
  errorDescription: string | null
}

function paramsFrom(chunk: string): URLSearchParams {
  // Tolerate a leading '#' / '?' so callers can pass either raw half.
  return new URLSearchParams(chunk.startsWith('#') || chunk.startsWith('?') ? chunk.slice(1) : chunk)
}

/**
 * Classify a callback URL. Query-string values win over fragment values, which
 * matches supabase-js's own `parseParametersFromURL`.
 */
export function parseAuthCallbackUrl(url: string): AuthCallbackParams {
  let search = ''
  let hash = ''
  try {
    const parsed = new URL(url)
    search = parsed.search
    hash = parsed.hash
  } catch {
    // Not an absolute URL (e.g. a bare path from a caller or a test). Split the
    // query string and fragment off by hand — `URLSearchParams` cannot be handed
    // a path, it would swallow `/auth/callback?code=x` as a single key.
    const hashAt = url.indexOf('#')
    const beforeHash = hashAt === -1 ? url : url.slice(0, hashAt)
    const hashPart = hashAt === -1 ? '' : url.slice(hashAt + 1)
    const qAt = beforeHash.indexOf('?')
    search = qAt === -1 ? '' : beforeHash.slice(qAt + 1)
    hash = hashPart
  }

  const q = paramsFrom(search)
  const h = paramsFrom(hash)
  const pick = (key: string): string | null => q.get(key) || h.get(key) || null

  // Supabase uses `error`/`error_description` for provider failures and
  // `error_code`/`error_description` for its own (e.g. `otp_expired`).
  const error = pick('error') || pick('error_code')

  return {
    code: pick('code'),
    accessToken: pick('access_token'),
    refreshToken: pick('refresh_token'),
    error,
    errorDescription: pick('error_description'),
  }
}

/** True when the URL carries a session (either grant style). */
export function hasSessionInCallbackUrl(p: AuthCallbackParams): boolean {
  return !!(p.code || (p.accessToken && p.refreshToken))
}

/** Best available message for an OAuth failure, for display on the callback page. */
export function describeAuthError(p: AuthCallbackParams): string {
  if (p.errorDescription) return p.errorDescription
  if (p.error) return p.error.replace(/_/g, ' ')
  return 'Sign-in could not be completed.'
}
