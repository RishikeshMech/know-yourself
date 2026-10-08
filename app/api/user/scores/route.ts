import { NextResponse } from 'next/server'
import { getLatestAssessmentResultForStudent } from '@/lib/db'
import { readLatestResult } from '@/lib/persist'
import { resolveStudentAccess } from '@/lib/studentAuth'

/** `?assessment=1|2` — 1 = CalibiAI assessment (default), 2 = Capgemini mock. */
function assessmentParam(url: URL): number {
  const n = Number(url.searchParams.get('assessment') || 1)
  return n === 2 ? 2 : 1
}

/**
 * The signed-in student's latest result. When Supabase is configured it is the
 * only source: a result that is not in Postgres is not shown as saved.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const studentId = url.searchParams.get('student_id') || ''
    if (!studentId) return NextResponse.json({ error: 'Missing student_id' }, { status: 400 })
    const who = await resolveStudentAccess(req, studentId)
    if (!who.ok) return NextResponse.json({ error: who.error }, { status: who.status })
    const assessmentNo = assessmentParam(url)
    if (who.mode === 'supabase') {
      const { result, error } = await readLatestResult(who.client, who.studentId, assessmentNo)
      if (error) return NextResponse.json({ error: 'Could not load your results right now — please retry.' }, { status: 503 })
      return NextResponse.json({ result, assessment_no: assessmentNo, supabase: true })
    }
    return NextResponse.json({ result: getLatestAssessmentResultForStudent(who.studentId, assessmentNo), assessment_no: assessmentNo })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to fetch scores' }, { status: 500 })
  }
}
