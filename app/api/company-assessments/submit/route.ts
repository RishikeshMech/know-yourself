// POST /api/company-assessments/submit  { student_id, company, answers, proctoring, auto, reason }
// Final submission. Scored entirely on the server (answer keys, hidden tests,
// written-answer grader). Idempotent: a second submit returns the first result.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { getServerClient } from '@/lib/supabaseServer'
import { resolveStudent } from '@/lib/company/auth'
import { getCompany } from '@/lib/company/catalog'
import { submitAttempt, toSummary } from '@/lib/company/attempts'
import { toPublicResult } from '@/lib/company/scoring'
import { jsonError, limited, ok, readJson } from '@/lib/company/http'

const MAX_BODY_CHARS = 400_000

export async function POST(req: Request) {
  const blocked = limited(req, 'submit', 600)
  if (blocked) return blocked
  const len = Number(req.headers.get('content-length') || 0)
  if (len > MAX_BODY_CHARS) return jsonError(413, 'Submission payload too large')
  const body = await readJson(req)
  if (!body) return jsonError(400, 'Invalid JSON body')
  const company = getCompany(body.company)
  if (!company) return jsonError(404, 'Unknown company assessment')
  const sb = getServerClient()
  const who = await resolveStudent(req, body.student_id, sb)
  if (!who.ok) return jsonError(who.status, who.error)
  try {
    const res = await submitAttempt(who.studentId, company.slug, {
      answers: body.answers,
      proctoring: body.proctoring,
      auto: !!body.auto,
      reason: typeof body.reason === 'string' ? body.reason : undefined,
    }, { sb })
    if (!res.ok) return jsonError(404, 'No attempt to submit')
    return ok({
      submitted: true,
      already_submitted: res.alreadySubmitted,
      attempt: toSummary(res.attempt),
      result: res.attempt.result ? toPublicResult(res.attempt.result) : null,
    })
  } catch (e: any) {
    return jsonError(500, 'Submission failed — your answers are still saved. Please retry.', { detail: String(e?.message || e) })
  }
}
