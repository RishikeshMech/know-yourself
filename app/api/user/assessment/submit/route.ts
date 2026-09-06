import { NextResponse } from 'next/server'
import { saveAssessmentResult, saveAssessmentSession, getAssessmentSession } from '@/lib/db'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const result = {
      id: body.id || 'res_' + Math.random().toString(16).slice(2, 10),
      session_id: body.session_id,
      student_id: body.student_id || body.user_id,
      scores: body.scores || {},
      total: body.total || 0,
      grade: body.grade || 'D',
      percentile: body.percentile || 0,
      verifiable_hash: body.verifiable_hash || '',
      ai_feedback: body.ai_feedback || {},
      created_at: new Date().toISOString(),
    }
    saveAssessmentResult(result)
    const s = getAssessmentSession(body.session_id || '')
    if (s) {
      s.status = 'submitted'
      s.submitted_at = new Date().toISOString()
      saveAssessmentSession(s)
    }
    return NextResponse.json({ result, saved: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to submit assessment' }, { status: 500 })
  }
}
