import { NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/adminAuth'
import { getAllHelpRequests } from '@/lib/db'
import { flushQueuedHelpRequests, saveHelpSubmission } from '@/lib/helpStore'
import { fetchAllHelpRequests } from '@/lib/persist'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'
import { isSupabaseConfigured } from '@/lib/supabase'
import { optionalStudent } from '@/lib/studentAuth'
import { getServerClient } from '@/lib/supabaseServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * In-app help requests ("A little help, right here").
 *
 *   POST /api/help  { id?, student_id?, email, phone, message, page? }
 *   GET  /api/help  → admin only: every request, Supabase first
 *
 * Replaces the browser's direct POST to an external form service: that endpoint
 * had a monthly submission limit, so once it was used up every candidate saw
 * "Your request could not be sent", and the messages never reached the database
 * the rest of the app reads. Requests are now stored in `public.help_requests`
 * with the same never-block-the-user, queue-then-flush behaviour as feedback.
 */
export async function POST(req: Request) {
  const limited = checkRateLimit(`help:${getClientIp(req)}`, 10, 10 * 60 * 1000)
  if (!limited.allowed) {
    return NextResponse.json(
      { error: `Too many requests. Please try again in ${limited.retryAfterSec}s.` },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfterSec) } },
    )
  }

  let body: any = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 })
  }

  let client = getServerClient()
  if (isSupabaseConfigured()) {
    // The student id comes from the verified token only, never from the body: a
    // request that is not signed in is stored without a student, so it can never
    // be filed under someone else. The contact email the person typed is kept
    // (it is how we reply); a signed-in request uses the verified address.
    const who = await optionalStudent(req)
    body = { ...body, student_id: who.studentId || '', email: who.email || body.email }
    client = who.client || client
  }
  const result = await saveHelpSubmission(body, client)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  let help = { attempted: 0, synced: 0, failed: 0 }
  try {
    if (client) help = await flushQueuedHelpRequests(client)
  } catch (e: any) {
    console.warn('[help] queue flush failed:', e?.message || e)
  }

  return NextResponse.json({
    ok: true,
    request: result.request,
    supabase: result.stored === 'supabase',
    queued: result.stored === 'queue',
    stored: result.stored,
    reason: result.reason,
    flushed: help,
  })
}

/** Admin view of every help request (Supabase first, local queue merged in). */
export async function GET(req: Request) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const local = getAllHelpRequests()
    const client = getServerClient()
    let remote = client ? await fetchAllHelpRequests(client) : null
    const seen = new Set<string>()
    const merged = [...(remote || []), ...local].filter(row => {
      const key = String(row?.id || `${row?.created_at}|${row?.email}`)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    merged.sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
    return NextResponse.json({ requests: merged, supabase: !!remote, total: merged.length })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to load help requests.' }, { status: 500 })
  }
}
