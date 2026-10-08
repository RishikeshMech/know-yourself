import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { saveAssessmentResult, saveAssessmentSession, getAssessmentSession, flushDB, type AssessmentSession } from '@/lib/db'
import { resolveStudentAccess } from '@/lib/studentAuth'
import { readAssessmentSession, submitAssessmentAttempt, toUuid, type PersistOutcome } from '@/lib/persist'

const GRADES = ['S', 'A', 'B', 'C', 'D'] as const

/** The grade the scoring rules give a total (used when the payload's grade is unusable). */
function gradeFor(total: number): string {
  return total >= 900 ? 'S' : total >= 750 ? 'A' : total >= 600 ? 'B' : total >= 400 ? 'C' : 'D'
}

/**
 * Final submit. ONE database transaction stores the session as submitted AND its
 * result — or neither. Retrying the same submit returns the stored result.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const who = await resolveStudentAccess(req, body.student_id || body.user_id)
    if (!who.ok) return NextResponse.json({ error: who.error }, { status: who.status })

    const sessionId = toUuid(String(body.session_id || '').trim(), 'session')
    if (!sessionId) return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })
    const assessmentNo = Number(body.assessment_no ?? body.scores?.assessment_no ?? 1) === 2 ? 2 : 1
    const scores = { ...(body.scores || {}), assessment_no: assessmentNo }
    const total = Math.round(Number(body.total ?? body.scores?.total) || 0)
    const rawGrade = String(body.grade || body.scores?.grade || '').trim()
    const grade = (GRADES as readonly string[]).includes(rawGrade) ? rawGrade : gradeFor(total)
    const percentile = body.percentile != null && body.percentile !== '' ? Number(body.percentile) : null
    const expired = body.status === 'expired' || body.auto_submitted === true || body.scores?.auto_submitted === true
    const submittedAt = body.submitted_at || new Date().toISOString()

    if (who.mode === 'supabase') {
      const read = await readAssessmentSession(who.client, sessionId)
      if (read.error) return NextResponse.json({ error: 'Could not save your results yet — please retry.', retryable: true }, { status: 503 })
      const existing = read.session
      if (existing && existing.student_id !== who.studentId) {
        return NextResponse.json({ error: 'This attempt belongs to a different account.' }, { status: 403 })
      }
      // Keep what the attempt already has when the browser does not resend it.
      const outcome = await submitAssessmentAttempt(who.client, {
        id: sessionId,
        studentId: who.studentId,
        assessmentNo,
        answers: body.answers ?? existing?.answers ?? {},
        tabSwitches: Number(body.tab_switches ?? existing?.tab_switches ?? 0) || 0,
        expired,
        submittedAt,
        startedAt: existing?.started_at ?? null,
        expiresAt: existing?.expires_at ?? null,
        durationSec: existing?.duration_sec ?? 7200,
        questionSeed: existing?.question_seed ?? null,
        scores,
        total,
        grade,
        percentile,
        verifiableHash: body.verifiable_hash ? String(body.verifiable_hash) : null,
        aiFeedback: body.ai_feedback || {},
      })
      if (!outcome.ok) return submitFailure(outcome)
      return NextResponse.json({ result: outcome.data, saved: true, supabase: true, stored: 'supabase' })
    }

    // Local demo store.
    const session: AssessmentSession = getAssessmentSession(String(body.session_id || '')) || {
      id: sessionId,
      student_id: who.studentId,
      status: 'submitted',
      started_at: body.started_at || new Date().toISOString(),
      expires_at: body.expires_at || new Date(Date.now() + 7200 * 1000).toISOString(),
      duration_sec: 7200,
      answers: body.answers || {},
      submitted_at: submittedAt,
      tab_switches: body.tab_switches || 0,
      question_seed: body.question_seed,
      assessment_no: assessmentNo,
      created_at: new Date().toISOString(),
    }
    session.id = sessionId
    session.status = expired ? 'expired' : 'submitted'
    session.submitted_at = submittedAt
    session.assessment_no = assessmentNo
    if (body.answers) session.answers = body.answers
    saveAssessmentSession(session)
    const result = {
      id: 'res_' + randomUUID().slice(0, 8),
      session_id: sessionId,
      student_id: who.studentId,
      scores,
      total,
      grade,
      percentile: percentile ?? 0,
      verifiable_hash: body.verifiable_hash || '',
      ai_feedback: body.ai_feedback || {},
      assessment_no: assessmentNo,
      created_at: new Date().toISOString(),
    }
    saveAssessmentResult(result as any)
    await flushDB()
    return NextResponse.json({ result, saved: true, supabase: false, stored: 'local' })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to submit assessment' }, { status: 500 })
  }
}

/** What the candidate is told when the final write did not land (nothing is marked submitted). */
function submitFailure(outcome: PersistOutcome) {
  if (outcome.code === '23505') {
    return NextResponse.json({ error: 'This assessment was already submitted.' }, { status: 409 })
  }
  if (outcome.code === '42501') {
    return NextResponse.json({ error: 'This attempt belongs to a different account.' }, { status: 403 })
  }
  return NextResponse.json(
    { error: 'We could not save your results yet — please retry. Nothing has been lost.', retryable: true },
    { status: 503 },
  )
}
