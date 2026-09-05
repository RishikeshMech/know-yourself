// Supabase client — used only when NEXT_PUBLIC_SUPABASE_* env vars are set.
// When unconfigured, the app runs in fully local demo mode (localStorage),
// so `npm run dev` works out of the box with zero setup.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null
let resolved = false

export function isSupabaseConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
}

export function getSupabase(): SupabaseClient | null {
  if (resolved) return client
  resolved = true
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    client = null
    return null
  }
  client = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  })
  return client
}
