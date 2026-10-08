import { NextResponse } from 'next/server'
import { getResumeAnalysisByStudent, saveResumeAnalysis } from '@/lib/db'
import { persistResumeOutcome, readLatestResume } from '@/lib/persist'
import { resolveStudentAccess } from '@/lib/studentAuth'

/** The student's latest resume analysis (Supabase when configured, else the demo store). */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const studentId = url.searchParams.get('student_id') || ''
    if (!studentId) return NextResponse.json({ error: 'Missing student_id' }, { status: 400 })
    const who = await resolveStudentAccess(req, studentId)
    if (!who.ok) return NextResponse.json({ error: who.error }, { status: who.status })
    if (who.mode === 'supabase') {
      const { analysis, error } = await readLatestResume(who.client, who.studentId)
      if (error) return NextResponse.json({ error: 'Could not load your resume analysis right now — please retry.' }, { status: 503 })
      return NextResponse.json({ analysis, supabase: true })
    }
    return NextResponse.json({ analysis: getResumeAnalysisByStudent(who.studentId) })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to fetch resume' }, { status: 500 })
  }
}

/** Stores an analysis for the signed-in student (the upload flow uses /resume/analyze). */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const who = await resolveStudentAccess(req, body.student_id || body.user_id)
    if (!who.ok) return NextResponse.json({ error: who.error }, { status: who.status })
    const analysis = {
      id: body.id || 'res_' + Date.now(),
      student_id: who.studentId,
      storage_key: body.storage_key || '',
      resume_score: body.resume_score || 0,
      parsed: body.parsed || {},
      feedback: body.feedback || {},
      created_at: new Date().toISOString(),
    }
    if (who.mode === 'supabase') {
      const outcome = await persistResumeOutcome(who.client, analysis)
      if (!outcome.ok) return NextResponse.json({ error: 'Could not save your resume analysis — please try again.' }, { status: 503 })
      return NextResponse.json({ analysis, saved: true, supabase: true })
    }
    saveResumeAnalysis(analysis as any)
    return NextResponse.json({ analysis, saved: true, supabase: false })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to save resume' }, { status: 500 })
  }
}
