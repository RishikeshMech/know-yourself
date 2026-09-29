export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getInterviewSessionFull, saveInterviewSession } from '@/lib/interview/store.ts'
import { MAX_PAUSES_PER_SESSION } from '@/lib/interview/types.ts'
import { getServerClient } from '@/lib/supabaseServer.ts'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const sb = getServerClient()
  const session = await getInterviewSessionFull(params.id, sb)
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

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

  return NextResponse.json({ state: session.state, paused_at: session.paused_at, pause_count: session.pause_count })
}
