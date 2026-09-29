import { NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/adminAuth'
import { fetchAllStudents } from '@/lib/adminStudents'
import { tableToCsv } from '@/lib/csv'
import { ATTEMPT_COLUMNS, attemptRows, summarizeCompanies } from '@/lib/adminAssessments'
import { COMPANY_TAGS } from '@/lib/company/catalog'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/company-results?tag=<company tag>&company=<slug>&format=json|csv
 *
 * Company-wise results across all students: per-company aggregates (attempts,
 * completed, average, best, interview-ready count, pass rate) grouped by
 * category, plus the individual attempts. `format=csv` downloads the matching
 * attempts (one row per student × company).
 */
export async function GET(req: Request) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const url = new URL(req.url)
    const tag = url.searchParams.get('tag') || ''
    const company = url.searchParams.get('company') || ''
    const format = url.searchParams.get('format') === 'csv' ? 'csv' : 'json'
    const { students, warning } = await fetchAllStudents()
    const summary = summarizeCompanies(students).filter((c) => (!tag || c.tag === tag) && (!company || c.company === company))
    const keep = new Set(summary.map((c) => c.company))
    const scoped = students.map((s) => ({ ...s, company_attempts: (s.company_attempts || []).filter((a) => keep.has(a.company)) }))
    const attempts = attemptRows(scoped.map((s) => ({ ...s, score: '', has_assessment: 'No', a2_score: '' })))
    if (format === 'csv') {
      const date = new Date().toISOString().slice(0, 10)
      const name = company || tag || 'all'
      return new NextResponse(tableToCsv(ATTEMPT_COLUMNS, attempts), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="calibiai_company_results_${name}_${date}.csv"`,
          'Cache-Control': 'no-store',
        },
      })
    }
    const categories = COMPANY_TAGS.map((t) => {
      const list = summary.filter((c) => c.tag === t.id)
      const completed = list.reduce((s, c) => s + c.completed, 0)
      const weighted = list.reduce((s, c) => s + (c.average || 0) * c.completed, 0)
      return { id: t.id, label: t.label, companies: list.length, attempts: list.reduce((s, c) => s + c.attempts, 0), completed, average: completed ? Math.round((weighted / completed) * 10) / 10 : null }
    }).filter((c) => c.companies > 0)
    return NextResponse.json({
      warning: warning || null,
      categories,
      companies: summary,
      attempts: attempts.length,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Could not load company results.' }, { status: 500 })
  }
}
