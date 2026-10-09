import { NextResponse } from 'next/server'
import { getLatestAssessmentResultForStudent } from '@/lib/db'
import { fetchLatestAssessmentResult } from '@/lib/persist'
import { requireStudentApi } from '@/lib/studentApi'

export const dynamic = 'force-dynamic'

/** `?assessment=1|2` — 1 = CalibiAI assessment (default), 2 = Capgemini mock. */
function assessmentParam(url: URL): number {
  return Number(url.searchParams.get('assessment') || 1) === 2 ? 2 : 1
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const ctx = await requireStudentApi(req, url.searchParams.get('student_id'))
  if (!ctx.ok) return ctx.response
  const assessmentNo = assessmentParam(url)

  try {
    if (ctx.supabase) {
      // Supabase is the source of truth in configured mode. A missing result is
      // a valid empty state; a query error is not silently replaced with stale
      // per-instance JSON data.
      const result = await fetchLatestAssessmentResult(ctx.db!, ctx.studentId, assessmentNo)
      return NextResponse.json({ result, assessment_no: assessmentNo, supabase: true }, { headers: { 'Cache-Control': 'no-store' } })
    }
    const result = getLatestAssessmentResultForStudent(ctx.studentId, assessmentNo)
    return NextResponse.json({ result, assessment_no: assessmentNo, supabase: false }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    console.error('[api/user/scores] Supabase read failed:', e?.message || e)
    return NextResponse.json(
      { error: 'Assessment data is temporarily unavailable. Please retry.' },
      { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '10' } },
    )
  }
}
