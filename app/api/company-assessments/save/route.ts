// POST /api/company-assessments/save  { student_id, company, answers, proctoring }
// Throttled autosave checkpoint. Refused once the attempt is final or its
// server-side deadline has passed.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { requireStudentApi } from '@/lib/studentApi'
import { getCompany } from '@/lib/company/catalog'
import { saveProgress, toSummary } from '@/lib/company/attempts'
import { jsonError, limited, ok, readJson } from '@/lib/company/http'

const MAX_BODY_CHARS = 400_000

export async function POST(req: Request) {
  const blocked = limited(req, 'save')
  if (blocked) return blocked
  const len = Number(req.headers.get('content-length') || 0)
  if (len > MAX_BODY_CHARS) return jsonError(413, 'Autosave payload too large')
  const body = await readJson(req)
  if (!body) return jsonError(400, 'Invalid JSON body')
  const company = getCompany(body.company)
  if (!company) return jsonError(404, 'Unknown company assessment')
  const ctx = await requireStudentApi(req, body.student_id)
  if (!ctx.ok) return ctx.response
  const sb = ctx.supabase ? ctx.db : null
  const studentId = ctx.studentId
  try {
    const res = await saveProgress(studentId, company.slug, body.answers, body.proctoring, { sb })
    if (!res.ok) {
      const status = res.reason === 'not-found' ? 404 : 409
      return jsonError(status, res.reason === 'not-found' ? 'No attempt in progress' : 'This attempt is closed', {
        reason: res.reason,
        ...(res.attempt ? { attempt: toSummary(res.attempt) } : {}),
      })
    }
    return ok({ saved: true, saved_at: res.attempt.updated_at })
  } catch (e: any) {
    return jsonError(ctx.supabase ? 503 : 500, ctx.supabase ? 'The answer checkpoint was not confirmed in Supabase. Please retry.' : 'Autosave failed', { detail: String(e?.message || e) })
  }
}
