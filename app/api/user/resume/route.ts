import { NextResponse } from 'next/server'
import { getResumeAnalysisByStudent, saveResumeAnalysis, flushDB } from '@/lib/db'
import { fetchLatestResumeAnalysis, persistResumeAnalysis } from '@/lib/persist'
import { requireStudentApi } from '@/lib/studentApi'

export const dynamic = 'force-dynamic'

function unavailable() {
  return NextResponse.json({ error: 'Resume data could not be saved/read from Supabase. Please retry.' }, { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '10' } })
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const ctx = await requireStudentApi(req, url.searchParams.get('student_id'))
  if (!ctx.ok) return ctx.response
  try {
    const analysis = ctx.supabase
      ? await fetchLatestResumeAnalysis(ctx.db!, ctx.studentId)
      : getResumeAnalysisByStudent(ctx.studentId)
    return NextResponse.json({ analysis, supabase: ctx.supabase }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    console.error('[api/user/resume] GET failed:', e?.message || e)
    return unavailable()
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const ctx = await requireStudentApi(req, body.student_id || body.user_id)
    if (!ctx.ok) return ctx.response

    const analysis = {
      id: body.id || `resume:${ctx.studentId}:${Date.now()}`,
      student_id: ctx.studentId,
      storage_key: body.storage_key || '',
      resume_score: Number(body.resume_score) || 0,
      parsed: body.parsed || {},
      feedback: body.feedback || {},
      created_at: new Date().toISOString(),
    }
    if (ctx.supabase) {
      if (!(await persistResumeAnalysis(ctx.db!, analysis))) return unavailable()
    } else {
      saveResumeAnalysis(analysis)
      await flushDB()
    }
    return NextResponse.json({ analysis, saved: true, supabase: ctx.supabase }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    console.error('[api/user/resume] POST failed:', e?.message || e)
    return unavailable()
  }
}
