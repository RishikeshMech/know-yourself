// GET /api/company-assessments/result?student_id=…&company=…
// The graded result of a finished attempt (public projection — no MCQ keys).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { requireStudentApi } from '@/lib/studentApi'
import { getCompany } from '@/lib/company/catalog'
import {
  SUBMIT_GRACE_MS, finalizeExpired, isFinal, isPastDeadline, loadAttempt, toSummary,
} from '@/lib/company/attempts'
import { toPublicResult } from '@/lib/company/scoring'
import { jsonError, limited, ok } from '@/lib/company/http'

export async function GET(req: Request) {
  const blocked = limited(req, 'result')
  if (blocked) return blocked
  const url = new URL(req.url)
  const company = getCompany(url.searchParams.get('company') || '')
  if (!company) return jsonError(404, 'Unknown company assessment')
  const ctx = await requireStudentApi(req, url.searchParams.get('student_id'))
  if (!ctx.ok) return ctx.response
  const sb = ctx.supabase ? ctx.db : null
  const studentId = ctx.studentId
  try {
    let attempt = await loadAttempt(studentId, company.slug, { sb })
    if (!attempt) return ok({ state: 'none' })
    if (!isFinal(attempt) && isPastDeadline(attempt, new Date(), SUBMIT_GRACE_MS)) {
      attempt = await finalizeExpired(attempt, { sb })
    }
    if (!isFinal(attempt)) return ok({ state: 'in_progress', attempt: toSummary(attempt) })

    if (isFinal(attempt) && !attempt.result) {
      try {
        const { loadBank } = await import('@/lib/company/bank')
        const { scoreAttempt } = await import('@/lib/company/scoring')
        const { gradeWritten } = await import('@/lib/company/grading')
        const { runCodingTests } = await import('@/lib/company/codeRunner')
        const bank = loadBank()
        const scored = await scoreAttempt(attempt.paper, attempt.answers || {}, bank, {
          gradeWritten: (q, a) => gradeWritten(q, a),
          runCode: async (q, code, lang) => runCodingTests(q, code, lang),
          concurrency: 4,
        })
        attempt.result = scored
        attempt.score = scored.score
        if (sb) {
          const { persistCompanyAttempt } = await import('@/lib/persist')
          await persistCompanyAttempt(sb, attempt)
        }
      } catch (scoreErr) {
        console.warn('[company-assessments] on-the-fly scoring failed:', scoreErr)
      }
    }

    return ok({
      state: 'completed',
      attempt: { ...toSummary(attempt), proctoring: { strikes: attempt.proctoring?.strikes || 0, camera: attempt.proctoring?.camera ?? null }, submit_reason: attempt.submit_reason || null },
      result: attempt.result ? toPublicResult(attempt.result) : null,
    })
  } catch (e: any) {
    return jsonError(ctx.supabase ? 503 : 500, ctx.supabase ? 'Assessment result is temporarily unavailable; no local fallback was used.' : 'Could not load the result', { detail: String(e?.message || e) })
  }
}
