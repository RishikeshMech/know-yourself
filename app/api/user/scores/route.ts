import { NextResponse } from 'next/server'
import {
  getLatestAssessmentResultForStudent,
  getActiveSessionForStudent,
  saveAssessmentSession,
  saveAssessmentResult,
  flushDB,
} from '@/lib/db'
import { fetchLatestAssessmentResult, persistAssessmentSubmission, toUuid } from '@/lib/persist'
import { requireStudentApi } from '@/lib/studentApi'
import { computeScores } from '@/lib/scoring'
import { computeScores2 } from '@/lib/scoring2'

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
      // Supabase is the source of truth in configured mode.
      let result = await fetchLatestAssessmentResult(ctx.db!, ctx.studentId, assessmentNo)

      // Auto-recovery: If no result exists in assessment_results, check if there is an
      // expired or submitted session in assessment_sessions that can be scored and persisted.
      if (!result) {
        const { data: sessions } = await ctx.db!
          .from('assessment_sessions')
          .select('*')
          .eq('student_id', ctx.studentId)
          .eq('assessment_no', assessmentNo)
          .order('started_at', { ascending: false })
          .limit(1)

        const session = sessions && sessions.length > 0 ? sessions[0] : null
        if (session) {
          const isExpired = session.status === 'expired' || (session.expires_at && new Date(session.expires_at).getTime() <= Date.now())
          const isSubmitted = session.status === 'submitted' || !!session.submitted_at
          if (isExpired || isSubmitted) {
            const answers = (session.answers && typeof session.answers === 'object') ? session.answers : {}
            const scores = assessmentNo === 2
              ? computeScores2(answers, {}, {})
              : computeScores(answers, {}, {})
            const now = new Date().toISOString()
            const finalSession = {
              ...session,
              status: isSubmitted ? 'submitted' : 'expired',
              submitted_at: session.submitted_at || session.expires_at || now,
            }
            const finalResult = {
              id: toUuid(`assessment-result:${session.id}`, 'result'),
              session_id: session.id,
              student_id: ctx.studentId,
              scores,
              total: Number(scores.total) || 0,
              grade: scores.grade || 'D',
              percentile: Number(scores.percentile) || 0,
              verifiable_hash: scores.verifiable_hash || '',
              ai_feedback: {},
              assessment_no: assessmentNo,
              created_at: session.submitted_at || session.expires_at || now,
            }
            const outcome = await persistAssessmentSubmission(ctx.db!, finalSession, finalResult)
            if (outcome.ok && outcome.result) {
              result = outcome.result
            }
          }
        }
      }

      return NextResponse.json({ result, assessment_no: assessmentNo, supabase: true }, { headers: { 'Cache-Control': 'no-store' } })
    }

    let result = getLatestAssessmentResultForStudent(ctx.studentId, assessmentNo)
    if (!result) {
      const active = getActiveSessionForStudent(ctx.studentId, assessmentNo)
      if (active) {
        const isExpired = active.status === 'expired' || (active.expires_at && new Date(active.expires_at).getTime() <= Date.now())
        const isSubmitted = active.status === 'submitted' || !!active.submitted_at
        if (isExpired || isSubmitted) {
          const answers = (active.answers && typeof active.answers === 'object') ? active.answers : {}
          const scores = assessmentNo === 2
            ? computeScores2(answers, {}, {})
            : computeScores(answers, {}, {})
          const now = new Date().toISOString()
          active.status = isSubmitted ? 'submitted' : 'expired'
          active.submitted_at = active.submitted_at || active.expires_at || now
          result = {
            id: toUuid(`assessment-result:${active.id}`, 'result') || 'res_' + Math.random().toString(16).slice(2, 10),
            session_id: active.id,
            student_id: ctx.studentId,
            scores,
            total: Number(scores.total) || 0,
            grade: scores.grade || 'D',
            percentile: Number(scores.percentile) || 0,
            verifiable_hash: scores.verifiable_hash || '',
            ai_feedback: {},
            assessment_no: assessmentNo,
            created_at: active.submitted_at || active.expires_at || now,
          }
          saveAssessmentSession(active)
          saveAssessmentResult(result)
          await flushDB()
        }
      }
    }

    return NextResponse.json({ result, assessment_no: assessmentNo, supabase: false }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    console.error('[api/user/scores] read failed:', e?.message || e)
    return NextResponse.json(
      { error: 'Assessment data is temporarily unavailable. Please retry.' },
      { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '10' } },
    )
  }
}
