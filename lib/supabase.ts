// Supabase client — used only when NEXT_PUBLIC_SUPABASE_* env vars are set.
// When unconfigured, the app runs in fully local demo mode (localStorage),
// so `npm run dev` works out of the box with zero setup.
//
// IMPORTANT: this function must NEVER throw. It is called from click handlers
// (login, instructions "START 120-MIN TIMER", profile/resume save, assessment
// submit) and several of those call sites invoke it outside their try/catch.
// A malformed value (e.g. a placeholder URL without the https:// prefix) used
// to escape as an uncaught "Invalid supabaseUrl: Must be a valid HTTP or
// HTTPS URL." error and crash the Start Assessment flow. Configuration
// problems now degrade to local demo mode instead.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null
const FALLBACK_SUPABASE_URL = 'https://anegoqdlwnmcwbkrjhqm.supabase.co'
const FALLBACK_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFuZWdvcWRsd25tY3dia3JqaHFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2MjkwNzEsImV4cCI6MjEwNDIwNTA3MX0.pEE2UeN1llNrN_Ry_kIblKGfdVKgzacpC6rcKRqGaV8'

let resolved = false
let warned = false

function warnOnce(msg: string) {
  if (warned) return
  warned = true
  // eslint-disable-next-line no-console
  console.warn(`[supabase] ${msg} Falling back to local demo mode.`)
}

const env = (name: string): string => (process.env[name] || '').trim()

/** Project ref of a Supabase URL (`https://<ref>.supabase.co` → `<ref>`). */
function projectRef(u: string): string {
  try {
    return new URL(u).hostname.split('.')[0] || ''
  } catch {
    return ''
  }
}

/** JWT `ref` claim — the project a Supabase API key was issued for. */
function keyRef(key: string): string {
  try {
    return JSON.parse(Buffer.from(key.split('.')[1] || '', 'base64url').toString('utf8'))?.ref || ''
  } catch {
    return ''
  }
}

/**
 * Resolve the browser API key that belongs to `supabaseUrl`.
 *
 * A Supabase API key only works for the project it was issued for, so the URL
 * and the key must always come from the same project: when
 * NEXT_PUBLIC_SUPABASE_URL points somewhere else than the built-in default,
 * the built-in anon key is NOT substituted (that pairing makes every request
 * fail with 401 Invalid API key). Without a matching key the app runs in local
 * demo mode, which is loud in the console rather than silently broken.
 */
function anonKeyFor(supabaseUrl: string): string {
  const fromEnv = env('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  if (env('NEXT_PUBLIC_SUPABASE_URL')) return fromEnv
  if (!fromEnv) return FALLBACK_SUPABASE_ANON_KEY
  const ref = projectRef(supabaseUrl)
  return !ref || !keyRef(fromEnv) || keyRef(fromEnv) === ref ? fromEnv : FALLBACK_SUPABASE_ANON_KEY
}

export function isSupabaseConfigured(): boolean {
  const supabaseUrl = (env('NEXT_PUBLIC_SUPABASE_URL') || FALLBACK_SUPABASE_URL).trim()
  const key = anonKeyFor(supabaseUrl).trim()
  return !!(supabaseUrl && key && /^https?:\/\//i.test(supabaseUrl))
}

export function getSupabase(): SupabaseClient | null {
  if (resolved) return client
  resolved = true
  const supabaseUrl = (env('NEXT_PUBLIC_SUPABASE_URL') || FALLBACK_SUPABASE_URL)?.trim()
  const key = anonKeyFor(supabaseUrl)?.trim()
  if (!supabaseUrl || !key) {
    client = null
    return null
  }
  if (!/^https?:\/\//i.test(supabaseUrl)) {
    warnOnce(`NEXT_PUBLIC_SUPABASE_URL ("${supabaseUrl}") must be a valid http(s) URL.`)
    client = null
    return null
  }
  try {
    client = createClient(supabaseUrl, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Keep URL auto-detection off: /auth/callback performs the exchange
        // itself. If this were `true`, supabase-js would consume the single-use
        // `?code=` first and the callback page's own exchangeCodeForSession()
        // would then fail with "already used" and bounce the user to /login.
        detectSessionInUrl: false,
        // REQUIRED. supabase-js defaults `flowType` to 'implicit', which makes
        // Supabase return the session in the URL *fragment*
        // (#access_token=…) instead of a `?code=` query param. The callback
        // page exchanges a `?code=`, so under the default the session was never
        // picked up and every Google login ended back on /login. Pinning PKCE
        // makes Supabase send `?code=` — and it is the safer flow anyway.
        flowType: 'pkce',
      },
    })
  } catch (e) {
    warnOnce(`Supabase client could not be created (${(e as Error)?.message || e}).`)
    client = null
  }
  return client
}
