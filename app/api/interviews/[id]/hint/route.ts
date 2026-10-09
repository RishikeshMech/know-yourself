export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { saveInterviewSession, getCustomOrBankQuestion } from '@/lib/interview/store.ts'
import { gatewayCallLlm } from '@/lib/interview/llmGateway.ts'
import { requireOwnedInterview } from '@/lib/interview/apiAuth.ts'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const owned = await requireOwnedInterview(req, params.id)
    if (!owned.ok) return owned.response
    const { session, auth } = owned
    const sb = auth.db

    if (['REPORT_READY', 'EVALUATING', 'ABANDONED', 'TERMINATED'].includes(session.state)) {
      return NextResponse.json({ error: 'Interview already ended' }, { status: 409 })
    }

    const currentId = session.blueprint.current_question_id
    if (!currentId) return NextResponse.json({ error: 'No current question' }, { status: 400 })

    const question = getCustomOrBankQuestion(session, currentId)
    if (!question) return NextResponse.json({ error: 'Question not found' }, { status: 404 })

    const currentLevel = session.hints_by_question[currentId] || 0
    if (currentLevel >= 3) {
      return NextResponse.json({ error: 'Maximum hint level (3) already reached', hint_level: currentLevel }, { status: 409 })
    }

    const nextLevel = (currentLevel + 1) as 1 | 2 | 3
    session.hints_by_question[currentId] = nextLevel

    const hintText = question.hint_ladder[nextLevel - 1]

    let interviewerHint = `Hint Level ${nextLevel}: ${hintText} (Note: using hints slightly affects scoring, but it's better to learn!)`

    try {
      const res = await gatewayCallLlm(
        [
          {
            role: 'system',
            content: `You are Sam, a friendly interviewer. The student asked for a hint on question: "${question.prompt}". Provide hint level ${nextLevel}: "${hintText}". Keep under 40 words, encouraging, and mention hint affects score slightly. Do not reveal full answer.`,
          },
          { role: 'user', content: `Student requested hint level ${nextLevel}` },
        ],
        { temperature: 0.5, maxTokens: 100 },
      )
      if (res) interviewerHint = res.text
    } catch {}

    await saveInterviewSession(session, sb)

    return NextResponse.json({
      hint_level: nextLevel,
      hint_text: hintText,
      interviewer_reply: interviewerHint,
      penalty: nextLevel === 1 ? -0.25 : nextLevel === 2 ? -0.5 : -1.0,
      message: `Hint ${nextLevel}/3 used. Penalty: ${nextLevel === 1 ? '-0.25' : nextLevel === 2 ? '-0.5' : '-1.0'} on this question (min score 1).`,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    console.error('[api/interviews/hint] failed', e)
    return NextResponse.json({ error: 'Failed to get hint', detail: String(e?.message || e) }, { status: 500 })
  }
}
