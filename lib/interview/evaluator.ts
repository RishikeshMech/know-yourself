/**
 * AI Mock Interview — Grounded Evaluator (Section 10.3, 10.7, 9.4)
 *
 * Implements:
 *   - Each bank question stores reference answer, key points checklist, common mistakes
 *   - Evaluator receives key-points checklist and marks each as covered/partially/missing with quotes
 *   - For code, correctness comes from test results, not LLM opinion
 *   - Questions created by variants checked against template's reference solution
 *   - Server-side final score calculation, clamp ranges, ignore LLM score fields outside schema
 *
 * Two engines:
 *   - deepseek: uses gatewayCallLlmJson with strict JSON schema, validated
 *   - grounded-heuristic: deterministic fallback when no API key or LLM fails
 */

import { gatewayCallLlmJson } from './llmGateway.ts'
import { buildEvaluatorSystemPrompt, buildEvaluatorUserPrompt } from './prompts.ts'
import { applyHintPenalty } from './scoring.ts'
import { wrapStudentAnswerDelimiter } from './redaction.ts'
import type { AnswerEvaluation, CompetencyKey, InterviewQuestion, KeyPointEvaluation } from './types.ts'
import { randomUUID } from 'crypto'

function clampRubric(n: number): number {
  const v = Math.round(Number(n))
  if (!Number.isFinite(v)) return 3
  return Math.max(1, Math.min(5, v))
}

function normalizeCompetencyScores(raw: any, isCoding: boolean, isBehavioural: boolean): Partial<Record<CompetencyKey, number>> {
  const out: Partial<Record<CompetencyKey, number>> = {}
  const src = raw?.competency_scores || raw || {}

  const trySet = (key: CompetencyKey, aliases: string[]) => {
    for (const alias of aliases) {
      const v = src[alias] ?? src[alias.toLowerCase()] ?? src[key]
      if (v !== undefined) {
        out[key] = clampRubric(Number(v))
        return
      }
    }
  }

  trySet('technical_knowledge', ['technical_knowledge', 'technical', 'knowledge'])
  trySet('problem_solving', ['problem_solving', 'problem-solving', 'problemsolving'])
  trySet('communication', ['communication', 'clarity'])
  if (isCoding) trySet('code_quality', ['code_quality', 'code', 'correctness'])
  if (isBehavioural) trySet('behavioural', ['behavioural', 'behavioral', 'professionalism'])

  // Ensure at least technical_knowledge and communication
  if (out.technical_knowledge === undefined) out.technical_knowledge = 3
  if (out.communication === undefined) out.communication = 3

  return out
}

function normalizeKeyPoints(raw: any, expectedPoints: string[], studentAnswer: string): KeyPointEvaluation[] {
  const rawPoints = Array.isArray(raw?.key_points) ? raw.key_points : []
  const out: KeyPointEvaluation[] = []

  // Map by point text similarity
  for (const expected of expectedPoints) {
    const found = rawPoints.find((rp: any) => {
      const p = String(rp?.point || '').toLowerCase()
      const e = expected.toLowerCase()
      return p.includes(e.slice(0, 15)) || e.includes(p.slice(0, 15))
    })

    if (found) {
      const status = ['covered', 'partially', 'missing'].includes(found.status) ? found.status : 'missing'
      const evidence = typeof found.evidence === 'string' && found.evidence.trim() ? found.evidence.slice(0, 200) : null
      out.push({ point: expected, status: status as any, evidence })
    } else {
      // Heuristic: check if expected point keywords appear in answer
      const keywords = expected.toLowerCase().split(/\s+/).filter(w => w.length > 3).slice(0, 3)
      const lowerAns = studentAnswer.toLowerCase()
      const matches = keywords.filter(k => lowerAns.includes(k)).length
      if (matches >= 2) {
        out.push({ point: expected, status: 'partially', evidence: studentAnswer.slice(0, 120) })
      } else if (matches === 1) {
        out.push({ point: expected, status: 'partially', evidence: studentAnswer.slice(0, 80) })
      } else {
        out.push({ point: expected, status: 'missing', evidence: null })
      }
    }
  }

  return out
}

/**
 * Heuristic evaluator — grounded, deterministic, no LLM.
 * Used when DeepSeek key not configured or call fails.
 */
export function heuristicEvaluate(
  question: InterviewQuestion,
  studentAnswer: string,
  hintsUsed: 0 | 1 | 2 | 3,
  codeSubmission?: string,
  testResults?: { passed: number; total: number },
): Omit<AnswerEvaluation, 'question_id' | 'question_prompt' | 'section' | 'topic' | 'evaluated_at'> {
  const answer = String(studentAnswer || '').trim()
  const lower = answer.toLowerCase()
  const words = answer.split(/\s+/).filter(Boolean).length

  // Empty or trivial
  if (!answer || words < 3 || /^(i don't know|idk|no idea|skip)$/i.test(answer)) {
    return {
      skipped: !answer ? true : false,
      hints_used: hintsUsed,
      hint_penalty: applyHintPenalty(1, hintsUsed).penalty,
      raw_competency_scores: { technical_knowledge: 1, communication: 1 },
      competency_scores: { technical_knowledge: 1, communication: 1 },
      key_points: question.key_points.map(kp => ({ point: kp, status: 'missing' as const, evidence: null })),
      strengths: [],
      gaps: question.key_points.slice(0, 2),
      student_quote: answer.slice(0, 80) || '(no answer)',
      model_answer: question.reference_answer,
      model_answer_hint: `Review: ${question.key_points[0]}`,
      confidence: 0.9,
      low_confidence: false,
      evaluator_engine: 'grounded-heuristic',
    }
  }

  // Score based on key point coverage
  let covered = 0
  let partially = 0
  const keyEvals: KeyPointEvaluation[] = question.key_points.map(kp => {
    const kws = kp.toLowerCase().split(/\s+/).filter(w => w.length > 3).slice(0, 4)
    const matchCount = kws.filter(kw => lower.includes(kw)).length
    if (matchCount >= 3) {
      covered++
      return { point: kp, status: 'covered' as const, evidence: answer.slice(0, 150) }
    }
    if (matchCount >= 1) {
      partially++
      return { point: kp, status: 'partially' as const, evidence: answer.slice(0, 120) }
    }
    return { point: kp, status: 'missing' as const, evidence: null }
  })

  // Base rubric from coverage
  const totalPoints = question.key_points.length || 1
  const coverageRatio = (covered + partially * 0.5) / totalPoints
  let baseScore = 1
  if (coverageRatio >= 0.85) baseScore = 5
  else if (coverageRatio >= 0.65) baseScore = 4
  else if (coverageRatio >= 0.4) baseScore = 3
  else if (coverageRatio >= 0.15) baseScore = 2

  // Adjust for answer length and structure
  if (words < 15 && baseScore > 2) baseScore = 2
  if (words > 60 && baseScore < 4 && covered >= 2) baseScore = Math.min(4, baseScore + 1)

  // Common mistakes detection
  const hasCommonMistake = question.common_mistakes.some(cm => {
    const kws = cm.toLowerCase().split(/\s+/).filter(w => w.length > 4).slice(0, 2)
    return kws.length && kws.every(kw => lower.includes(kw))
  })
  if (hasCommonMistake && baseScore > 2) baseScore = Math.max(2, baseScore - 1)

  const isCoding = question.type === 'coding'
  const isBehavioural = question.type === 'behavioural' || question.section === 'behavioural'

  const rawScores: Partial<Record<CompetencyKey, number>> = {}
  rawScores.technical_knowledge = baseScore
  rawScores.communication = words >= 20 && answer.includes('.') ? Math.min(5, baseScore + 1) : baseScore
  if (isCoding || question.section === 'problem_solving') {
    rawScores.problem_solving = baseScore
    if (testResults) {
      const ratio = testResults.total ? testResults.passed / testResults.total : 0
      rawScores.code_quality = ratio >= 0.9 ? 5 : ratio >= 0.6 ? 4 : ratio >= 0.3 ? 3 : ratio > 0 ? 2 : 1
    } else {
      rawScores.code_quality = baseScore
    }
  }
  if (isBehavioural) {
    rawScores.behavioural = /situation|task|action|result|learned|STAR/i.test(answer) ? Math.min(5, baseScore + 1) : baseScore
  }

  // Apply hint penalty
  const penalized: Partial<Record<CompetencyKey, number>> = {}
  let maxPenalty = 0
  for (const [k, v] of Object.entries(rawScores)) {
    const { penalized: p, penalty } = applyHintPenalty(v as number, hintsUsed)
    penalized[k as CompetencyKey] = p
    maxPenalty = Math.max(maxPenalty, penalty)
  }

  const strengths = keyEvals.filter(k => k.status === 'covered').map(k => k.point).slice(0, 2)
  const gaps = keyEvals.filter(k => k.status !== 'covered').map(k => k.point).slice(0, 2)

  return {
    skipped: false,
    hints_used: hintsUsed,
    hint_penalty: maxPenalty,
    raw_competency_scores: rawScores,
    competency_scores: penalized,
    key_points: keyEvals,
    strengths: strengths.length ? strengths : words > 20 ? ['Attempted explanation'] : [],
    gaps: gaps.length ? gaps : ['Needs more depth'],
    student_quote: answer.slice(0, 120),
    model_answer: question.reference_answer,
    model_answer_hint: `Focus on: ${question.key_points[0]}`,
    ...(isCoding && codeSubmission
      ? {
          code_review: {
            language: 'python' as any,
            code: codeSubmission.slice(0, 1000),
            tests_passed: testResults?.passed || 0,
            tests_total: testResults?.total || 0,
            complexity_note: 'Heuristic: check complexity in report',
            readability_note: codeSubmission.length > 200 ? 'Decent length, check naming' : 'Could be more readable',
          },
        }
      : {}),
    confidence: words < 10 ? 0.5 : 0.75,
    low_confidence: words < 10,
    evaluator_engine: 'grounded-heuristic',
  }
}

/**
 * Main evaluation entry — tries DeepSeek first, falls back to heuristic.
 */
export async function evaluateAnswer(
  question: InterviewQuestion,
  studentAnswer: string,
  hintsUsed: 0 | 1 | 2 | 3 = 0,
  opts: {
    codeSubmission?: string
    testResults?: { passed: number; total: number; results: any[] }
    language?: string
  } = {},
): Promise<AnswerEvaluation> {
  const isCoding = question.type === 'coding'
  const isBehavioural = question.type === 'behavioural' || question.section === 'behavioural'

  // Redact PII and wrap in delimiter (Section 10.5)
  const wrapped = wrapStudentAnswerDelimiter(studentAnswer)

  // Try LLM evaluator
  const systemPrompt = buildEvaluatorSystemPrompt()
  const userPrompt = buildEvaluatorUserPrompt({
    questionId: question.id,
    questionPrompt: question.prompt,
    referenceAnswer: question.reference_answer,
    keyPoints: question.key_points,
    commonMistakes: question.common_mistakes,
    topic: question.topic,
    section: question.section,
    studentAnswer: wrapped.delimited,
    hintsUsed,
    isCoding,
    codeSubmission: opts.codeSubmission,
    testResults: opts.testResults,
    language: opts.language,
  })

  let llmResult: any = null
  let engine: 'deepseek' | 'grounded-heuristic' = 'grounded-heuristic'
  let rawUsage: any = null

  try {
    const res = await gatewayCallLlmJson(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { temperature: 0.1, maxTokens: 900, timeoutMs: 20000 },
    )
    if (res && res.parsed) {
      llmResult = res.parsed
      engine = 'deepseek'
      rawUsage = res.raw.usage
    }
  } catch (e) {
    console.error('[interview-evaluator] LLM call failed, using heuristic:', e)
  }

  if (llmResult) {
    // Validate and normalize LLM output — server-side clamping per Section 10.5
    try {
      const competencyScores = normalizeCompetencyScores(llmResult, isCoding, isBehavioural)
      const keyPoints = normalizeKeyPoints(llmResult, question.key_points, studentAnswer)

      // Apply hint penalty server-side (Section 9.4)
      const penalizedScores: Partial<Record<CompetencyKey, number>> = {}
      let maxPenalty = 0
      for (const [k, v] of Object.entries(competencyScores)) {
        const { penalized, penalty } = applyHintPenalty(v as number, hintsUsed)
        penalizedScores[k as CompetencyKey] = penalized
        maxPenalty = Math.max(maxPenalty, penalty)
      }

      const strengths = Array.isArray(llmResult.strengths) ? llmResult.strengths.slice(0, 3).map(String) : []
      const gaps = Array.isArray(llmResult.gaps) ? llmResult.gaps.slice(0, 3).map(String) : []
      const studentQuote = typeof llmResult.student_quote === 'string' ? llmResult.student_quote.slice(0, 200) : studentAnswer.slice(0, 120)
      const confidence = typeof llmResult.confidence === 'number' ? Math.max(0, Math.min(1, llmResult.confidence)) : 0.75

      return {
        question_id: question.id,
        question_prompt: question.prompt,
        section: question.section,
        topic: question.topic,
        skipped: false,
        hints_used: hintsUsed,
        hint_penalty: maxPenalty,
        raw_competency_scores: competencyScores,
        competency_scores: penalizedScores,
        key_points: keyPoints,
        strengths,
        gaps,
        student_quote: studentQuote,
        model_answer: question.reference_answer,
        model_answer_hint: typeof llmResult.model_answer_hint === 'string' ? llmResult.model_answer_hint : `Review: ${question.key_points[0]}`,
        ...(isCoding && opts.codeSubmission
          ? {
              code_review: {
                language: (opts.language as any) || 'python',
                code: opts.codeSubmission.slice(0, 1500),
                tests_passed: opts.testResults?.passed || 0,
                tests_total: opts.testResults?.total || 0,
                complexity_note: llmResult.code_review?.complexity_note || 'Check time/space complexity',
                readability_note: llmResult.code_review?.readability_note || 'Check naming and structure',
              },
            }
          : {}),
        confidence,
        low_confidence: confidence < 0.6,
        evaluator_engine: engine,
        evaluated_at: new Date().toISOString(),
      }
    } catch (e) {
      console.error('[interview-evaluator] LLM output validation failed, fallback to heuristic:', e, llmResult)
      // fall through to heuristic
    }
  }

  // Heuristic fallback
  const heuristic = heuristicEvaluate(question, studentAnswer, hintsUsed, opts.codeSubmission, opts.testResults)
  return {
    question_id: question.id,
    question_prompt: question.prompt,
    section: question.section,
    topic: question.topic,
    evaluated_at: new Date().toISOString(),
    ...heuristic,
  }
}
