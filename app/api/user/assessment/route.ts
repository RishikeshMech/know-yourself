import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { getAssessmentSession, saveAssessmentSession, type AssessmentSession } from '@/lib/db'
import { isSupabaseConfigured } from '@/lib/supabase'
import { resolveStudentAccess } from '@/lib/studentAuth'
import { readAssessmentSession, saveAssessmentProgress, toUuid, type PersistOutcome } from '@/lib/persist'

const FINAL = new Set(['submitted', 'expired'])

/** Session columns the candidate's browser needs (never the answers blob). */
function publicSession(row: any) {
  if (!row) return null
  const { answers: _answers, ...rest } = row
  return rest
}

/** A failed autosave is retried by the browser; the answers stay on the device meanwhile. */
function progressFailure(outcome: PersistOutcome) {
  if (outcome.code === '42501') return NextResponse.json({ error: 'This attempt belongs to a different account.' }, { status: 403 })
  if (outcome.code === 'P0001') return NextResponse.json({ error: 'This attempt is already finished.' }, { status: 409 })
  return NextResponse.json(
    { error: 'Could not save your answers right now — they are kept on this device and will be retried.', retryable: true },
    { status: 503 },
  )
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const sessionId = url.searchParams.get('session_id') || ''
    if (!sessionId) return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })
    const who = await resolveStudentAccess(req, url.searchParams.get('student_id'))
    if (!who.ok) return NextResponse.json({ error: who.error }, { status: who.status })
    if (who.mode === 'supabase') {
      const { session, error } = await readAssessmentSession(who.client, toUuid(sessionId, 'session') || sessionId)
      if (error) return NextResponse.json({ error: 'Could not load your attempt right now — please retry.' }, { status: 503 })
      if (!session) return NextResponse.json({ error: 'Attempt not found.' }, { status: 404 })
      return NextResponse.json({ session, supabase: true })
    }
    return NextResponse.json({ session: getAssessmentSession(sessionId) })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to fetch assessment' }, { status: 500 })
  }
}

/**
 * Autosave of progress while the attempt is open. It can never reopen or rewrite a
 * finished attempt: the final answers are sent with /api/user/assessment/submit.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const who = await resolveStudentAccess(req, body.student_id || body.user_id)
    if (!who.ok) return NextResponse.json({ error: who.error }, { status: who.status })
    const status = String(body.status || 'in_progress')
    if (FINAL.has(status)) {
      return NextResponse.json({ error: 'Final answers are sent with /api/user/assessment/submit.' }, { status: 409 })
    }
    const assessmentNo = Number(body.assessment_no) === 2 ? 2 : 1

    if (who.mode === 'supabase') {
      const sessionId = toUuid(String(body.session_id || '').trim(), 'session')
      if (!sessionId) return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })
      const outcome = await saveAssessmentProgress(who.client, {
        id: sessionId,
        studentId: who.studentId,
        assessmentNo,
        answers: body.answers || {},
        tabSwitches: Number(body.tab_switches) || 0,
        startedAt: body.started_at ?? null,
        expiresAt: body.expires_at ?? null,
        durationSec: Number(body.duration_sec) || 7200,
        questionSeed: body.question_seed != null ? Number(body.question_seed) : null,
      })
      if (!outcome.ok) return progressFailure(outcome)
      return NextResponse.json({ session: publicSession(outcome.data), saved: true, supabase: true, stored: 'supabase' })
    }

    // Local demo store.
    const sessionIdRaw = String(body.session_id || '').trim()
    const session: AssessmentSession = getAssessmentSession(sessionIdRaw) || {
      id: toUuid(sessionIdRaw, 'session') || randomUUID(),
      student_id: who.studentId,
      status: 'in_progress',
      started_at: body.started_at || new Date().toISOString(),
      expires_at: body.expires_at || new Date(Date.now() + 7200 * 1000).toISOString(),
      duration_sec: Number(body.duration_sec) || 7200,
      answers: {},
      tab_switches: 0,
      assessment_no: assessmentNo,
      created_at: new Date().toISOString(),
    }
    if (FINAL.has(session.status)) {
      return NextResponse.json({ session: publicSession(session), saved: false, supabase: false, stored: 'local' })
    }
    session.answers = body.answers || session.answers || {}
    session.status = 'in_progress'
    session.assessment_no = assessmentNo
    if (body.tab_switches !== undefined) session.tab_switches = body.tab_switches
    saveAssessmentSession(session)
    return NextResponse.json({ session: publicSession(session), saved: true, supabase: isSupabaseConfigured(), stored: 'local' })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to save assessment' }, { status: 500 })
  }
}
