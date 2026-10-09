import { NextResponse } from 'next/server'
import { saveAssessmentResult, saveAssessmentSession, getAssessmentSession, flushDB, type AssessmentSession } from '@/lib/db'
import { fetchAssessmentSession, persistAssessmentSubmission, toUuid } from '@/lib/persist'
import { requireStudentApi } from '@/lib/studentApi'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function persistenceFailed() {
  return NextResponse.json(
    { error: 'Your assessment could not be committed to Supabase. Your answers remain on this device; please retry submission.' },
    { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '10' } },
  )
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const rawSessionId = String(body.session_id || '').trim()
    const sessionId = toUuid(rawSessionId, 'session') || rawSessionId
    if (!sessionId) return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })

    const ctx = await requireStudentApi(req, body.student_id || body.user_id || body.result?.student_id)
    if (!ctx.ok) return ctx.response

    const scores = body.scores && typeof body.scores === 'object' && !Array.isArray(body.scores)
      ? body.scores
      : null
    if (!scores) return NextResponse.json({ error: 'Missing assessment scores' }, { status: 400 })

    const now = new Date().toISOString()
    const answers = body.answers && typeof body.answers === 'object' ? body.answers : undefined
    const tabSwitches = Math.max(0, Number(body.tab_switches) || 0)
    const finalStatus = body.auto_submitted || body.status === 'expired' ? 'expired' : 'submitted'

    if (ctx.supabase) {
      const current = await fetchAssessmentSession(ctx.db!, sessionId)
      if (!current || current.student_id !== ctx.studentId) {
        return NextResponse.json({ error: 'Assessment session not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } })
      }
      const assessmentNo = Number(current.assessment_no || current.answers?.__assessment_no || 1) === 2 ? 2 : 1
      if (body.assessment_no != null && Number(body.assessment_no) !== assessmentNo) {
        return NextResponse.json({ error: 'Assessment number does not match this session.' }, { status: 409, headers: { 'Cache-Control': 'no-store' } })
      }
      if (current.status !== 'in_progress' && current.status !== 'submitted' && current.status !== 'expired') {
        return NextResponse.json({ error: 'This assessment cannot be submitted.' }, { status: 409, headers: { 'Cache-Control': 'no-store' } })
      }

      const session: AssessmentSession & { auto_submitted?: boolean } = {
        ...current,
        id: sessionId,
        student_id: ctx.studentId,
        status: finalStatus,
        assessment_no: assessmentNo,
        answers: answers || current.answers || {},
        submitted_at: body.submitted_at || now,
        tab_switches: Math.max(Number(current.tab_switches) || 0, tabSwitches),
      }
      const result = {
        id: toUuid(`assessment-result:${sessionId}`, 'result'),
        session_id: sessionId,
        student_id: ctx.studentId,
        scores,
        total: Number(body.total ?? scores.total) || 0,
        grade: body.grade || scores.grade || 'D',
        percentile: Number(body.percentile ?? scores.percentile) || 0,
        verifiable_hash: body.verifiable_hash || scores.verifiable_hash || '',
        ai_feedback: body.ai_feedback || {},
        assessment_no: assessmentNo,
        created_at: now,
      }

      const outcome = await persistAssessmentSubmission(ctx.db!, session, result)
      if (!outcome.ok || !outcome.result) return persistenceFailed()
      return NextResponse.json(
        { result: outcome.result, saved: true, supabase: true },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }

    const current = getAssessmentSession(sessionId) || getAssessmentSession(rawSessionId)
    if (!current || current.student_id !== ctx.studentId) {
      return NextResponse.json({ error: 'Assessment session not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } })
    }
    const assessmentNo = Number(current.assessment_no || body.assessment_no || 1) === 2 ? 2 : 1
    const session: AssessmentSession = {
      ...current,
      id: sessionId,
      status: finalStatus,
      submitted_at: body.submitted_at || now,
      answers: answers || current.answers || {},
      tab_switches: Math.max(Number(current.tab_switches) || 0, tabSwitches),
      assessment_no: assessmentNo,
    }
    const result = {
      id: toUuid(`assessment-result:${sessionId}`, 'result') || 'res_' + Math.random().toString(16).slice(2, 10),
      session_id: sessionId,
      student_id: ctx.studentId,
      scores,
      total: Number(body.total ?? scores.total) || 0,
      grade: body.grade || scores.grade || 'D',
      percentile: Number(body.percentile ?? scores.percentile) || 0,
      verifiable_hash: body.verifiable_hash || scores.verifiable_hash || '',
      ai_feedback: body.ai_feedback || {},
      assessment_no: assessmentNo,
      created_at: now,
    }
    saveAssessmentSession(session)
    saveAssessmentResult(result)
    await flushDB()
    return NextResponse.json({ result, saved: true, supabase: false })
  } catch (e: any) {
    console.error('[api/user/assessment/submit] failed:', e?.message || e)
    return persistenceFailed()
  }
}
