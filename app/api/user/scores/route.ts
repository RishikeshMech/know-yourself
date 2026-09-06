import { NextResponse } from 'next/server'
import { getLatestAssessmentResultForStudent } from '@/lib/db'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const studentId = url.searchParams.get('student_id') || ''
    if (!studentId) return NextResponse.json({ error: 'Missing student_id' }, { status: 400 })
    const result = getLatestAssessmentResultForStudent(studentId)
    return NextResponse.json({ result })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to fetch scores' }, { status: 500 })
  }
}
