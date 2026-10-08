import { NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/adminAuth'
import { getAllFeedback, getFeedbackForStudent } from '@/lib/db'
import { flushQueuedFeedback, saveFeedbackSubmission } from '@/lib/feedbackStore'
import { fetchFeedbackForStudent } from '@/lib/persist'
import { isSupabaseConfigured } from '@/lib/supabase'
import { optionalStudent, resolveStudentAccess } from '@/lib/studentAuth'
import { getServerClient, getServiceClient } from '@/lib/supabaseServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Candidate feedback ("which candidate gave which feedback").
 *
 *   POST /api/feedback   { id?, session_id?, rating, message, source? }
 *                        + optional `Authorization: Bearer <access token>`
 *   GET  /api/feedback   → the signed-in candidate's own submissions
 *                          (admins may also list everything: see the admin console)
 *
 * Supabase `feedback_submissions` is the destination. The local store is the
 * retry queue when a write fails, so a candidate is never blocked on the
 * database. Attribution comes from the verified token only: a request that is not
 * signed in is stored anonymously and can never be filed under a student.
 */
export async function POST(req: Request) {
  let body: any = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 })
  }

  let client = getServerClient()
  if (isSupabaseConfigured()) {
    const who = await optionalStudent(req)
    // Never trust a student id or email typed into the body (see the header).
    body = { ...body, student_id: who.studentId || '', email: who.email || '' }
    client = who.client || client
  }
  const result = await saveFeedbackSubmission(body, client)

  // A rejected payload is the only failure the candidate can act on.
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  // Best-effort: deliver anything queued by an earlier failed write while the
  // connection is already open. Failures here change nothing for the caller.
  let flushed = { attempted: 0, synced: 0, failed: 0 }
  try {
    const flushClient = getServiceClient() || getServerClient()
    if (flushClient) flushed = await flushQueuedFeedback(flushClient)
  } catch (e: any) {
    console.warn('[feedback] queue flush failed:', e?.message || e)
  }

  return NextResponse.json({
    ok: true,
    saved: true,
    /** False only in fully local demo mode, where the local store *is* the store. */
    supabase_configured: isSupabaseConfigured(),
    feedback: result.submission,
    /** True when the row is in Postgres right now. */
    supabase: result.stored === 'supabase',
    /** True when it was accepted and is waiting for the database to come back. */
    queued: result.stored === 'queue',
    stored: result.stored,
    reason: result.reason,
    duplicate: !!result.duplicate,
    flushed,
  })
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    if (isAdminRequest(req)) {
      // Admin/diagnostic listing — same shape as the local store.
      const studentId = url.searchParams.get('student_id') || ''
      const email = url.searchParams.get('email') || ''
      if (!studentId && !email) return NextResponse.json({ feedback: getAllFeedback() })
    }

    if (!isSupabaseConfigured()) {
      const studentId = url.searchParams.get('student_id') || url.searchParams.get('user_id') || ''
      const email = url.searchParams.get('email') || ''
      if (!studentId && !email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      return NextResponse.json({ feedback: getFeedbackForStudent(studentId, email) })
    }

    // Supabase: a candidate sees only their own rows (their verified id or email).
    const who = await resolveStudentAccess(req, null)
    if (!who.ok) return NextResponse.json({ error: who.error }, { status: who.status })
    // The lookup is keyed by the VERIFIED id/email, so it may use the service client
    // (rows attributed by student_ref are not visible through RLS alone).
    const own = who.mode === 'supabase' ? who.client : null
    const reader = getServiceClient() || own
    if (!reader) return NextResponse.json({ error: 'Supabase is not configured on this server.' }, { status: 503 })
    const remote = await fetchFeedbackForStudent(reader, who.studentId, who.email || '')
    if (remote === null) {
      return NextResponse.json({ error: 'Could not load your feedback right now — please retry.' }, { status: 503 })
    }
    const local = getFeedbackForStudent(who.studentId, who.email || '')
    const seen = new Set<string>()
    const merged = [...remote, ...local].filter(f => {
      const key = String(f.id) || `${f.created_at}|${f.message}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    merged.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    return NextResponse.json({ feedback: merged, supabase: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to load feedback.' }, { status: 500 })
  }
}
