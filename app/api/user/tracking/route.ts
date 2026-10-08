import { NextResponse } from 'next/server'
import { getTrackingEvents, saveTrackingEvent } from '@/lib/db'
import { persistTrackingOutcome, readTrackingEvents } from '@/lib/persist'
import { resolveStudentAccess } from '@/lib/studentAuth'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const userId = url.searchParams.get('user_id') || ''
    if (!userId) return NextResponse.json({ error: 'Missing user_id' }, { status: 400 })
    const who = await resolveStudentAccess(req, userId)
    if (!who.ok) return NextResponse.json({ error: who.error }, { status: who.status })
    if (who.mode === 'supabase') {
      const { events, error } = await readTrackingEvents(who.client, who.studentId)
      if (error) return NextResponse.json({ error: 'Could not load your progress right now — please retry.' }, { status: 503 })
      return NextResponse.json({ tracking: events, supabase: true })
    }
    return NextResponse.json({ tracking: getTrackingEvents(who.studentId) })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to fetch tracking' }, { status: 500 })
  }
}

/**
 * Marks a follow step (WhatsApp / LinkedIn) complete. The row id is derived from
 * the student and the action, so repeating the step updates the same row instead
 * of adding a new one each time.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const who = await resolveStudentAccess(req, body.user_id || body.id)
    if (!who.ok) return NextResponse.json({ error: who.error }, { status: who.status })
    const action = String(body.action || '').trim()
    if (!action) return NextResponse.json({ error: 'Missing action' }, { status: 400 })
    const event = {
      id: String(body.id || `${who.studentId}:${action}`),
      user_id: who.studentId,
      action,
      completed: body.completed === true || body.completed === 'true',
      completed_at: body.completed ? new Date().toISOString() : undefined,
    }
    if (who.mode === 'supabase') {
      const outcome = await persistTrackingOutcome(who.client, event)
      if (!outcome.ok) return NextResponse.json({ error: 'Could not record this step right now — please retry.' }, { status: 503 })
      return NextResponse.json({ event, saved: true, supabase: true })
    }
    saveTrackingEvent(event)
    return NextResponse.json({ event, saved: true, supabase: false })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to save tracking' }, { status: 500 })
  }
}
