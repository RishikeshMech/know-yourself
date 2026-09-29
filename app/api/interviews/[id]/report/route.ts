export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getInterviewSessionFull, getReportBySessionFull, listReportsForStudentFull } from '@/lib/interview/store.ts'
import { getServerClient } from '@/lib/supabaseServer.ts'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const sb = getServerClient()

  // Try as session_id first, then as report_id via fetching all
  let report = await getReportBySessionFull(params.id, sb)

  if (!report) {
    // Fallback: search by report id in student's reports (needs extra fetch)
    // For simplicity, try to load session then get its report
    const session = await getInterviewSessionFull(params.id, sb)
    if (session) {
      if (session.report_id) {
        report = await getReportBySessionFull(session.id, sb)
      }
      if (!report && session.state !== 'REPORT_READY') {
        return NextResponse.json({ error: `Report not ready yet. Current state: ${session.state}`, state: session.state }, { status: 202 })
      }
    }
    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }
  }

  const allReports = await listReportsForStudentFull(report.student_id, sb)
  allReports.sort((a, b) => new Date(a.completed_at).getTime() - new Date(b.completed_at).getTime())

  return NextResponse.json({
    report,
    trend: allReports.map(r => ({
      attempt_number: r.attempt_number,
      overall_score: r.overall_score,
      band: r.band,
      date: r.completed_at,
      track: r.track,
      mode: r.mode,
    })),
  })
}
