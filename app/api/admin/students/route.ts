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
    const all = await fetchAllStudents()
    const rows = filterRows(all, { college, q })
    return NextResponse.json({ students: rows, total: all.length, filtered: rows.length })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to load students.' }, { status: 500 })
  }
}
