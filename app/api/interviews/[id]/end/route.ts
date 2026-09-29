export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getInterviewSessionFull, saveInterviewSession, listReportsForStudentFull, saveReport } from '@/lib/interview/store.ts'
import { generateInterviewReport } from '@/lib/interview/reportGenerator.ts'
import { getServerClient } from '@/lib/supabaseServer.ts'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const sb = getServerClient()
    const session = await getInterviewSessionFull(params.id, sb)
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

    if (['REPORT_READY', 'ABANDONED', 'TERMINATED'].includes(session.state)) {
      return NextResponse.json({ error: `Already ended in state ${session.state}` }, { status: 409 })
    }

    session.state = 'EVALUATING'
    session.ended_at = new Date().toISOString()
    if (session.started_at) {
      const elapsed = (new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 1000 - session.total_paused_sec
      session.duration_sec = Math.max(0, Math.round(elapsed))
    }

    await saveInterviewSession(session, sb)

    const previousReports = await listReportsForStudentFull(session.student_id, sb)
    const report = await generateInterviewReport({ session, previousReports })

    await saveReport(report, sb)

    session.state = 'REPORT_READY'
    session.report_id = report.id
    await saveInterviewSession(session, sb)

    return NextResponse.json({ report, session_state: session.state })
  } catch (e: any) {
    console.error('[api/interviews/end] failed', e)
    try {
      const sb = getServerClient()
      const session = await getInterviewSessionFull(params.id, sb)
      if (session) {
        session.state = 'EVALUATING'
        await saveInterviewSession(session, sb)
      }
    } catch {}
    return NextResponse.json({ error: 'Failed to end interview and generate report', detail: String(e?.message || e) }, { status: 500 })
  }
}
