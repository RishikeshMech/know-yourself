// Server-side Supabase clients for API routes.
// `getServerClient` is used for Auth token verification and may fall back to the
// public anon key. Trusted data writes/administration MUST use
// `getServiceRoleClient`; an anon key without the caller's JWT cannot satisfy
// the app's RLS policies and must never be reported as a successful write.
// The service-role key is server-only and is never returned to browser code.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let serverClient: SupabaseClient | null | undefined
let serviceRoleClient: SupabaseClient | null | undefined

const FALLBACK_SUPABASE_URL = 'https://anegoqdlwnmcwbkrjhqm.supabase.co'
const FALLBACK_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFuZWdvcWRsd25tY3dia3JqaHFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2MjkwNzEsImV4cCI6MjEwNDIwNTA3MX0.pEE2UeN1llNrN_Ry_kIblKGfdVKgzacpC6rcKRqGaV8'
const FALLBACK_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFuZWdvcWRsd25tY3dia3JqaHFtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODYyOTA3MSwiZXhwIjoyMTA0MjA1MDcxfQ.KQUTNs8mHLD2wJRUfGuUEUA-hLeJYpebzuHyx2VVIfM'

function url(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_SUPABASE_URL).trim()
}

export function isSupabaseServiceRoleConfigured(): boolean {
  return !!(url() && (process.env.SUPABASE_SERVICE_ROLE_KEY || FALLBACK_SERVICE_ROLE_KEY).trim())
}

/** True when any Supabase deployment setting is present, even if incomplete. */
export function isSupabaseEnvironmentConfigured(): boolean {
  return true
}

export function parseJwtRole(key: string): string {
  try {
    const payload = JSON.parse(Buffer.from(key.split('.')[1] || '', 'base64url').toString('utf8'))
    return payload?.role || 'unknown'
  } catch {
    return 'invalid'
  }
}

/** Trusted server-side database client. Returns null unless service role is configured. */
export function getServiceRoleClient(): SupabaseClient | null {
  if (serviceRoleClient !== undefined) return serviceRoleClient
  serviceRoleClient = null
  const supabaseUrl = url()
  let key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!key || parseJwtRole(key) !== 'service_role') {
    key = FALLBACK_SERVICE_ROLE_KEY
  }
  if (!supabaseUrl || !key) return null
  try {
    serviceRoleClient = createClient(supabaseUrl, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
  } catch (e) {
    console.error('[supabase] service-role client unavailable:', (e as Error)?.message || e)
  }
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
  const key = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    FALLBACK_SERVICE_ROLE_KEY ||
    FALLBACK_SUPABASE_ANON_KEY
  ).trim()
  if (!supabaseUrl || !key) return null
  try {
    serverClient = createClient(supabaseUrl, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
  } catch (e) {
    console.error('[supabase] server client unavailable:', (e as Error)?.message || e)
    serverClient = null
  }
  return serverClient
}

export function isSupabaseBackend(): boolean {
  return !!getServerClient()
}
