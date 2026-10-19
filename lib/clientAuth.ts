'use client'

import { getSupabase } from './supabase.ts'
import { syncClientAuthCookie } from './cookieAuth.ts'

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
    let token = !error ? data?.session?.access_token : null

    // Proactively refresh the access token if it has expired or will expire within 60s
    const expiresAt = data?.session?.expires_at
    const isExpiredOrSoon = !token || (typeof expiresAt === 'number' && expiresAt * 1000 <= Date.now() + 60_000)
    if (isExpiredOrSoon) {
      const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession()
      if (!refreshErr && refreshData?.session?.access_token) {
        token = refreshData.session.access_token
      }
    }

    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
      headers.set('x-access-token', token)
      syncClientAuthCookie(token)
    }
  } catch {
    // The API will reject a Supabase-mode request without a valid token. Local
    // demo mode intentionally has no Supabase session.
  }
  return headers
}

/** Fetch a same-origin student API with the current Supabase identity attached. */
export async function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = await supabaseAuthHeaders(init.headers)
  let response = await fetch(input, {
    ...init,
    headers,
    credentials: init.credentials || 'same-origin',
  })

  // If unauthorized (401), the access token may have expired right before this call.
  // Proactively refresh the session and retry the request once.
  if (response.status === 401) {
    try {
      const supabase = getSupabase()
      if (supabase) {
        const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession()
        if (!refreshErr && refreshData?.session?.access_token) {
          const newToken = refreshData.session.access_token
          const retryHeaders = new Headers(init.headers)
          retryHeaders.set('Authorization', `Bearer ${newToken}`)
          retryHeaders.set('x-access-token', newToken)
          syncClientAuthCookie(newToken)
          if (typeof window !== 'undefined' && !retryHeaders.has('x-student-id')) {
            const rawUser = localStorage.getItem('calibiai_user')
            const studentId = rawUser ? JSON.parse(rawUser)?.id : null
            if (typeof studentId === 'string' && studentId.trim()) {
              retryHeaders.set('x-student-id', studentId.trim())
            }
          }
          response = await fetch(input, {
            ...init,
            headers: retryHeaders,
            credentials: init.credentials || 'same-origin',
          })
        }
      }
    } catch {
      // Return initial response
    }
  }

  return response
}
