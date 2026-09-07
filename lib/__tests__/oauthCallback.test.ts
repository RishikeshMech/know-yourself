import test from 'node:test'
import assert from 'node:assert/strict'

import {
  parseAuthCallbackUrl,
  hasSessionInCallbackUrl,
  describeAuthError,
} from '../oauthCallback.ts'

/**
 * The two URLs Supabase actually sends the browser back to after Google.
 * Getting these wrong is what caused the /login → Google → /login loop: the
 * callback page only ever looked at the query string, so an implicit-grant
 * callback (fragment) produced no code, no session and a silent redirect.
 */
const PKCE_URL =
  'http://localhost:3000/auth/callback?code=01abcdef23-4567-89ab-cdef-0123456789ab'

const IMPLICIT_URL =
  'http://localhost:3000/auth/callback#access_token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig' +
  '&expires_in=3600&refresh_token=v1.refresh.token&token_type=bearer&type=access_token'

const PROD_IMPLICIT_URL =
  'https://assessment.calibiai.com/auth/callback#access_token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig' +
  '&expires_in=3600&refresh_token=v1.refresh.token&token_type=bearer&type=access_token'

test('PKCE callback: the ?code= is picked up from the query string', () => {
  const cb = parseAuthCallbackUrl(PKCE_URL)
  assert.equal(cb.code, '01abcdef23-4567-89ab-cdef-0123456789ab')
  assert.equal(cb.accessToken, null)
  assert.equal(cb.error, null)
  assert.equal(hasSessionInCallbackUrl(cb), true)
})

test('implicit callback: the fragment tokens are picked up (the old regression)', () => {
  const cb = parseAuthCallbackUrl(IMPLICIT_URL)
  // The regression: location.search is empty here, so `code` must be null…
  assert.equal(cb.code, null)
  // …and the tokens must still be found in the hash.
  assert.equal(
    cb.accessToken,
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig',
  )
  assert.equal(cb.refreshToken, 'v1.refresh.token')
  assert.equal(hasSessionInCallbackUrl(cb), true)
})

test('implicit callback works on any deployed origin, not just localhost', () => {
  const cb = parseAuthCallbackUrl(PROD_IMPLICIT_URL)
  assert.equal(cb.accessToken, 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig')
  assert.equal(cb.refreshToken, 'v1.refresh.token')
})

test('query string wins over fragment when both are present', () => {
  const cb = parseAuthCallbackUrl(PKCE_URL + '#access_token=from-hash&refresh_token=r')
  assert.equal(cb.code, '01abcdef23-4567-89ab-cdef-0123456789ab')
  assert.equal(cb.accessToken, 'from-hash')
})

test('a bare callback with no code and no tokens is NOT a session', () => {
  const cb = parseAuthCallbackUrl('http://localhost:3000/auth/callback')
  assert.equal(hasSessionInCallbackUrl(cb), false)
  assert.equal(cb.error, null)
})

test('access_token without refresh_token is not a usable session', () => {
  const cb = parseAuthCallbackUrl('http://localhost:3000/auth/callback#access_token=abc')
  assert.equal(hasSessionInCallbackUrl(cb), false)
})

test('provider denial is surfaced as an error, not a silent loop', () => {
  const cb = parseAuthCallbackUrl(
    'http://localhost:3000/auth/callback?error=access_denied&error_description=User+cancelled',
  )
  assert.equal(cb.error, 'access_denied')
  assert.equal(describeAuthError(cb), 'User cancelled')
  assert.equal(hasSessionInCallbackUrl(cb), false)
})

test('supabase error_code variant is surfaced too', () => {
  const cb = parseAuthCallbackUrl(
    'https://assessment.calibiai.com/auth/callback#error_code=otp_expired&error_description=Token+has+expired',
  )
  assert.equal(cb.error, 'otp_expired')
  assert.equal(describeAuthError(cb), 'Token has expired')
})

test('describeAuthError has a readable fallback', () => {
  assert.equal(describeAuthError({ code: null, accessToken: null, refreshToken: null, error: null, errorDescription: null }),
    'Sign-in could not be completed.')
})

test('relative callback paths still parse', () => {
  const cb = parseAuthCallbackUrl('/auth/callback?code=rel-code')
  assert.equal(cb.code, 'rel-code')
})

test('relative callback path with a fragment still parses', () => {
  const cb = parseAuthCallbackUrl('/auth/callback#access_token=rel-access&refresh_token=rel-refresh')
  assert.equal(cb.accessToken, 'rel-access')
  assert.equal(cb.refreshToken, 'rel-refresh')
})
