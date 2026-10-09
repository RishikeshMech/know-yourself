export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { saveInterviewSession } from '@/lib/interview/store.ts'
import { requireOwnedInterview } from '@/lib/interview/apiAuth.ts'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const owned = await requireOwnedInterview(req, params.id)
    if (!owned.ok) return owned.response
    const { session, auth } = owned
    const sb = auth.db

    if (!['SCHEDULED', 'CREATED'].includes(session.state)) {
      return NextResponse.json({ error: `Cannot consent in state ${session.state}` }, { status: 409 })
    }

    const body = await req.json().catch(() => ({}))
    const { accepted_ai_notice, record_session, share_with_faculty, camera_mic_enabled, device_check } = body

    if (!accepted_ai_notice) {
      return NextResponse.json({ error: 'You must accept the AI notice to proceed' }, { status: 400 })
    }

    session.consent = {
      accepted_ai_notice: !!accepted_ai_notice,
      record_session: !!record_session,
      share_with_faculty: !!share_with_faculty,
      camera_mic_enabled: !!camera_mic_enabled,
      granted_at: new Date().toISOString(),
    }

    if (device_check) {
      session.device_check = {
        camera_ok: !!device_check.camera_ok,
        mic_ok: !!device_check.mic_ok,
        speaker_ok: !!device_check.speaker_ok,
        network_ok: !!device_check.network_ok,
        code_editor_ok: true,
        voice_mode_enabled: !!device_check.voice_mode_enabled,
        checked_at: new Date().toISOString(),
      }
    }

    session.state = 'CONSENTED'
    session.started_at = new Date().toISOString()
    session.last_active_at = new Date().toISOString()

    const firstSection = session.blueprint.sections[0]
    if (firstSection) {
      session.state = firstSection.state as any
    }

    await saveInterviewSession(session, sb, { persistConsent: true })

    return NextResponse.json({ session, next_state: session.state }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    console.error('[api/interviews/consent] failed', e)
    return NextResponse.json({ error: 'Consent failed', detail: String(e?.message || e) }, { status: 500 })
  }
}
