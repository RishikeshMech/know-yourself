import { NextResponse } from 'next/server'
import { getAssessmentSession, saveAssessmentSession } from '@/lib/db'
import { fetchAssessmentSession, persistAssessmentSession, toUuid } from '@/lib/persist'
import { requireStudentApi } from '@/lib/studentApi'
import type { AssessmentSession } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function unavailable() {
  return NextResponse.json(
    { error: 'Assessment progress could not be saved to Supabase. Your device copy is intact; please retry.' },
    { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '10' } },
  )
}

function publicSession(session: any) {
  if (!session) return null
  const copy = { ...session }
  delete copy.answers
  return copy
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const sessionId = url.searchParams.get('session_id') || ''
    const ctx = await requireStudentApi(req, url.searchParams.get('student_id'))
    if (!ctx.ok) return ctx.response
    if (!sessionId) return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })

    const sessionIdDb = toUuid(sessionId, 'session') || sessionId
    if (ctx.supabase) {
      const session = await fetchAssessmentSession(ctx.db!, sessionIdDb)
      if (!session || session.student_id !== ctx.studentId) {
        return NextResponse.json({ error: 'Assessment session not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } })
      }
      return NextResponse.json({ session, supabase: true }, { headers: { 'Cache-Control': 'no-store' } })
    }

    const session = getAssessmentSession(sessionIdDb) || getAssessmentSession(sessionId)
    if (!session || session.student_id !== ctx.studentId) {
      return NextResponse.json({ error: 'Assessment session not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } })
    }
    return NextResponse.json({ session, supabase: false }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    console.error('[api/user/assessment] GET failed:', e?.message || e)
    return NextResponse.json({ error: 'Could not load assessment progress.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const ctx = await requireStudentApi(req, body.student_id || body.user_id)
    if (!ctx.ok) return ctx.response

    const rawId = String(body.session_id || body.id || '').trim()
    const sessionId = toUuid(rawId, 'session') || rawId
    if (!sessionId) return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })
    const assessmentNo = Number(body.assessment_no) === 2 ? 2 : 1
    const answers = body.answers && typeof body.answers === 'object' ? body.answers : {}
    const tabSwitches = Math.max(0, Number(body.tab_switches) || 0)

    if (ctx.supabase) {
      const current = await fetchAssessmentSession(ctx.db!, sessionId)
      if (!current || current.student_id !== ctx.studentId) {
        return NextResponse.json({ error: 'Assessment session not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } })
      }
      if (current.status !== 'in_progress') {
        return NextResponse.json({ error: 'This assessment is already closed.' }, { status: 409, headers: { 'Cache-Control': 'no-store' } })
      }
      if (Number(current.assessment_no || current.answers?.__assessment_no || 1) !== assessmentNo) {
        return NextResponse.json({ error: 'Assessment number does not match this session.' }, { status: 409, headers: { 'Cache-Control': 'no-store' } })
      }
      const outcome = await persistAssessmentSession(ctx.db!, {
        ...current,
        id: sessionId,
        student_id: ctx.studentId,
        assessment_no: assessmentNo,
        answers,
        tab_switches: tabSwitches,
      })
      if (!outcome.ok) return unavailable()
      return NextResponse.json({ session: publicSession(outcome.session), saved: true, supabase: true }, { headers: { 'Cache-Control': 'no-store' } })
    }

    const current = getAssessmentSession(sessionId) || getAssessmentSession(rawId)
    if (!current || current.student_id !== ctx.studentId) {
      return NextResponse.json({ error: 'Assessment session not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } })
    }
    if (current.status !== 'in_progress') {
      return NextResponse.json({ error: 'This assessment is already closed.' }, { status: 409, headers: { 'Cache-Control': 'no-store' } })
    }
    const session: AssessmentSession = {
      ...current,
      answers,
      tab_switches: Math.max(Number(current.tab_switches) || 0, tabSwitches),
      assessment_no: assessmentNo,
    }
    saveAssessmentSession(session)
    return NextResponse.json({ session: publicSession(session), saved: true, supabase: false })
  } catch (e: any) {
    console.error('[api/user/assessment] POST failed:', e?.message || e)
    return unavailable()
  }
}
