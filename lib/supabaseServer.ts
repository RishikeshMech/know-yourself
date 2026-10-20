// Server-side Supabase clients for API routes.
// `getServerClient` is used for Auth token verification and may fall back to the
// public anon key. Trusted data writes/administration MUST use
// `getServiceRoleClient`; an anon key without the caller's JWT cannot satisfy
// the app's RLS policies and must never be reported as a successful write.
// The service-role key is server-only and is never returned to browser code.
//
// ---------------------------------------------------------------------------
// CREDENTIAL PAIRING (the bug this file used to have)
// ---------------------------------------------------------------------------
// A Supabase API key is issued for exactly ONE project: the JWT's `ref` claim
// must equal the project in the URL. This module used to take the URL from the
// environment (`NEXT_PUBLIC_SUPABASE_URL`) but ALWAYS use a hard-coded
// service-role key. On any deployment whose .env points at a different project
// than the hard-coded one, every server-side call was answered by PostgREST
// with `401 Invalid API key`, which surfaced as:
//   • `resolveStudent` could not verify the caller → 401 "Your session has
//     expired — please sign in again." → the company assessment never opened;
//   • `persistCompanyAttempt` could not write → AttemptPersistenceError → 503
//     → "company data is not storing properly";
//   • `/result` and the attempt list could not read → "results are not showing".
// Keys are therefore resolved together with their URL: an env URL only ever
// pairs with an env key, and the built-in key is only used with the built-in
// URL (the zero-config default deployment).
// ---------------------------------------------------------------------------
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let serverClient: SupabaseClient | null | undefined
let serviceRoleClient: SupabaseClient | null | undefined

const FALLBACK_SUPABASE_URL = 'https://anegoqdlwnmcwbkrjhqm.supabase.co'
const FALLBACK_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFuZWdvcWRsd25tY3dia3JqaHFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2MjkwNzEsImV4cCI6MjEwNDIwNTA3MX0.pEE2UeN1llNrN_Ry_kIblKGfdVKgzacpC6rcKRqGaV8'
const FALLBACK_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFuZWdvcWRsd25tY3dia3JqaHFtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODYyOTA3MSwiZXhwIjoyMTA0MjA1MDcxfQ.KQUTNs8mHLD2wJRUfGuUEUA-hLeJYpebzuHyx2VVIfM'

const env = (name: string): string => (process.env[name] || '').trim()

function url(): string {
  return env('NEXT_PUBLIC_SUPABASE_URL') || FALLBACK_SUPABASE_URL
}

/**
 * Resolve the API key that belongs to `supabaseUrl`.
 *
 * - The URL comes from the environment → the key MUST come from the
 *   environment too. Substituting the built-in key here is exactly the
 *   cross-project mismatch described above, so it is never done.
 * - The URL is the built-in default → an explicitly configured key is used
 *   only when it was issued for this project; otherwise the built-in pair is
 *   kept so the zero-config deployment keeps working.
 * Returns '' when no usable key exists (callers then report a clear 503).
 */
function keyFor(supabaseUrl: string, envName: string, fallback: string): string {
  const fromEnv = env(envName)
  if (env('NEXT_PUBLIC_SUPABASE_URL')) return fromEnv
  if (!fromEnv) return fallback
  return refsMatch(supabaseUrl, fromEnv) ? fromEnv : fallback
}

/** True when `key` was issued for the project in `supabaseUrl` (or is unparseable). */
function refsMatch(supabaseUrl: string, key: string): boolean {
  const ref = projectRefFromUrl(supabaseUrl)
  if (!ref) return true
  const keyRef = parseJwtRef(key)
  return !keyRef || keyRef === 'unknown' || keyRef === 'invalid' || keyRef === ref
}

export function isSupabaseServiceRoleConfigured(): boolean {
  return !!getServiceRoleClient()
}

/** Never log a full key — this is enough to identify it. */
function maskKey(key: string): string {
  if (!key) return ''
  return key.length <= 14 ? '***' : `${key.slice(0, 10)}…${key.slice(-4)}`
}

export interface SupabaseCredentialReport {
  /** The project URL the server talks to. */
  url: string
  urlFromEnv: boolean
  /** Masked API key resolved for that URL. */
  key: string
  keyRole: string
  keyRef: string
  urlRef: string
  /** The key was issued for the project in the URL. */
  matches: boolean
  /** A usable service-role client exists. */
  serviceRoleReady: boolean
  /** A usable client of any kind exists. */
  clientReady: boolean
}

/**
 * The EFFECTIVE server-side Supabase credentials, for diagnostics
 * (`/api/health`, logs, tests). A `matches: false` (or empty key) is exactly
 * the state in which every server-side call is rejected with
 * `401 Invalid API key` — the company assessment will not open, autosaves and
 * submissions are refused, and results never load.
 */
export function supabaseCredentialReport(): SupabaseCredentialReport {
  const supabaseUrl = url()
  const serviceKey = keyFor(supabaseUrl, 'SUPABASE_SERVICE_ROLE_KEY', FALLBACK_SERVICE_ROLE_KEY)
  const anyKey =
    serviceKey || keyFor(supabaseUrl, 'NEXT_PUBLIC_SUPABASE_ANON_KEY', FALLBACK_SUPABASE_ANON_KEY)
  return {
    url: supabaseUrl,
    urlFromEnv: !!env('NEXT_PUBLIC_SUPABASE_URL'),
    key: maskKey(anyKey),
    keyRole: anyKey ? parseJwtRole(anyKey) : 'none',
    keyRef: anyKey ? parseJwtRef(anyKey) : '',
    urlRef: projectRefFromUrl(supabaseUrl),
    matches: refsMatch(supabaseUrl, anyKey),
    serviceRoleReady: !!getServiceRoleClient(),
    clientReady: !!getServerClient(),
  }
}

/**
 * True when Supabase is meant to be in use — either the built-in default
 * project is reachable or the operator set at least one Supabase variable.
 * A half-configured deployment must fail loudly (the API answers 503 and says
 * so) instead of silently degrading to the local JSON store, which would lose
 * assessment data.
 */
export function isSupabaseEnvironmentConfigured(): boolean {
  if (
    env('NEXT_PUBLIC_SUPABASE_URL') ||
    env('SUPABASE_SERVICE_ROLE_KEY') ||
    env('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  ) {
    return true
  }
  return !!getServiceRoleClient()
}

export function parseJwtRole(key: string): string {
  try {
    const payload = JSON.parse(Buffer.from(key.split('.')[1] || '', 'base64url').toString('utf8'))
    return payload?.role || 'unknown'
  } catch {
    return 'invalid'
  }
}

export function parseJwtRef(key: string): string {
  try {
    const payload = JSON.parse(Buffer.from(key.split('.')[1] || '', 'base64url').toString('utf8'))
    return payload?.ref || 'unknown'
  } catch {
    return 'invalid'
  }
}

export function projectRefFromUrl(u: string): string {
  try {
    const host = new URL(u).hostname
    return host.split('.')[0] || ''
  } catch {
    return ''
  }
}

/**
 * Supabase transport that is NEVER served from Next.js's Data Cache.
 *
 * `next build` replaces the global `fetch` with a caching one: in a production
 * build every GET a server module makes is written to `.next/cache/fetch-cache`
 * with `revalidate: 31536000` (a year) and replayed from disk afterwards. The
 * route segment's `dynamic = 'force-dynamic'` does not cover these calls —
 * supabase-js holds a module-scoped client, so its requests are not attributed
 * to the handler's segment — and `.next/cache` survives both a rebuild and a
 * restart, which is why redeploying never cleared it.
 *
 * Every server-side Supabase read was therefore answered from a frozen
 * snapshot: PostgREST `GET company_assessment_attempts?...&company_slug=eq.X`
 * replayed its pre-submission body, so a finished attempt came back as "no
 * attempt". The candidate saw their score (scored in memory and returned by
 * /submit), but the dashboard list, /result and /attempt all read the stale
 * snapshot — no report, and the one-attempt guard let them start again.
 * Student profiles and assessment 1/2 results went stale the same way, and a
 * cached `/auth/v1/user` kept validating a token for a year.
 *
 * `cache: 'no-store'` opts every Supabase request out of that cache. It must
 * stay on this client: a bare `fetch` here is silently cached for a year.
 */
const noStoreFetch: typeof fetch = (input, init) =>
  fetch(input as any, { ...(init || {}), cache: 'no-store' })

function makeClient(supabaseUrl: string, key: string): SupabaseClient | null {
  try {
    return createClient(supabaseUrl, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: noStoreFetch },
    })
  } catch (e) {
    console.error('[supabase] client unavailable:', (e as Error)?.message || e)
    return null
  }
}

/** Trusted server-side database client. Returns null unless service role is configured. */
export function getServiceRoleClient(): SupabaseClient | null {
  if (serviceRoleClient !== undefined) return serviceRoleClient
  serviceRoleClient = null
  const supabaseUrl = url()
  const key = keyFor(supabaseUrl, 'SUPABASE_SERVICE_ROLE_KEY', FALLBACK_SERVICE_ROLE_KEY)
  if (!supabaseUrl || !key) {
    if (env('NEXT_PUBLIC_SUPABASE_URL') && !env('SUPABASE_SERVICE_ROLE_KEY')) {
      console.error(
        `[supabase] NEXT_PUBLIC_SUPABASE_URL is set to ${supabaseUrl} but SUPABASE_SERVICE_ROLE_KEY is missing — ` +
        'server-side writes are disabled. Set SUPABASE_SERVICE_ROLE_KEY for that same project.',
      )
    }
    return null
  }
  if (!refsMatch(supabaseUrl, key)) {
    console.error(
      `[supabase] SUPABASE_SERVICE_ROLE_KEY does not belong to ${supabaseUrl} ` +
      `(key ref ${parseJwtRef(key)} vs project ${projectRefFromUrl(supabaseUrl)}) — ` +
      'every request would be rejected with 401 Invalid API key.',
    )
    return null
  }
  serviceRoleClient = makeClient(supabaseUrl, key)
  return serviceRoleClient
}

/**
 * Server Auth client. Prefers service role (which can still verify a supplied
 * user JWT); uses anon only for auth operations when service role is absent.
 * Do not use this fallback client for trusted writes.
 */
export function getServerClient(): SupabaseClient | null {
  if (serverClient !== undefined) return serverClient
  serverClient = null
  const supabaseUrl = url()
  const key =
    keyFor(supabaseUrl, 'SUPABASE_SERVICE_ROLE_KEY', FALLBACK_SERVICE_ROLE_KEY) ||
    keyFor(supabaseUrl, 'NEXT_PUBLIC_SUPABASE_ANON_KEY', FALLBACK_SUPABASE_ANON_KEY)
  if (!supabaseUrl || !key) return null
  if (!refsMatch(supabaseUrl, key)) {
    console.error(
      `[supabase] the configured API key does not belong to ${supabaseUrl} — ` +
      'set NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY for the same project.',
    )
    return null
  }
  serverClient = makeClient(supabaseUrl, key)
  return serverClient
}

export function isSupabaseBackend(): boolean {
  return !!getServerClient()
}
