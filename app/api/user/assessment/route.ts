import { NextResponse } from 'next/server'
import { saveAssessmentSession, getAssessmentSession } from '@/lib/db'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const sessionId = url.searchParams.get('session_id') || ''
    if (!sessionId) return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })
    const session = getAssessmentSession(sessionId)
    return NextResponse.json({ session })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to fetch assessment' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const session = getAssessmentSession(body.session_id || '')
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    session.answers = body.answers || session.answers || {}
    session.status = body.status || session.status || 'in_progress'
    if (body.submitted_at) session.submitted_at = body.submitted_at
    if (body.tab_switches !== undefined) session.tab_switches = body.tab_switches
    saveAssessmentSession(session)
    return NextResponse.json({ session, saved: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to save assessment' }, { status: 500 })
  }
}
