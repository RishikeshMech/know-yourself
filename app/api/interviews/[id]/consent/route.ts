export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import {
  getInterviewSessionFull,
  saveInterviewSession,
  getCustomOrBankQuestion,
  ensureOpeningInterviewerTurn,
  buildSessionQuestionsPlan,
} from '@/lib/interview/store.ts'
import { getServerClient } from '@/lib/supabaseServer.ts'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const sb = getServerClient()
    const session = await getInterviewSessionFull(params.id, sb)
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

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
      camera_mic_enabled: camera_mic_enabled !== false,
      granted_at: new Date().toISOString(),
    }

    session.device_check = {
      camera_ok: !!device_check?.camera_ok,
      mic_ok: device_check?.mic_ok !== false,
      speaker_ok: device_check?.speaker_ok !== false,
      network_ok: device_check?.network_ok !== false,
      code_editor_ok: true,
      voice_mode_enabled: device_check?.voice_mode_enabled !== false,
      checked_at: new Date().toISOString(),
    }

    session.state = 'CONSENTED'
    session.started_at = new Date().toISOString()
    session.last_active_at = new Date().toISOString()

    const firstSection = session.blueprint.sections[0]
    if (firstSection) {
      session.state = firstSection.state as any
    }

    // Create Sam's opening interviewer turn asking Question 1 in continuation
    ensureOpeningInterviewerTurn(session)

    await saveInterviewSession(session, sb, { persistTurns: true })

    const questionsPlan = buildSessionQuestionsPlan(session)
    const curId = session.blueprint?.current_question_id || ''
    const currentQ = curId ? getCustomOrBankQuestion(session, curId) : null
    const currentPlanItem = questionsPlan.find(item => item.id === curId)

    const safeCurrent = currentQ
      ? {
          id: currentQ.id,
          question_number: currentPlanItem?.question_number || 1,
          total_questions: questionsPlan.length || 1,
          prompt: currentQ.prompt,
          topic: currentQ.topic,
          type: currentQ.type,
          section: currentQ.section,
          section_label: currentPlanItem?.section_label || currentQ.section,
          difficulty: currentQ.difficulty,
          time_limit_min: currentQ.time_limit_min,
          hint_ladder: currentQ.hint_ladder,
          follow_ups: currentQ.follow_ups,
          coding_spec: currentQ.coding_spec
            ? {
                fn_name: currentQ.coding_spec.fn_name,
                starter_code: currentQ.coding_spec.starter_code,
                sample_input_output: currentQ.coding_spec.sample_input_output,
                target_complexity: currentQ.coding_spec.target_complexity,
              }
            : undefined,
        }
      : null

    return NextResponse.json({
      session,
      current_question: safeCurrent,
      questions_plan: questionsPlan,
      next_state: session.state,
    })
  } catch (e: any) {
    console.error('[api/interviews/consent] failed', e)
    return NextResponse.json({ error: 'Consent failed', detail: String(e?.message || e) }, { status: 500 })
  }
}
