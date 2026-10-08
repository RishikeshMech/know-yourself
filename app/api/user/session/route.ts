import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { saveAssessmentSession, getActiveSessionForStudent, getAssessmentSession, flushDB, type AssessmentSession } from '@/lib/db'
import { isSupabaseConfigured } from '@/lib/supabase'
import { resolveStudentAccess } from '@/lib/studentAuth'
import {
  readActiveAssessmentSession,
  readAssessmentSession,
  startAssessmentAttempt,
  toUuid,
} from '@/lib/persist'

/** 1 = CalibiAI assessment (default), 2 = Capgemini 2027 mock. */
function normalizeAssessmentNo(v: any): number {
  return Number(v) === 2 ? 2 : 1
}

/** Session columns the candidate's browser needs (never the answers blob). */
function publicSession(row: any) {
  if (!row) return null
  const { answers: _answers, ...rest } = row
  return rest
}

/**
 * The attempt in progress for the signed-in student — by session id, or the open
 * attempt for an assessment. Reads Supabase when it is configured.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const sessionId = url.searchParams.get('session_id') || ''
    const studentId = url.searchParams.get('student_id') || ''
    const assessmentNo = normalizeAssessmentNo(url.searchParams.get('assessment'))
    const who = await resolveStudentAccess(req, studentId || undefined)
    if (!who.ok) return NextResponse.json({ error: who.error }, { status: who.status })

    if (who.mode === 'supabase') {
      if (sessionId) {
        const { session, error } = await readAssessmentSession(who.client, toUuid(sessionId, 'session') || sessionId)
        if (error) return NextResponse.json({ error: 'Could not load your attempt right now — please retry.' }, { status: 503 })
        return NextResponse.json({ session: publicSession(session), supabase: true })
      }
      const { session, error } = await readActiveAssessmentSession(who.client, who.studentId, assessmentNo)
      if (error) return NextResponse.json({ error: 'Could not load your attempt right now — please retry.' }, { status: 503 })
      return NextResponse.json({ session: publicSession(session), supabase: true })
    }
    if (sessionId) return NextResponse.json({ session: getAssessmentSession(sessionId) })
    return NextResponse.json({ session: getActiveSessionForStudent(who.studentId, assessmentNo) })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to fetch session' }, { status: 500 })
  }
}

/**
 * Opens a new attempt. The previous open attempt of the SAME assessment is closed
 * in the same database transaction, so there is never a moment with two.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const who = await resolveStudentAccess(req, body.student_id || body.user_id)
    if (!who.ok) return NextResponse.json({ error: who.error }, { status: who.status })
    // Session ids are UUIDs everywhere. The browser's id (or none) is only a hint.
    const id = toUuid(body.id, 'session') || toUuid(body.session_id, 'session') || randomUUID()
    const assessmentNo = normalizeAssessmentNo(body.assessment_no)
    const durationSec = Number(body.duration_sec) || 7200
    const startedAt = body.started_at || new Date().toISOString()
    const expiresAt = body.expires_at || new Date(Date.parse(startedAt) + durationSec * 1000).toISOString()
    const questionSeed = Number(body.question_seed) || Math.floor(Date.now() / 1000)

    if (who.mode === 'supabase') {
      const outcome = await startAssessmentAttempt(who.client, {
        id, studentId: who.studentId, assessmentNo, startedAt, expiresAt, durationSec, questionSeed, answers: {},
      })
      if (!outcome.ok) {
        if (outcome.code === '23505') {
          return NextResponse.json({ error: 'You already have an attempt in progress for this assessment.' }, { status: 409 })
        }
        if (outcome.code === '42501') {
          return NextResponse.json({ error: 'Your session has expired — please sign in again.' }, { status: 401 })
        }
        return NextResponse.json({ error: 'We could not start your attempt right now — please try again.' }, { status: 503 })
      }
      return NextResponse.json({ session: publicSession(outcome.data), saved: true, supabase: true, stored: 'supabase' })
    }

    const session: AssessmentSession = {
      id,
      student_id: who.studentId,
      status: body.status || 'in_progress',
      started_at: startedAt,
      expires_at: expiresAt,
      duration_sec: durationSec,
      answers: body.answers || {},
      submitted_at: body.submitted_at || null,
      tab_switches: body.tab_switches || 0,
      question_seed: questionSeed,
      assessment_no: assessmentNo,
      created_at: body.created_at || new Date().toISOString(),
    }
    saveAssessmentSession(session)
    // The start of an attempt must be on disk before the candidate proceeds.
    await flushDB()
    return NextResponse.json({ session, saved: true, supabase: isSupabaseConfigured(), stored: 'local' })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to save session' }, { status: 500 })
  }
}
