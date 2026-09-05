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
let resolved = false
let warned = false

function warnOnce(msg: string) {
  if (warned) return
  warned = true
  // eslint-disable-next-line no-console
  console.warn(`[supabase] ${msg} Falling back to local demo mode.`)
}

export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  return !!(url && key && /^https?:\/\//i.test(url.trim()))
}

export function getSupabase(): SupabaseClient | null {
  if (resolved) return client
  resolved = true
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  if (!url || !key) {
    client = null
    return null
  }
  if (!/^https?:\/\//i.test(url)) {
    warnOnce(`NEXT_PUBLIC_SUPABASE_URL ("${url}") must be a valid http(s) URL.`)
    client = null
    return null
  }
  try {
    client = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  } catch (e) {
    warnOnce(`Supabase client could not be created (${(e as Error)?.message || e}).`)
    client = null
  }
  return client
}
