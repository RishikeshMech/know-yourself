// GET /api/company-assessments?student_id=…
// Dashboard statuses for every company assessment the student has touched.
// Attempts that timed out while the candidate was away are finalised here.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { getServerClient } from '@/lib/supabaseServer'
import { resolveStudent } from '@/lib/company/auth'
import { listSummaries } from '@/lib/company/attempts'
import { jsonError, limited, ok } from '@/lib/company/http'

export async function GET(req: Request) {
  const blocked = limited(req, 'list')
  if (blocked) return blocked
  const url = new URL(req.url)
  const sb = getServerClient()
  const who = await resolveStudent(req, url.searchParams.get('student_id'), sb)
  if (!who.ok) return jsonError(who.status, who.error)
  try {
    const attempts = await listSummaries(who.studentId, { sb })
    return ok({ attempts, server_now: new Date().toISOString() })
  } catch (e: any) {
    return jsonError(500, 'Could not load company assessments', { detail: String(e?.message || e) })
  }
}
