// GET /api/company-assessments/attempt?student_id=…&company=…
// Resume view for the exam page. Never creates an attempt (that needs the
// explicit consent on the instructions page → /start).
//   200 { state: 'in_progress', attempt, paper, answers, server_now }
//   200 { state: 'completed', attempt }
//   200 { state: 'none' }
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { getServerClient } from '@/lib/supabaseServer'
import { resolveStudent } from '@/lib/company/auth'
import { getCompany } from '@/lib/company/catalog'
import {
  SUBMIT_GRACE_MS, clientView, finalizeExpired, isFinal, isPastDeadline, loadAttempt, toSummary,
} from '@/lib/company/attempts'
import { jsonError, limited, ok } from '@/lib/company/http'

export async function GET(req: Request) {
  const blocked = limited(req, 'attempt')
  if (blocked) return blocked
  const url = new URL(req.url)
  const company = getCompany(url.searchParams.get('company') || '')
  if (!company) return jsonError(404, 'Unknown company assessment')
  const sb = getServerClient()
  const who = await resolveStudent(req, url.searchParams.get('student_id'), sb)
  if (!who.ok) return jsonError(who.status, who.error)
  try {
    let attempt = await loadAttempt(who.studentId, company.slug, { sb })
    if (!attempt) return ok({ state: 'none' })
    if (!isFinal(attempt) && isPastDeadline(attempt, new Date(), SUBMIT_GRACE_MS)) {
      attempt = await finalizeExpired(attempt, { sb })
    }
    if (isFinal(attempt)) return ok({ state: 'completed', attempt: toSummary(attempt) })
    return ok({ state: 'in_progress', ...clientView(attempt, { sb }) })
  } catch (e: any) {
    return jsonError(500, 'Could not load the assessment', { detail: String(e?.message || e) })
  }
}
