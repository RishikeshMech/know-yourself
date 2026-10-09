'use client'

import { getSupabase } from './supabase.ts'

/** Attach the current Supabase access token to same-origin API requests. */
export async function supabaseAuthHeaders(input?: HeadersInit): Promise<Headers> {
  const headers = new Headers(input)
  // The id is only a claim for local demo mode. In Supabase mode the API
  // verifies the bearer token and rejects a claim that does not match it.
  try {
    if (typeof window !== 'undefined' && !headers.has('x-student-id')) {
      const rawUser = localStorage.getItem('calibiai_user')
      const studentId = rawUser ? JSON.parse(rawUser)?.id : null
      if (typeof studentId === 'string' && studentId.trim()) {
        headers.set('x-student-id', studentId.trim())
      }
    }
  } catch {
    // No local identity claim; authenticated Supabase requests still work.
  }

  try {
    const supabase = getSupabase()
    if (!supabase) return headers
    const { data, error } = await supabase.auth.getSession()
    const token = !error ? data?.session?.access_token : null
    if (token) headers.set('Authorization', `Bearer ${token}`)
  } catch {
    // The API will reject a Supabase-mode request without a valid token. Local
    // demo mode intentionally has no Supabase session.
  }
  return headers
}

/** Fetch a same-origin student API with the current Supabase identity attached. */
export async function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = await supabaseAuthHeaders(init.headers)
  return fetch(input, {
    ...init,
    headers,
    credentials: init.credentials || 'same-origin',
  })
}
