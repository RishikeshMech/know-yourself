export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import {
  getInterviewSessionFull,
  saveInterviewSession,
  getCustomOrBankQuestion,
  buildSessionQuestionsPlan,
  buildContinuationInterviewerReply,
  ensureQuestionAskedInContinuation,
} from '@/lib/interview/store.ts'
import { formatTrackName } from '@/lib/interview/questionBank.ts'
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
 * Questions are asked in natural continuation with full question prompts
 * and complete session question plan returned on every turn.
 */

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const sb = getServerClient()
    const session = await getInterviewSessionFull(params.id, sb)
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

    if (['REPORT_READY', 'EVALUATING', 'ABANDONED', 'TERMINATED'].includes(session.state)) {
      return NextResponse.json({ error: `Interview already ended in state ${session.state}` }, { status: 409 })
    }

    if (session.state === 'PAUSED') {
      return NextResponse.json({ error: 'Session is paused. Resume first.' }, { status: 409 })
    }

    const body = await req.json()
    const { text, input_mode, code_snapshot, language, skip, ask_follow_up, integrity_event } = body

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
    const isSkipped = !!skip

    if (!isSkipped) {
      const safety = checkContentSafety(studentText)
      if (!safety.safe) {
        session.abuse_strikes += 1
        session.integrity_events.push({
          id: `ie_${randomUUID().slice(0, 6)}`,
          session_id: session.id,
          type: 'off_topic',
          details: safety.reason || 'Unsafe/off-topic input',
          timestamp: now,
        })
        if (session.abuse_strikes >= 3) {
          session.state = 'TERMINATED'
          session.ended_at = now
          await saveInterviewSession(session, sb, { persistIntegrity: true })
          return NextResponse.json(
            {
              error: 'Session terminated due to repeated policy violations',
              state: session.state,
              interviewer_reply:
                'This session has been terminated due to repeated policy violations. Please start a new attempt with respectful communication.',
            },
            { status: 403 },
          )
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

    // Combine all student turns on this question so follow-up answers enrich evaluation
    const allStudentAnswersForQuestion = session.turns
      .filter(t => t.role === 'student' && t.question_id === question.id && t.text !== '[SKIPPED]')
      .map(t => t.text)
      .join('\n')

    // Check if the user requested a follow-up in continuation on the same question
    const canFollowUp =
      !isSkipped &&
      !!ask_follow_up &&
      (session.blueprint.follow_ups_asked || 0) < (session.blueprint.max_follow_ups_per_question || 3) &&
      (question.follow_ups?.length || 0) > (session.blueprint.follow_ups_asked || 0)

    if (canFollowUp) {
      const followIdx = session.blueprint.follow_ups_asked || 0
      const followUpQuestionText = question.follow_ups[followIdx]
      session.blueprint.follow_ups_asked = followIdx + 1

      const followUpReply = `Good point! Let's build on your answer in continuation with a quick follow-up on ${question.topic.join(', ')}: ${followUpQuestionText}`
      const interviewerFollowTurn: InterviewTurn = {
        id: `t_${randomUUID().slice(0, 8)}`,
        session_id: session.id,
        section: question.section,
        question_id: question.id,
        role: 'interviewer',
        text: followUpReply,
        is_follow_up: true,
        follow_up_index: followIdx + 1,
        timestamp: new Date().toISOString(),
        latency_ms: 0,
      }
      session.turns.push(interviewerFollowTurn)
      await saveInterviewSession(session, sb, { persistTurns: true })

      const questionsPlan = buildSessionQuestionsPlan(session)
      const currentPlanItem = questionsPlan.find(item => item.id === question.id)

      return NextResponse.json({
        student_turn: studentTurn,
        interviewer_reply: followUpReply,
        is_follow_up: true,
        follow_up_index: followIdx + 1,
        next_question_id: question.id,
        current_question: {
          id: question.id,
          question_number: currentPlanItem?.question_number || 1,
          total_questions: questionsPlan.length || 1,
          prompt: question.prompt,
          topic: question.topic,
          type: question.type,
          section: question.section,
          section_label: currentPlanItem?.section_label || question.section,
          difficulty: question.difficulty,
          time_limit_min: question.time_limit_min,
          hint_ladder: question.hint_ladder,
          follow_ups: question.follow_ups,
          coding_spec: question.coding_spec,
        },
        questions_plan: questionsPlan,
        next_section: question.section,
        state: session.state,
        blueprint_progress: {
          active_section_index: session.blueprint.active_section_index,
          active_question_index: session.blueprint.active_question_index,
          total_sections: session.blueprint.sections.length,
          current_section_questions:
            session.blueprint.sections[session.blueprint.active_section_index]?.question_ids.length || 0,
        },
        token_usage: session.token_usage,
        latency_ms: 0,
      })
    }

    if (isSkipped && !session.skipped_questions.includes(question.id)) {
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

    const evaluation = await evaluateAnswer(
      question,
      isSkipped ? '' : allStudentAnswersForQuestion || studentText,
      hintsUsed,
      {
        codeSubmission,
        testResults,
        language,
      },
    )

    // Replace existing evaluation for this question if re-evaluated after follow-up, else push
    const existingEvalIdx = session.evaluations.findIndex(ev => ev.question_id === question.id)
    if (existingEvalIdx >= 0) {
      session.evaluations[existingEvalIdx] = evaluation
    } else {
      session.evaluations.push(evaluation)
    }

    const previousSectionId = question.section
    const lastRubric = evaluation.competency_scores.technical_knowledge || 3
    session.blueprint = adaptDifficulty(session.blueprint, lastRubric)
    session.blueprint = advanceBlueprint(session.blueprint)

    if (session.blueprint.current_question_id) {
      const nextQ = getCustomOrBankQuestion(session, session.blueprint.current_question_id)
      if (nextQ) {
        session.state = (session.blueprint.sections[session.blueprint.active_section_index]?.state as any) || session.state
      }
    } else {
      session.state = 'EVALUATING'
    }

    if (session.started_at) {
      const started = new Date(session.started_at).getTime()
      const elapsed = (Date.now() - started) / 1000 - session.total_paused_sec
      session.duration_sec = Math.max(0, Math.round(elapsed))
    }

    const questionsPlanBeforeReply = buildSessionQuestionsPlan(session)
    const totalQuestions = questionsPlanBeforeReply.length || 1
    let interviewerReply = ''
    let llmLatency = 0
    const trackName = formatTrackName(session.track)

    if (session.state === 'EVALUATING' || !session.blueprint.current_question_id) {
      const firstName = session.student_name ? session.student_name.trim().split(/\s+/)[0] : 'there'
      interviewerReply = `Thank you, ${firstName}! That completes all ${totalQuestions} questions in your ${trackName} mock interview. I am now generating your detailed readiness report with competency scores, evidence-backed feedback on every question, and a personalized 2-week learning plan. Great effort today!`
    } else {
      const nextQuestion = getCustomOrBankQuestion(session, session.blueprint.current_question_id)
      if (nextQuestion) {
        const nextPlanItem = questionsPlanBeforeReply.find(item => item.id === nextQuestion.id)
        const nextQNum = nextPlanItem?.question_number || 1
        const nextSectionLabel =
          session.blueprint.sections[session.blueprint.active_section_index]?.label || nextQuestion.section
        const sameSection = previousSectionId === nextQuestion.section

        const fallbackContinuationReply = buildContinuationInterviewerReply({
          session,
          previousQuestion: question,
          studentText,
          isSkipped,
          evaluation,
          nextQuestion,
          nextQuestionNumber: nextQNum,
          totalQuestions,
          nextSectionLabel,
          sameSection,
        })

        const timeLeft = `${nextQuestion.time_limit_min} min`
        const systemPrompt =
          buildInterviewerSystemPrompt({
            year: session.year,
            track: session.track,
            mode: session.mode,
            languageStyle: session.language_style,
            currentQuestion: nextQuestion.prompt,
            keyPointsHidden: nextQuestion.key_points,
            hintLadder: nextQuestion.hint_ladder,
            timeLeft,
            sectionLabel: nextSectionLabel,
            followUpsAsked: session.blueprint.follow_ups_asked,
            maxFollowUps: session.blueprint.max_follow_ups_per_question,
            studentName: session.student_name,
            projectContext: session.project_context?.redacted_text || null,
            transcriptSummary: session.turns
              .slice(-6)
              .map(t => `${t.role}: ${t.text.slice(0, 100)}`)
              .join(' | ')
              .slice(0, 500),
            lastStudentAnswer: studentText.slice(0, 200),
          }) +
          `\n\nCONTINUATION INSTRUCTION (CRITICAL):
- The student just answered Question ${ Math.max(1, nextQNum - 1) } ("${question.prompt}").
- First, in 1-2 natural sentences, acknowledge their answer in continuation.
- Then explicitly transition to Question ${nextQNum} of ${totalQuestions} (${nextSectionLabel}) on the ${trackName} track and state the full question verbatim: "${nextQuestion.prompt}".`

        const recentTurns = session.turns.slice(-6).map(t => ({
          role: t.role === 'interviewer' ? ('assistant' as const) : ('user' as const),
          content: t.role === 'student' ? wrapStudentAnswerDelimiter(t.text).delimited : t.text,
        }))

        const messages = [{ role: 'system' as const, content: systemPrompt }, ...recentTurns]

        try {
          const llmRes = await gatewayCallLlm(messages, { temperature: 0.5, maxTokens: 240, timeoutMs: 12000 })
          if (llmRes?.text) {
            interviewerReply = ensureQuestionAskedInContinuation(
              llmRes.text,
              fallbackContinuationReply,
              nextQuestion,
              nextQNum,
              totalQuestions,
              nextSectionLabel,
              session.track,
            )
            llmLatency = llmRes.latencyMs
            if (llmRes.usage) {
              session.token_usage.prompt_tokens += llmRes.usage.prompt_tokens || 0
              session.token_usage.completion_tokens += llmRes.usage.completion_tokens || 0
              session.token_usage.cached_tokens += llmRes.usage.cached_tokens || 0
              session.token_usage.estimated_cost_inr += estimateCostInr(
                llmRes.usage.prompt_tokens || 0,
                llmRes.usage.completion_tokens || 0,
              )
            }
          }
        } catch (e) {
          console.error('[interview turns] LLM interviewer failed', e)
        }

        if (!interviewerReply) {
          interviewerReply = fallbackContinuationReply
        }
      }
    }

    const interviewerTurn: InterviewTurn = {
      id: `t_${randomUUID().slice(0, 8)}`,
      session_id: session.id,
      section: (getCustomOrBankQuestion(session, session.blueprint.current_question_id)?.section ||
        question.section) as any,
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

    const updatedQuestionsPlan = buildSessionQuestionsPlan(session)
    const nextQId = session.blueprint.current_question_id || ''
    const nextQObj = nextQId ? getCustomOrBankQuestion(session, nextQId) : null
    const nextPlanEntry = updatedQuestionsPlan.find(item => item.id === nextQId)

    const safeNextQuestion = nextQObj
      ? {
          id: nextQObj.id,
          question_number: nextPlanEntry?.question_number || 1,
          total_questions: updatedQuestionsPlan.length || 1,
          prompt: nextQObj.prompt,
          topic: nextQObj.topic,
          type: nextQObj.type,
          section: nextQObj.section,
          section_label: nextPlanEntry?.section_label || nextQObj.section,
          difficulty: nextQObj.difficulty,
          time_limit_min: nextQObj.time_limit_min,
          hint_ladder: nextQObj.hint_ladder,
          follow_ups: nextQObj.follow_ups,
          coding_spec: nextQObj.coding_spec
            ? {
                fn_name: nextQObj.coding_spec.fn_name,
                starter_code: nextQObj.coding_spec.starter_code,
                sample_input_output: nextQObj.coding_spec.sample_input_output,
                target_complexity: nextQObj.coding_spec.target_complexity,
              }
            : undefined,
        }
      : null

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
      current_question: safeNextQuestion,
      questions_plan: updatedQuestionsPlan,
      next_section: session.blueprint.sections[session.blueprint.active_section_index]?.id || null,
      state: session.state,
      blueprint_progress: {
        active_section_index: session.blueprint.active_section_index,
        active_question_index: session.blueprint.active_question_index,
        total_sections: session.blueprint.sections.length,
        current_section_questions:
          session.blueprint.sections[session.blueprint.active_section_index]?.question_ids.length || 0,
      },
      token_usage: session.token_usage,
      latency_ms: llmLatency,
    })
  } catch (e: any) {
    console.error('[api/interviews/turns] failed', e)
    return NextResponse.json({ error: 'Failed to process turn', detail: String(e?.message || e) }, { status: 500 })
  }
}
