import { NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/adminAuth'

/** The admin page calls this on mount to decide login vs dashboard. */
export async function GET(req: Request) {
  return NextResponse.json({ authed: isAdminRequest(req) })
}
