export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getReportBySessionFull, listReportsForStudentFull } from '@/lib/interview/store.ts'
import { requireOwnedInterview } from '@/lib/interview/apiAuth.ts'

function json(data: any, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const owned = await requireOwnedInterview(req, params.id)
  if (!owned.ok) return owned.response

  try {
    const { session, auth } = owned
    const report = await getReportBySessionFull(session.id, auth.db)
    if (!report) {
      if (session.state !== 'REPORT_READY') {
        return json({ error: `Report not ready yet. Current state: ${session.state}`, state: session.state }, 202)
      }
      return json({ error: 'Report not found' }, 404)
    }

    // Use the verified identity rather than any caller-supplied student id.
    const allReports = await listReportsForStudentFull(auth.studentId, auth.db)
    allReports.sort((a, b) => new Date(a.completed_at).getTime() - new Date(b.completed_at).getTime())

    return json({
      report,
      trend: allReports.map((r) => ({
        attempt_number: r.attempt_number,
        overall_score: r.overall_score,
        band: r.band,
        date: r.completed_at,
        track: r.track,
        mode: r.mode,
      })),
    })
  } catch (error) {
    console.error('[api/interviews/report] failed', error)
    return json({ error: 'Interview report storage is temporarily unavailable. Please retry.' }, 503)
  }
}
