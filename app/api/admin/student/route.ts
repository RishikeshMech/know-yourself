import { NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/adminAuth'
import { fetchAllStudents } from '@/lib/adminStudents'
import { loadStudentRecord } from '@/lib/adminAssessmentData'
import { getServerClient } from '@/lib/supabaseServer'
import { rowsToCsv, tableToCsv } from '@/lib/csv'
import { ATTEMPT_COLUMNS, attemptRows } from '@/lib/adminAssessments'
import { adminStoreUnavailable } from '@/lib/adminDataGuard'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/student?id=<student_id>&format=json|csv
 *
 *   format=json (default) — the student's complete record: the admin row
 *     (profile, CalibiAI Score + breakdown, company-wise and category-wise
 *     scores) plus the raw stored data from both stores — profile, resume
 *     analysis, both platform results with AI feedback, session metadata and
 *     every company attempt with graded items, feedback and proctoring log.
 *   format=csv — the student's profile row followed by one row per
 *     assessment attempt.
 */
export async function GET(req: Request) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const storeDown = adminStoreUnavailable()
  if (storeDown) return storeDown
  const url = new URL(req.url)
  const id = String(url.searchParams.get('id') || '').trim()
  const format = url.searchParams.get('format') === 'csv' ? 'csv' : 'json'
  if (!id || id.length > 100) return NextResponse.json({ error: 'Missing student id' }, { status: 400 })
  try {
    const { students } = await fetchAllStudents()
    const row = students.find((s) => s.student_id === id)
    if (!row) return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    const safe = (row.name || row.email || id).replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').slice(0, 40) || 'student'
    const date = new Date().toISOString().slice(0, 10)
    if (format === 'csv') {
      const profile = rowsToCsv([row])
      const attempts = tableToCsv(ATTEMPT_COLUMNS, attemptRows([row])).replace(/^\uFEFF/, '')
      return new NextResponse(`${profile}\r\n\r\n${attempts}`, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="calibiai_student_${safe}_${date}.csv"`,
          'Cache-Control': 'no-store',
        },
      })
    }
    const record = await loadStudentRecord(getServerClient(), row)
    return new NextResponse(JSON.stringify(record, null, 1), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="calibiai_student_${safe}_${date}.json"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Could not load the student record.' }, { status: 500 })
  }
}
