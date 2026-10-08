/**
 * The admin console must never show a partial picture as if it were the whole.
 *
 * When Supabase is the store, the admin can only read every student's record with
 * the service role key. Without it, Row Level Security returns just the rows the
 * server is allowed to see (none), and the page used to fill the gap with local
 * demo rows. So while the key is missing, the admin data routes answer 503 with an
 * explicit reason instead of a list that looks complete but is not.
 */
import { NextResponse } from 'next/server'
import { isSupabaseConfigured } from './supabase.ts'
import { hasServiceKey } from './supabaseServer.ts'

export function adminStoreProblem(): string | null {
  if (isSupabaseConfigured() && !hasServiceKey()) {
    return 'The admin console cannot read student records from Supabase: set SUPABASE_SERVICE_ROLE_KEY on the server (Supabase → Project Settings → API → service_role). Partial data is hidden until then.'
  }
  return null
}

/** A 503 response when the admin cannot read the store, or null when it can. */
export function adminStoreUnavailable(): NextResponse | null {
  const problem = adminStoreProblem()
  if (!problem) return null
  return NextResponse.json({ error: problem, code: 'SERVICE_ROLE_REQUIRED' }, { status: 503 })
}
