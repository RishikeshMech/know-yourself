import { NextResponse } from 'next/server'
import { resolveStudent } from './company/auth.ts'
import {
  getServerClient, getServiceRoleClient, isSupabaseEnvironmentConfigured, supabaseCredentialReport,
} from './supabaseServer.ts'
import type { SupabaseClient } from '@supabase/supabase-js'

export type StudentApiContext =
  | { ok: true; studentId: string; supabase: boolean; db: SupabaseClient | null }
  | { ok: false; response: NextResponse }

/**
 * Resolve the caller from a verified Supabase access token, never from a body
 * or query-string student id. In local demo mode only, the claimed id is used.
 * A configured Supabase deployment must have the server-only service-role key
 * for trusted writes/admin reads; without it, do not silently write to JSON or
 * report an anon/RLS-blocked request as durable.
 */
export async function requireStudentApi(req: Request, claimedId: unknown): Promise<StudentApiContext> {
  const authClient = getServiceRoleClient() || getServerClient()
  if (!authClient && isSupabaseEnvironmentConfigured()) {
    // Say exactly what is wrong. A URL without its own key used to fall back to
    // a hard-coded key from another project, so every call was rejected with
    // 401 and the candidate saw a misleading "session expired".
    const creds = supabaseCredentialReport()
    const detail = creds.key
      ? `The configured SUPABASE_SERVICE_ROLE_KEY does not belong to ${creds.url} (key project "${creds.keyRef}", URL project "${creds.urlRef}").`
      : `SUPABASE_SERVICE_ROLE_KEY is not set for ${creds.url}.`
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            'Supabase is configured but the server cannot reach it. Assessment data has not been accepted. ' +
            detail +
            ' Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_ANON_KEY for the same project and restart.',
        },
        { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '30' } },
      ),
    }
  }
  // Supabase mode still validates the bearer token in resolveStudent; this
  // header only supplies the local-demo identity when an endpoint has no
  // student_id query/body field (for example, a session-id URL).
  const identityClaim = claimedId ?? req.headers.get('x-student-id')
  const identity = await resolveStudent(req, identityClaim, authClient)
  if (!identity.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: identity.error },
        { status: identity.status, headers: { 'Cache-Control': 'no-store' } },
      ),
    }
  }

  if (!authClient) {
    return { ok: true, studentId: identity.studentId, supabase: false, db: null }
  }

  const db = getServiceRoleClient()
  if (!db) {
    const creds = supabaseCredentialReport()
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            'Supabase storage is not ready — your test has not been accepted. ' +
            (creds.key
              ? `The configured SUPABASE_SERVICE_ROLE_KEY does not belong to ${creds.url} (key project "${creds.keyRef}", URL project "${creds.urlRef}").`
              : `SUPABASE_SERVICE_ROLE_KEY is not set for ${creds.url}.`) +
            ' Set it for the same project as NEXT_PUBLIC_SUPABASE_URL and restart.',
        },
        { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '30' } },
      ),
    }
  }

  return { ok: true, studentId: identity.studentId, supabase: true, db }
}
