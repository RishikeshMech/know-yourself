import { NextResponse } from 'next/server'
import { getTrackingEvents, saveTrackingEvent, flushDB } from '@/lib/db'
import { persistTrackingEvent } from '@/lib/persist'
import { requireStudentApi } from '@/lib/studentApi'

export const dynamic = 'force-dynamic'

function unavailable() {
  return NextResponse.json({ error: 'Tracking data could not be stored. Please retry.' }, { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '10' } })
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const ctx = await requireStudentApi(req, url.searchParams.get('user_id'))
  if (!ctx.ok) return ctx.response
  try {
    if (ctx.supabase) {
      const { data, error } = await ctx.db!
        .from('tracking_events')
        .select('id,user_id,action,completed,completed_at')
        .eq('user_id', ctx.studentId)
        .order('completed_at', { ascending: false })
      if (error) throw error
      return NextResponse.json({ tracking: data || [], supabase: true }, { headers: { 'Cache-Control': 'no-store' } })
    }
    return NextResponse.json({ tracking: getTrackingEvents(ctx.studentId), supabase: false }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    console.error('[api/user/tracking] GET failed:', e?.message || e)
    return unavailable()
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const ctx = await requireStudentApi(req, body.user_id || body.id)
    if (!ctx.ok) return ctx.response
    const action = String(body.action || '').trim()
    if (!['join_whatsapp', 'follow_linkedin'].includes(action)) {
      return NextResponse.json({ error: 'Unknown tracking action.' }, { status: 400 })
    }
    const completed = body.completed === true || body.completed === 'true'
    const event = {
      id: `${ctx.studentId}:${action}`,
      user_id: ctx.studentId,
      action,
      completed,
      completed_at: completed ? new Date().toISOString() : undefined,
    }

    if (ctx.supabase) {
      if (!(await persistTrackingEvent(ctx.db!, event))) return unavailable()
    } else {
      saveTrackingEvent(event)
      await flushDB()
    }
    return NextResponse.json({ event, saved: true, supabase: ctx.supabase }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    console.error('[api/user/tracking] POST failed:', e?.message || e)
    return unavailable()
  }
}
