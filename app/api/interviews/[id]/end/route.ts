export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { saveInterviewSession, listReportsForStudentFull, saveReport } from '@/lib/interview/store.ts'
import { generateInterviewReport } from '@/lib/interview/reportGenerator.ts'
import { requireOwnedInterview } from '@/lib/interview/apiAuth.ts'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const owned = await requireOwnedInterview(req, params.id)
    if (!owned.ok) return owned.response
    const { session, auth } = owned
    const sb = auth.db

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

    return NextResponse.json(
      { report, session_state: session.state },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (e: any) {
    console.error('[api/interviews/end] failed', e)
    return NextResponse.json(
      { error: 'Failed to end interview and persist the report. Please retry.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
