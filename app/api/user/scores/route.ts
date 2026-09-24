import { NextResponse } from 'next/server'
import { getLatestAssessmentResultForStudent } from '@/lib/db'
import { getServerClient } from '@/lib/supabaseServer'
import { fetchLatestAssessmentResult } from '@/lib/persist'

/** `?assessment=1|2` — 1 = CalibiAI assessment (default), 2 = Capgemini mock. */
function assessmentParam(url: URL): number {
  const n = Number(url.searchParams.get('assessment') || 1)
  return n === 2 ? 2 : 1
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const studentId = url.searchParams.get('student_id') || ''
    if (!studentId) return NextResponse.json({ error: 'Missing student_id' }, { status: 400 })
    const assessmentNo = assessmentParam(url)
    // The local JSON store is per-instance (lost on serverless restarts); when
    // Supabase is configured, Postgres is the source of truth for results.
    const sb = getServerClient()
    if (sb) {
      const result = await fetchLatestAssessmentResult(sb, studentId, assessmentNo)
      if (result) return NextResponse.json({ result, assessment_no: assessmentNo, supabase: true })
    }
    const result = getLatestAssessmentResultForStudent(studentId, assessmentNo)
    return NextResponse.json({ result, assessment_no: assessmentNo })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to fetch scores' }, { status: 500 })
  }
}
