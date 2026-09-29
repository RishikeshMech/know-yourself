// POST /api/company-assessments/start  { student_id, company }
//   200 { outcome: 'created' | 'resumed', attempt, paper, answers, server_now }
//   409 { outcome: 'completed', attempt }   ← one attempt per company, ever
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { getServerClient } from '@/lib/supabaseServer'
import { resolveStudent } from '@/lib/company/auth'
import { getCompany } from '@/lib/company/catalog'
import { clientView, startAttempt, toSummary } from '@/lib/company/attempts'
import { jsonError, limited, ok, readJson } from '@/lib/company/http'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const blocked = limited(req, 'start', 600)
  if (blocked) return blocked
  const body = await readJson(req)
  if (!body) return jsonError(400, 'Invalid JSON body')
  const company = getCompany(body.company)
  if (!company) return jsonError(404, 'Unknown company assessment')
  const sb = getServerClient()
  const who = await resolveStudent(req, body.student_id, sb)
  if (!who.ok) return jsonError(who.status, who.error)
  try {
    const res = await startAttempt(who.studentId, company.slug, { sb })
    if (res.outcome === 'completed') {
      return NextResponse.json(
        { outcome: 'completed', error: 'You have already taken this assessment — only one attempt is allowed.', attempt: toSummary(res.attempt) },
        { status: 409, headers: { 'Cache-Control': 'no-store' } },
      )
    }
    return ok({ outcome: res.outcome, ...clientView(res.attempt, { sb }) })
  } catch (e: any) {
    return jsonError(500, 'Could not start the assessment', { detail: String(e?.message || e) })
  }
}
