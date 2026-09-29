export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getInterviewSessionFull, saveInterviewSession, getCustomOrBankQuestion } from '@/lib/interview/store.ts'
import { evaluateAnswer } from '@/lib/interview/evaluator.ts'
import { gatewayCallLlm, estimateCostInr } from '@/lib/interview/llmGateway.ts'
import { buildInterviewerSystemPrompt } from '@/lib/interview/prompts.ts'
import { scanAndSanitizeStudentInput, checkContentSafety, wrapStudentAnswerDelimiter } from '@/lib/interview/redaction.ts'
import { advanceBlueprint, adaptDifficulty } from '@/lib/interview/blueprint.ts'
import { randomUUID } from 'crypto'
import type { InterviewTurn } from '@/lib/interview/types.ts'
import { getServerClient } from '@/lib/supabaseServer.ts'

/**
 * POST /api/interviews/{id}/turns
 * Every turn is dual-persisted: local JSON + Supabase (no data loss).
 */

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const sb = getServerClient()
    const url = new URL(req.url)

    const session = await getInterviewSessionFull(params.id, sb)
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

    if (['REPORT_READY', 'EVALUATING', 'ABANDONED', 'TERMINATED'].includes(session.state)) {
      return NextResponse.json({ error: `Interview already ended in state ${session.state}` }, { status: 409 })
    }

    if (session.state === 'PAUSED') {
      return NextResponse.json({ error: 'Session is paused. Resume first.' }, { status: 409 })
    }

    const body = await req.json()
    const { text, input_mode, code_snapshot, language, skip, integrity_event } = body

    const currentQuestionId = session.blueprint.current_question_id
    if (!currentQuestionId) {
      return NextResponse.json({ error: 'No current question' }, { status: 400 })
    }

    const question = getCustomOrBankQuestion(session, currentQuestionId)
    if (!question) {
      return NextResponse.json({ error: 'Question not found in bank' }, { status: 404 })
    }

    if (integrity_event) {
      session.integrity_events.push({
        id: `ie_${randomUUID().slice(0, 6)}`,
        session_id: session.id,
        type: integrity_event.type || 'tab_switch',
        details: String(integrity_event.details || '').slice(0, 300),
        timestamp: new Date().toISOString(),
      })
    }

    const now = new Date().toISOString()
    let studentText = String(text || '').slice(0, 5000)
    let isSkipped = !!skip

    if (!isSkipped) {
      const safety = checkContentSafety(studentText)
      if (!safety.safe) {
        session.abuse_strikes += 1
        session.integrity_events.push({
          id: `ie_${randomUUID().slice(0, 6)}`,
          session_id: session.id,
          type: safety.abusive ? 'off_topic' : 'off_topic',
          details: safety.reason || 'Unsafe/off-topic input',
          timestamp: now,
        })
        if (session.abuse_strikes >= 3) {
          session.state = 'TERMINATED'
          session.ended_at = now
          await saveInterviewSession(session, sb, { persistIntegrity: true })
          return NextResponse.json({
            error: 'Session terminated due to repeated policy violations',
            state: session.state,
            interviewer_reply: 'This session has been terminated due to repeated policy violations. Please start a new attempt with respectful communication.',
          }, { status: 403 })
        }
        if (safety.abusive) {
          studentText = '[Redacted abusive content]'
        }
      }

      const injection = scanAndSanitizeStudentInput(studentText)
      if (injection.detected) {
        session.integrity_events.push({
          id: `ie_${randomUUID().slice(0, 6)}`,
          session_id: session.id,
          type: 'prompt_injection',
          details: injection.reasons.join('; ').slice(0, 300),
          timestamp: now,
        })
        studentText = injection.sanitized
      }
    }

    const studentTurn: InterviewTurn = {
      id: `t_${randomUUID().slice(0, 8)}`,
      session_id: session.id,
      section: question.section,
      question_id: question.id,
      role: 'student',
      text: isSkipped ? '[SKIPPED]' : studentText,
      hint_level: session.hints_by_question[question.id] || 0,
      input_mode: input_mode || 'text',
      code_snapshot: code_snapshot ? String(code_snapshot).slice(0, 5000) : undefined,
      code_language: language,
      timestamp: now,
    }
    session.turns.push(studentTurn)

    if (isSkipped) {
      session.skipped_questions.push(question.id)
    }

    const hintsUsed = session.hints_by_question[question.id] || 0
    let codeSubmission = code_snapshot
    let testResults: any = undefined

    if (question.type === 'coding') {
      const latestSub = [...session.code_submissions].reverse().find(s => s.question_id === question.id)
      if (latestSub) {
        testResults = { passed: latestSub.passed, total: latestSub.total, results: latestSub.test_results }
        if (!codeSubmission) codeSubmission = latestSub.code
      }
    }

    const evaluation = await evaluateAnswer(question, isSkipped ? '' : studentText, hintsUsed, {
      codeSubmission,
      testResults,
      language,
    })

    session.evaluations.push(evaluation)

    const lastRubric = evaluation.competency_scores.technical_knowledge || 3
    session.blueprint = adaptDifficulty(session.blueprint, lastRubric)

    session.blueprint = advanceBlueprint(session.blueprint)

    if (session.blueprint.current_question_id) {
      const nextQ = getCustomOrBankQuestion(session, session.blueprint.current_question_id)
      if (nextQ) {
        session.state = session.blueprint.sections[session.blueprint.active_section_index]?.state as any || session.state
      }
    } else {
      if (session.state !== 'WRAP_UP') {
        session.state = 'WRAP_UP'
      } else {
        session.state = 'EVALUATING'
      }
    }

    if (session.started_at) {
      const started = new Date(session.started_at).getTime()
      const elapsed = (Date.now() - started) / 1000 - session.total_paused_sec
      session.duration_sec = Math.max(0, Math.round(elapsed))
    }

    let interviewerReply = ''
    let llmLatency = 0

    if (session.state === 'EVALUATING' || !session.blueprint.current_question_id) {
      interviewerReply = `Thank you, ${session.student_name ? session.student_name.split(' ')[0] : 'there'}! That wraps up our interview. I'm now generating your detailed report with scores, evidence-backed feedback, and a personalized 2-week learning plan. You'll see it in a moment. Great effort today!`
    } else {
      const nextQuestion = getCustomOrBankQuestion(session, session.blueprint.current_question_id)
      if (nextQuestion) {
        const timeLeft = `${nextQuestion.time_limit_min} min`
        const systemPrompt = buildInterviewerSystemPrompt({
          year: session.year,
          track: session.track,
          mode: session.mode,
          languageStyle: session.language_style,
          currentQuestion: nextQuestion.prompt,
          keyPointsHidden: nextQuestion.key_points,
          hintLadder: nextQuestion.hint_ladder,
          timeLeft,
          sectionLabel: session.blueprint.sections[session.blueprint.active_section_index]?.label || nextQuestion.section,
          followUpsAsked: session.blueprint.follow_ups_asked,
          maxFollowUps: session.blueprint.max_follow_ups_per_question,
          studentName: session.student_name,
          projectContext: session.project_context?.redacted_text || null,
          transcriptSummary: session.turns.slice(-6).map(t => `${t.role}: ${t.text.slice(0, 100)}`).join(' | ').slice(0, 500),
          lastStudentAnswer: studentText.slice(0, 200),
        })

        const recentTurns = session.turns.slice(-8).map(t => ({
          role: t.role === 'interviewer' ? 'assistant' as const : 'user' as const,
          content: t.role === 'student' ? wrapStudentAnswerDelimiter(t.text).delimited : t.text,
        }))

        const messages = [
          { role: 'system' as const, content: systemPrompt },
          ...recentTurns,
          ...(session.blueprint.follow_ups_asked === 0
            ? [{ role: 'user' as const, content: `<student_answer>Ready for next question in ${nextQuestion.section}</student_answer>` }]
            : []),
        ]

        try {
          const llmRes = await gatewayCallLlm(messages, { temperature: 0.6, maxTokens: 220, timeoutMs: 12000 })
          if (llmRes) {
            interviewerReply = llmRes.text
            llmLatency = llmRes.latencyMs
            if (llmRes.usage) {
              session.token_usage.prompt_tokens += llmRes.usage.prompt_tokens || 0
              session.token_usage.completion_tokens += llmRes.usage.completion_tokens || 0
              session.token_usage.cached_tokens += llmRes.usage.cached_tokens || 0
              session.token_usage.estimated_cost_inr += estimateCostInr(llmRes.usage.prompt_tokens || 0, llmRes.usage.completion_tokens || 0)
            }
          }
        } catch (e) {
          console.error('[interview turns] LLM interviewer failed', e)
        }

        if (!interviewerReply) {
          interviewerReply = nextQuestion.prompt
        }
      }
    }

    const interviewerTurn: InterviewTurn = {
      id: `t_${randomUUID().slice(0, 8)}`,
      session_id: session.id,
      section: (getCustomOrBankQuestion(session, session.blueprint.current_question_id)?.section || question.section) as any,
      question_id: session.blueprint.current_question_id || question.id,
      role: 'interviewer',
      text: interviewerReply,
      is_follow_up: false,
      timestamp: new Date().toISOString(),
      latency_ms: llmLatency,
    }
    session.turns.push(interviewerTurn)

    // Dual-write: session + latest turn + evaluation + integrity
    await saveInterviewSession(session, sb, { persistTurns: true, persistEvals: true, persistIntegrity: true })

    return NextResponse.json({
      student_turn: studentTurn,
      interviewer_reply: interviewerReply,
      evaluation: {
        question_id: evaluation.question_id,
        competency_scores: evaluation.competency_scores,
        strengths: evaluation.strengths,
        gaps: evaluation.gaps,
        confidence: evaluation.confidence,
        low_confidence: evaluation.low_confidence,
      },
      next_question_id: session.blueprint.current_question_id || null,
      next_section: session.blueprint.sections[session.blueprint.active_section_index]?.id || null,
      state: session.state,
      blueprint_progress: {
        active_section_index: session.blueprint.active_section_index,
        active_question_index: session.blueprint.active_question_index,
        total_sections: session.blueprint.sections.length,
        current_section_questions: session.blueprint.sections[session.blueprint.active_section_index]?.question_ids.length || 0,
      },
      token_usage: session.token_usage,
      latency_ms: llmLatency,
    })
  } catch (e: any) {
    console.error('[api/interviews/turns] failed', e)
    return NextResponse.json({ error: 'Failed to process turn', detail: String(e?.message || e) }, { status: 500 })
  }
}
