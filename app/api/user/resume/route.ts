import { NextResponse } from 'next/server'
import { getResumeAnalysisByStudent, saveResumeAnalysis } from '@/lib/db'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const studentId = url.searchParams.get('student_id') || ''
    if (!studentId) return NextResponse.json({ error: 'Missing student_id' }, { status: 400 })
    const analysis = getResumeAnalysisByStudent(studentId)
    return NextResponse.json({ analysis })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to fetch resume' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const analysis = {
      id: body.id || 'res_' + Date.now(),
      student_id: body.student_id || body.user_id,
      storage_key: body.storage_key || '',
      resume_score: body.resume_score || 0,
      parsed: body.parsed || {},
      feedback: body.feedback || {},
      created_at: new Date().toISOString(),
    }
    saveResumeAnalysis(analysis)
    return NextResponse.json({ analysis, saved: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to save resume' }, { status: 500 })
  }
}
