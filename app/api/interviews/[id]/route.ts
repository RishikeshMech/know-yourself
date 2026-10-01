export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import {
  getInterviewSessionFull,
  getCustomOrBankQuestion,
  saveInterviewSession,
  ensureOpeningInterviewerTurn,
  buildSessionQuestionsPlan,
} from '@/lib/interview/store.ts'
import { getServerClient } from '@/lib/supabaseServer.ts'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const sb = getServerClient()
  const session = await getInterviewSessionFull(params.id, sb)
  if (!session) {
    return NextResponse.json({ error: 'Interview session not found' }, { status: 404 })
  }

  // Ensure opening turn exists if session is active and sanitize any legacy {track}
  if (ensureOpeningInterviewerTurn(session)) {
    await saveInterviewSession(session, sb, { persistTurns: true })
  }

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
    session: {
      ...session,
    },
    current_question: safeCurrent,
    questions_plan: questionsPlan,
    blueprint: session.blueprint,
  })
}
