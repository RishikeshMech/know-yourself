// Server-side Supabase clients for API routes.
// `getServerClient` is used for Auth token verification and may fall back to the
// public anon key. Trusted data writes/administration MUST use
// `getServiceRoleClient`; an anon key without the caller's JWT cannot satisfy
// the app's RLS policies and must never be reported as a successful write.
// The service-role key is server-only and is never returned to browser code.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let serverClient: SupabaseClient | null | undefined
let serviceRoleClient: SupabaseClient | null | undefined

function url(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
}

export function isSupabaseServiceRoleConfigured(): boolean {
  return !!(url() && (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim())
}

/** True when any Supabase deployment setting is present, even if incomplete. */
export function isSupabaseEnvironmentConfigured(): boolean {
  return !!(
    url() ||
    (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim() ||
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim()
  )
}

/** Trusted server-side database client. Returns null unless service role is configured. */
export function getServiceRoleClient(): SupabaseClient | null {
  if (serviceRoleClient !== undefined) return serviceRoleClient
  serviceRoleClient = null
  const supabaseUrl = url()
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
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
    ''
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
