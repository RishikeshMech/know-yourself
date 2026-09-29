export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getInterviewSessionFull, saveInterviewSession } from '@/lib/interview/store.ts'
import { MAX_PAUSE_DURATION_SEC, RECONNECT_WINDOW_SEC } from '@/lib/interview/types.ts'
import { getServerClient } from '@/lib/supabaseServer.ts'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const sb = getServerClient()
  const session = await getInterviewSessionFull(params.id, sb)
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  if (session.state !== 'PAUSED' && session.state !== 'DISCONNECTED') {
    return NextResponse.json({ error: `Cannot resume from state ${session.state}` }, { status: 409 })
  }

  if (session.state === 'PAUSED' && session.paused_at) {
    const pausedSec = (Date.now() - new Date(session.paused_at).getTime()) / 1000
    if (pausedSec > MAX_PAUSE_DURATION_SEC) {
      session.state = 'ABANDONED'
      session.ended_at = new Date().toISOString()
      await saveInterviewSession(session, sb)
      return NextResponse.json({ error: 'Pause window (5 min) exceeded. Session abandoned.', state: session.state }, { status: 409 })
    }
    session.total_paused_sec += Math.round(pausedSec)
  }

  if (session.state === 'DISCONNECTED') {
    const lastActive = new Date(session.last_active_at).getTime()
    if ((Date.now() - lastActive) / 1000 > RECONNECT_WINDOW_SEC) {
      session.state = 'ABANDONED'
      session.ended_at = new Date().toISOString()
      await saveInterviewSession(session, sb)
      return NextResponse.json({ error: 'Reconnect window (30 min) exceeded. Session abandoned.', state: session.state }, { status: 409 })
    }
  }

  session.state = (session.previous_active_state as any) || 'FUNDAMENTALS'
  session.paused_at = null
  session.previous_active_state = undefined
  session.last_active_at = new Date().toISOString()

  await saveInterviewSession(session, sb)

  return NextResponse.json({ state: session.state, total_paused_sec: session.total_paused_sec })
}
