export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getCustomOrBankQuestion } from '@/lib/interview/store.ts'
import { requireOwnedInterview } from '@/lib/interview/apiAuth.ts'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const owned = await requireOwnedInterview(req, params.id)
  if (!owned.ok) return owned.response
  const { session } = owned

  const curId = session.blueprint?.current_question_id || ''
  const currentQ = curId ? getCustomOrBankQuestion(session, curId) : null
  const safeCurrent = currentQ
    ? {
        id: currentQ.id,
        prompt: currentQ.prompt,
        topic: currentQ.topic,
        type: currentQ.type,
        section: currentQ.section,
        time_limit_min: currentQ.time_limit_min,
        hint_ladder: currentQ.hint_ladder,
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
    blueprint: session.blueprint,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
