import { NextResponse } from 'next/server'
import { saveAssessmentSession, getActiveSessionForStudent, getAssessmentSession } from '@/lib/db'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const sessionId = url.searchParams.get('session_id') || ''
    const studentId = url.searchParams.get('student_id') || ''
    if (sessionId) {
      const session = getAssessmentSession(sessionId)
      return NextResponse.json({ session })
    }
    if (studentId) {
      const session = getActiveSessionForStudent(studentId)
      return NextResponse.json({ session })
    }
    return NextResponse.json({ session: null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to fetch session' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const session = {
      id: body.id || 'sess_' + Math.random().toString(16).slice(2, 10),
      student_id: body.student_id || body.user_id || '',
      status: body.status || 'in_progress',
      started_at: body.started_at || new Date().toISOString(),
      expires_at: body.expires_at || new Date(Date.now() + 7200 * 1000).toISOString(),
      duration_sec: body.duration_sec || 7200,
      answers: body.answers || {},
      submitted_at: body.submitted_at || null,
      tab_switches: body.tab_switches || 0,
      created_at: new Date().toISOString(),
    }
    saveAssessmentSession(session)
    return NextResponse.json({ session })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to save session' }, { status: 500 })
  }
}
