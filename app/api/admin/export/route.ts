import { NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/adminAuth'
import { fetchAllStudents } from '@/lib/adminStudents'
import { filterRows } from '@/lib/adminFilters'
import { downloadFilename, rowsToCsv, tableToCsv } from '@/lib/csv'
import { ATTEMPT_COLUMNS, attemptRows, summarizeCompanies } from '@/lib/adminAssessments'
import { CALIBI_RULE } from '@/lib/calibiScore'
import { adminStoreUnavailable } from '@/lib/adminDataGuard'

/**
 * GET /api/admin/export?kind=students|attempts|json&scope=all|filtered&college=&q=&assessed=1
 *
 *   kind=students (default) — one CSV row per student: full profile, resume
 *     score, CalibiAI Score (average of every assessment), every assessment
 *     taken with its category, CalibiAI assessment + Capgemini mock module
 *     scores, company-mock summary, category averages and one column per
 *     company (company-wise scores).
 *   kind=attempts — one CSV row per assessment attempt (CalibiAI, Capgemini
 *     mock, each company mock): category, score, verdict, rounds, proctoring
 *     strikes/camera, dates.
 *   kind=json — everything above as structured JSON (per-student breakdown +
 *     company attempts + company-wise summary).
 *
 * `scope=all` ignores the college/search/assessed filters. Always freshly
 * computed (never cached) so an explicit export matches the live data.
 */
export async function GET(req: Request) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const storeDown = adminStoreUnavailable()
  if (storeDown) return storeDown
  try {
    const url = new URL(req.url)
    const kind = url.searchParams.get('kind') || 'students'
    const scope = url.searchParams.get('scope') === 'all' ? 'all' : 'filtered'
    const college = url.searchParams.get('college') || ''
    const q = url.searchParams.get('q') || ''
    const assessed = url.searchParams.get('assessed') === '1'
    const { students: all, warning } = await fetchAllStudents()
    const rows = scope === 'all' ? all : filterRows(all, { college, q, assessed })
    const headers = (file: string, type: string) => ({
      'Content-Type': type,
      'Content-Disposition': `attachment; filename="${file}"`,
      'Cache-Control': 'no-store',
      ...(warning ? { 'X-Export-Warning': encodeURIComponent(warning).slice(0, 900) } : {}),
    })

    if (kind === 'attempts') {
      const csv = tableToCsv(ATTEMPT_COLUMNS, attemptRows(rows))
      return new NextResponse(csv, { headers: headers(downloadFilename(scope, 'assessment_attempts'), 'text/csv; charset=utf-8') })
    }
    if (kind === 'json') {
      const body = JSON.stringify({
        exported_at: new Date().toISOString(),
        scope,
        filters: scope === 'all' ? null : { college, q, assessed },
        calibi_rule: CALIBI_RULE,
        warning: warning || null,
        students: rows.length,
        company_summary: summarizeCompanies(rows),
        data: rows,
      }, null, 1)
      return new NextResponse(body, { headers: headers(downloadFilename(scope, 'students_full', 'json'), 'application/json; charset=utf-8') })
    }
    const csv = rowsToCsv(rows)
    return new NextResponse(csv, { headers: headers(downloadFilename(scope), 'text/csv; charset=utf-8') })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Export failed.' }, { status: 500 })
  }
}
