export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createInterviewSession, getQuotaForStudentFull } from '@/lib/interview/store.ts'
import { redactPii } from '@/lib/interview/redaction.ts'
import { requireStudentApi } from '@/lib/studentApi.ts'

function json(data: any, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
}

/**
 * GET /api/interviews?student_id=...
 * List all interview sessions for a student.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const auth = await requireStudentApi(req, url.searchParams.get('student_id'))
  if (!auth.ok) return auth.response

  let quota
  try {
    quota = await getQuotaForStudentFull(auth.studentId, auth.db)
  } catch (error) {
    console.error('[api/interviews] GET failed', error)
    return json({ error: 'Interview storage is temporarily unavailable. Please retry.' }, 503)
  }
  return json({
    sessions: quota.sessions.map(s => ({
      id: s.id,
      attempt_number: s.attempt_number,
      track: s.track,
      year: s.year,
      mode: s.mode,
      state: s.state,
      overall_score: undefined,
      created_at: s.created_at,
      started_at: s.started_at,
      ended_at: s.ended_at,
      report_id: s.report_id,
    })),
    quota: { used: quota.used, remaining: quota.remaining, max: quota.max },
  })
}

/**
 * POST /api/interviews
 * Create a new interview session (schedule).
 * Body: { student_id, student_name, institution_id, track, year, mode, language_style, project_title, project_summary, tech_stack, scheduled_for }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { student_id, student_name, institution_id, track, year, mode, language_style, project_title, project_summary, tech_stack, scheduled_for } = body

    const auth = await requireStudentApi(req, student_id)
    if (!auth.ok) return auth.response
    if (!['swe', 'ai_ml'].includes(track)) return json({ error: 'Invalid track. Use swe or ai_ml' }, 400)
    if (![2, 3].includes(Number(year))) return json({ error: 'Invalid year. Use 2 or 3' }, 400)
    if (!['quick', 'standard', 'full'].includes(mode)) return json({ error: 'Invalid mode' }, 400)

    let project_context = null
    if (project_title || project_summary) {
      const rawText = `${project_title || ''} ${project_summary || ''}`.slice(0, 2000)
      const redacted = redactPii(rawText)
      project_context = {
        title: String(project_title || '').slice(0, 200),
        summary: String(project_summary || '').slice(0, 1000),
        tech_stack: Array.isArray(tech_stack) ? tech_stack.slice(0, 10).map(String) : [],
        redacted_text: redacted.redacted,
      }
    }

    const result = await createInterviewSession({
      student_id: auth.studentId,
      student_name: student_name ? String(student_name).slice(0, 100) : undefined,
      institution_id: institution_id ? String(institution_id).slice(0, 100) : undefined,
      track,
      year: Number(year) as 2 | 3,
      mode,
      language_style: language_style === 'hinglish' ? 'hinglish' : 'en',
      project_context,
      scheduled_for: scheduled_for ? String(scheduled_for) : null,
      supabase: auth.db,
    })

    if ('error' in result) {
      return json({ error: result.error, quota: result.quota }, 409)
    }

    return json({ session: result.session, quota: result.quota }, 201)
  } catch (e: any) {
    console.error('[api/interviews] POST failed', e)
    return json({ error: 'Could not create interview session. No successful save was confirmed; please retry.' }, 503)
  }
}
