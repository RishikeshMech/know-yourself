export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { saveInterviewSession } from '@/lib/interview/store.ts'
import { MAX_PAUSES_PER_SESSION } from '@/lib/interview/types.ts'
import { requireOwnedInterview } from '@/lib/interview/apiAuth.ts'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const owned = await requireOwnedInterview(req, params.id)
  if (!owned.ok) return owned.response
  const { session, auth } = owned
  const sb = auth.db

  if (['REPORT_READY', 'EVALUATING', 'ABANDONED', 'TERMINATED', 'PAUSED'].includes(session.state)) {
    return NextResponse.json({ error: `Cannot pause in state ${session.state}` }, { status: 409 })
  }

  if (session.pause_count >= MAX_PAUSES_PER_SESSION) {
    return NextResponse.json({ error: `Maximum pauses (${MAX_PAUSES_PER_SESSION}) already used` }, { status: 409 })
  }

  session.previous_active_state = session.state as any
  session.state = 'PAUSED'
  session.paused_at = new Date().toISOString()
  session.pause_count += 1

  await saveInterviewSession(session, sb)

  return NextResponse.json(
    { state: session.state, paused_at: session.paused_at, pause_count: session.pause_count },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
