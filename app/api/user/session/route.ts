import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { saveAssessmentSession, getActiveSessionForStudent, getAssessmentSession, flushDB, type AssessmentSession } from '@/lib/db'
import { fetchActiveAssessmentSession, fetchAssessmentSession, persistAssessmentSession, toUuid } from '@/lib/persist'
import { requireStudentApi } from '@/lib/studentApi'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 1 = CalibiAI assessment (default), 2 = Capgemini 2027 mock. */
function normalizeAssessmentNo(v: any): number {
  return Number(v) === 2 ? 2 : 1
}

function publicSession(row: any) {
  if (!row) return null
  const session = { ...row }
  if (session.answers && typeof session.answers === 'object') {
    session.answers = { ...session.answers }
    delete session.answers.__assessment_no
  }
  return session
}

function storageUnavailable() {
  return NextResponse.json(
    { error: 'We could not securely save your assessment session. Please retry; your test has not started.' },
    { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '10' } },
  )
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const sessionId = url.searchParams.get('session_id') || ''
    const claimedStudentId = url.searchParams.get('student_id') || ''
    const assessmentNo = normalizeAssessmentNo(url.searchParams.get('assessment'))
    const ctx = await requireStudentApi(req, claimedStudentId)
    if (!ctx.ok) return ctx.response

    if (ctx.supabase) {
      const data = sessionId
        ? await fetchAssessmentSession(ctx.db!, toUuid(sessionId, 'session') || sessionId)
        : await fetchActiveAssessmentSession(ctx.db!, ctx.studentId, assessmentNo)
      if (!data || data.student_id !== ctx.studentId) {
        return NextResponse.json({ session: null, supabase: true }, { headers: { 'Cache-Control': 'no-store' } })
      }
      return NextResponse.json({ session: publicSession(data), supabase: true }, { headers: { 'Cache-Control': 'no-store' } })
    }

    const local = sessionId
      ? getAssessmentSession(sessionId)
      : getActiveSessionForStudent(ctx.studentId, assessmentNo)
    const session = local?.student_id === ctx.studentId ? local : null
    return NextResponse.json({ session: publicSession(session), supabase: false }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    console.error('[api/user/session] GET failed:', e?.message || e)
    return NextResponse.json({ error: 'Could not load the assessment session.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const ctx = await requireStudentApi(req, body.student_id || body.user_id)
    if (!ctx.ok) return ctx.response

    const id = toUuid(body.id, 'session') || toUuid(body.session_id, 'session') || randomUUID()
    const assessmentNo = normalizeAssessmentNo(body.assessment_no)
    // The platform attempts are 120 minutes; clients cannot extend the server deadline.
    const durationSec = 7200
    const now = new Date()
    const session: AssessmentSession = {
      id,
      student_id: ctx.studentId,
      status: 'in_progress',
      started_at: now.toISOString(),
      expires_at: new Date(now.getTime() + durationSec * 1000).toISOString(),
      duration_sec: durationSec,
      answers: {},
      submitted_at: undefined,
      tab_switches: 0,
      question_seed: Number(body.question_seed) || Math.floor(Math.random() * 1_000_000_000),
      assessment_no: assessmentNo,
      created_at: now.toISOString(),
    }

    if (ctx.supabase) {
      const outcome = await persistAssessmentSession(ctx.db!, session, { start: true })
      if (!outcome.ok || !outcome.session) return storageUnavailable()
      return NextResponse.json(
        { session: publicSession(outcome.session), saved: true, supabase: true },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    }

    saveAssessmentSession(session)
    await flushDB()
    return NextResponse.json({ session: publicSession(session), saved: true, supabase: false })
  } catch (e: any) {
    console.error('[api/user/session] POST failed:', e?.message || e)
    return NextResponse.json({ error: 'Could not securely save the assessment session.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
