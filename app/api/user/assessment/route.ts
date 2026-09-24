import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { saveAssessmentSession, getAssessmentSession, type AssessmentSession } from '@/lib/db'
import { getServerClient } from '@/lib/supabaseServer'
import { fetchAssessmentSession, persistAssessmentSession, toUuid } from '@/lib/persist'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const sessionId = url.searchParams.get('session_id') || ''
    if (!sessionId) return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })
    const sb = getServerClient()
    if (sb) {
      const data = await fetchAssessmentSession(sb, sessionId)
      if (data) return NextResponse.json({ session: data, supabase: true })
    }
    const session = getAssessmentSession(sessionId)
    return NextResponse.json({ session })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to fetch assessment' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const originalId = (body.session_id || '').toString()
    // The session may only exist in Supabase (fresh serverless instance), so
    // fall back to reading it there before deciding to create a new row.
    const sb = getServerClient()
    let session = getAssessmentSession(originalId)
    if (!session && sb) {
      const remote = originalId ? await fetchAssessmentSession(sb, toUuid(originalId, 'session') || originalId) : null
      if (remote) session = remote as any
    }
    const assessmentNo = Number(body.assessment_no) === 2 ? 2 : 1
    if (!session) {
      // Never lose a progress save: create a minimal row (server generates the uuid).
      const durationSec = Number(body.duration_sec) || (assessmentNo === 2 ? 5400 : 7200)
      session = {
        id: toUuid(originalId, 'session') || randomUUID(),
        student_id: body.student_id || body.user_id || '',
        status: body.status || 'in_progress',
        started_at: body.started_at || new Date().toISOString(),
        expires_at: body.expires_at || new Date(Date.now() + durationSec * 1000).toISOString(),
        duration_sec: durationSec,
        answers: body.answers || {},
        submitted_at: body.submitted_at || null,
        tab_switches: body.tab_switches || 0,
        question_seed: body.question_seed,
        assessment_no: assessmentNo,
        created_at: new Date().toISOString(),
      }
    }
    // Keep the marker on pre-existing rows too (legacy rows default to 1).
    if (body.assessment_no !== undefined) session.assessment_no = assessmentNo
    session.answers = body.answers || session.answers || {}
    session.status = body.status || session.status || 'in_progress'
    if (body.submitted_at) session.submitted_at = body.submitted_at
    if (body.tab_switches !== undefined) session.tab_switches = body.tab_switches
    saveAssessmentSession(session)
    let supabase = false
    if (sb) supabase = await persistAssessmentSession(sb, session)
    // Autosave requests already carry the latest answers from the browser. Do
    // not echo that growing JSONB blob back on every checkpoint; the old echo
    // multiplied answer payload bytes across all candidates and made the API
    // unnecessarily chatty. A caller that needs answers uses GET explicitly.
    const acknowledged = { ...session }
    delete (acknowledged as any).answers
    return NextResponse.json({ session: acknowledged, saved: true, supabase })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to save assessment' }, { status: 500 })
  }
}
