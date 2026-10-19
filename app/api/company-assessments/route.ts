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
    const attempts = await listSummaries(studentId, { sb })
    return ok({ attempts, server_now: new Date().toISOString() })
  } catch (e: any) {
    return jsonError(ctx.supabase ? 503 : 500, ctx.supabase ? 'Company assessment data is temporarily unavailable; no local fallback was used.' : 'Could not load company assessments', { detail: String(e?.message || e) })
  }
}
