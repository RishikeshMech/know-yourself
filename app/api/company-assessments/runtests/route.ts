// POST /api/company-assessments/runtests  { student_id, company, item_id, lang, code }
// Runs the hidden tests of a coding question that is part of the caller's
// own in-progress paper. Capped by a per-process concurrency limiter (each call
// forks an interpreter) and a per-IP rate limit.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { getServerClient } from '@/lib/supabaseServer'
import { resolveStudent } from '@/lib/company/auth'
import { getCompany } from '@/lib/company/catalog'
import { isFinal, loadAttempt } from '@/lib/company/attempts'
import { loadBank } from '@/lib/company/bank'
import { MAX_CODE_BYTES, runCodingTests, SUPPORTED_LANGS, type CodeLang } from '@/lib/company/codeRunner'
import { paperItemIds } from '@/lib/company/paper'
import { createLimiter } from '@/lib/concurrency'
import { jsonError, limited, ok, readJson } from '@/lib/company/http'
import { NextResponse } from 'next/server'
import type { CodingQuestion } from '@/lib/company/types'

const runLimiter = createLimiter(8)

export async function POST(req: Request) {
  const blocked = limited(req, 'runtests', 2000)
  if (blocked) return blocked
  const body = await readJson(req)
  if (!body) return jsonError(400, 'Invalid JSON body')
  const company = getCompany(body.company)
  if (!company) return jsonError(404, 'Unknown company assessment')
  const code = String(body.code || '')
  if (code.length > MAX_CODE_BYTES) return jsonError(413, 'Code is too large to run.')
  const lang: CodeLang = SUPPORTED_LANGS.includes(body.lang) ? body.lang : 'python'
  const sb = getServerClient()
  const who = await resolveStudent(req, body.student_id, sb)
  if (!who.ok) return jsonError(who.status, who.error)

  const attempt = await loadAttempt(who.studentId, company.slug, { sb })
  if (!attempt || isFinal(attempt)) return jsonError(409, 'No attempt in progress')
  const itemId = String(body.item_id || '')
  if (!paperItemIds(attempt.paper).has(itemId)) return jsonError(404, 'That question is not part of your paper')
  const q = loadBank().byId.get(itemId)
  if (!q || q.kind !== 'coding') return jsonError(400, 'Not a coding question')

  if (!runLimiter.tryAcquire()) {
    return NextResponse.json({ error: 'The test runner is busy — try again in a few seconds.' }, { status: 429, headers: { 'Retry-After': '3' } })
  }
  try {
    const result = await runCodingTests(q as CodingQuestion, code, lang)
    return ok({ ok: true, ...result })
  } catch (e: any) {
    return jsonError(500, 'Test run failed', { detail: String(e?.message || e) })
  } finally {
    runLimiter.release()
  }
}
