// GET /api/company-assessments?student_id=…
// Dashboard statuses for every company assessment the student has touched.
// Attempts that timed out while the candidate was away are finalised here.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { requireStudentApi } from '@/lib/studentApi'
import { listSummaries } from '@/lib/company/attempts'
import { jsonError, limited, ok } from '@/lib/company/http'

export async function GET(req: Request) {
  const blocked = limited(req, 'list')
  if (blocked) return blocked
  const url = new URL(req.url)
  const ctx = await requireStudentApi(req, url.searchParams.get('student_id'))
  if (!ctx.ok) return ctx.response
  const sb = ctx.supabase ? ctx.db : null
  const studentId = ctx.studentId
  try {
    const check = sb ? await sb.from('company_assessment_attempts').select('id, student_id, company_slug').limit(5) : null
    return ok({ attempts, server_now: new Date().toISOString(), _check: { studentId, hasSb: !!sb, checkError: check?.error?.message || null, checkCount: check?.data?.length ?? null, sampleStudent: check?.data?.[0]?.student_id ?? null } })
  } catch (e: any) {
    return jsonError(ctx.supabase ? 503 : 500, ctx.supabase ? 'Company assessment data is temporarily unavailable; no local fallback was used.' : 'Could not load company assessments', { detail: String(e?.message || e) })
  }
}
