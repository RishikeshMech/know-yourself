import { NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/adminAuth'
import { fetchAllStudents } from '@/lib/adminStudents'
import { filterRows } from '@/lib/adminFilters'

export async function GET(req: Request) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const url = new URL(req.url)
    const college = url.searchParams.get('college') || ''
    const q = url.searchParams.get('q') || ''
    const { students, source, warning } = await fetchAllStudents()
    const rows = filterRows(students, { college, q })
    return NextResponse.json({
      students: rows,
      total: students.length,
      filtered: rows.length,
      source,
      warning,
      updated_at: new Date().toISOString(),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to load students.' }, { status: 500 })
  }
}
