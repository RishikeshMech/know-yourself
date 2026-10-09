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
    return ok({
      state: 'completed',
      attempt: { ...toSummary(attempt), proctoring: { strikes: attempt.proctoring?.strikes || 0, camera: attempt.proctoring?.camera ?? null }, submit_reason: attempt.submit_reason || null },
      result: attempt.result ? toPublicResult(attempt.result) : null,
    })
  } catch (e: any) {
    return jsonError(ctx.supabase ? 503 : 500, ctx.supabase ? 'Assessment result is temporarily unavailable; no local fallback was used.' : 'Could not load the result', { detail: String(e?.message || e) })
  }
}
