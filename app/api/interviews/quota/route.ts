export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getQuotaForStudentFull } from '@/lib/interview/store.ts'
import { getServerClient } from '@/lib/supabaseServer.ts'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const studentId = url.searchParams.get('student_id')
  if (!studentId) {
    return NextResponse.json({ error: 'student_id required' }, { status: 400 })
  }
  const sb = getServerClient()
  const quota = await getQuotaForStudentFull(studentId, sb)
  return NextResponse.json({
    used: quota.used,
    remaining: quota.remaining,
    max: quota.max,
    sessions: quota.sessions.map(s => ({
      id: s.id,
      attempt_number: s.attempt_number,
      track: s.track,
      mode: s.mode,
      state: s.state,
      created_at: s.created_at,
    })),
    reports: quota.reports.map(r => ({
      id: r.id,
      session_id: r.session_id,
      attempt_number: r.attempt_number,
      overall_score: r.overall_score,
      band: r.band,
      track: r.track,
      mode: r.mode,
      created_at: r.created_at,
    })),
    trend: quota.reports
      .sort((a, b) => new Date(a.completed_at).getTime() - new Date(b.completed_at).getTime())
      .map(r => ({ attempt: r.attempt_number, score: r.overall_score, date: r.completed_at })),
  })
}
