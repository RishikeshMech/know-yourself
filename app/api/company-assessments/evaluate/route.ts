// POST /api/company-assessments/evaluate
// On-demand, server-side AI review for one written or coding answer in the
// caller's current paper. Answer keys and hidden tests are never sent to the model.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { getServerClient } from '@/lib/supabaseServer'
import { resolveStudent } from '@/lib/company/auth'
import { getCompany } from '@/lib/company/catalog'
import { finalizeExpired, isFinal, isPastDeadline, loadAttempt, SUBMIT_GRACE_MS } from '@/lib/company/attempts'
import { loadBank } from '@/lib/company/bank'
import { isCodeLang } from '@/lib/company/languages'
import { MAX_CODE_BYTES } from '@/lib/company/codeRunner'
import { MAX_ON_DEMAND_WRITTEN_CHARS, reviewCodingAnswer, reviewWrittenAnswer } from '@/lib/company/aiReview'
import { paperItemIds } from '@/lib/company/paper'
import { createLimiter } from '@/lib/concurrency'
import { jsonError, limited, ok, readJson } from '@/lib/company/http'

const reviewLimiter = createLimiter(8)

export async function POST(req: Request) {
  const blocked = limited(req, 'answer-review', 120)
  if (blocked) return blocked

  const body = await readJson(req)
  if (!body) return jsonError(400, 'Invalid JSON body')
  const company = getCompany(body.company)
  if (!company) return jsonError(404, 'Unknown company assessment')

  const sb = getServerClient()
  const who = await resolveStudent(req, body.student_id, sb)
  if (!who.ok) return jsonError(who.status, who.error)

  try {
    let attempt = await loadAttempt(who.studentId, company.slug, { sb })
    if (!attempt) return jsonError(409, 'No assessment in progress')
    if (isFinal(attempt)) return jsonError(409, 'This assessment is closed')
    if (isPastDeadline(attempt, new Date(), SUBMIT_GRACE_MS)) {
      attempt = await finalizeExpired(attempt, { sb })
      return jsonError(409, 'The assessment time has expired')
    }

    const itemId = String(body.item_id || '').slice(0, 160)
    if (!paperItemIds(attempt.paper).has(itemId)) return jsonError(404, 'That question is not part of your paper')
    const question = loadBank().byId.get(itemId)
    if (!question) return jsonError(404, 'Question not found')

    if (!reviewLimiter.tryAcquire()) {
      return Response.json({ error: 'AI review is busy — try again in a few seconds.' }, { status: 429, headers: { 'Retry-After': '3' } })
    }
    try {
      if (question.kind === 'written') {
        if (body.kind !== 'written') return jsonError(400, 'Answer type does not match the question')
        const answer = String(body.answer || '')
        if (answer.length > MAX_ON_DEMAND_WRITTEN_CHARS) return jsonError(413, 'Answer is too long to evaluate')
        const result = await reviewWrittenAnswer(question, answer)
        return ok({ ok: true, result })
      }
      if (question.kind === 'coding') {
        if (body.kind !== 'coding') return jsonError(400, 'Answer type does not match the question')
        const code = String(body.answer || '')
        if (Buffer.byteLength(code, 'utf8') > MAX_CODE_BYTES) return jsonError(413, 'Code is too large to evaluate')
        const lang = isCodeLang(body.lang) ? body.lang : null
        if (!lang) return jsonError(400, 'Unsupported coding language')
        const result = await reviewCodingAnswer(question, code, lang)
        return ok({ ok: true, result })
      }
      return jsonError(400, 'AI review is available for written and coding questions only')
    } finally {
      reviewLimiter.release()
    }
  } catch (error: any) {
    return jsonError(500, 'AI review failed', { detail: String(error?.message || error).slice(0, 300) })
  }
}
