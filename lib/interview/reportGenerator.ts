/**
 * AI Mock Interview — Report Generator (Appendix B & Section 9)
 *
 * Produces explainable, evidence-backed report:
 *   - Overall readiness score, band, mode, date, duration
 *   - Radar chart data: technical, problem solving, communication, code quality, behavioural
 *   - Top 3 strengths and improvements with transcript quotes
 *   - Question-by-question review: score, covered/missed, hints, model answer
 *   - Code review: tests passed, complexity, readability
 *   - Integrity info (neutral)
 *   - 2-week learning plan
 *   - Trend vs earlier attempts and cohort average
 *
 * All scores computed server-side, never trusted from LLM.
 */

import { computeCompetencyBreakdown, computeOverallScore, extractEvidencePoints, bandForScore } from './scoring.ts'
import { gatewayCallLlmJson } from './llmGateway.ts'
import { buildReportWriterPrompt } from './prompts.ts'
import type { InterviewReport, InterviewSession, AnswerEvaluation, CompetencyKey, LearningPlanItem, AttemptTrendPoint } from './types.ts'
import { randomUUID } from 'crypto'

const LEARNING_PLAN_TEMPLATES: Record<string, { label: string; href: string; actions: string[] }> = {
  technical_knowledge: {
    label: 'Practice fundamentals',
    href: '/company-assessments',
    actions: ['Review core concepts with flashcards', 'Solve 2 easy questions on this topic daily', 'Explain concept to a peer without notes'],
  },
  problem_solving: {
    label: 'DSA practice',
    href: '/company-assessments',
    actions: ['Solve 1 medium problem daily with complexity analysis', 'Practice edge case enumeration', 'Time-box solutions to 20 minutes'],
  },
  communication: {
    label: 'Communication drills',
    href: '/assessment',
    actions: ['Record yourself explaining a concept in 90s', 'Use STAR structure for all answers', 'Practice thinking aloud while coding'],
  },
  code_quality: {
    label: 'Code quality practice',
    href: '/company-assessments',
    actions: ['Run tests before submitting', 'Add comments for complex logic', 'Review readability: naming, functions'],
  },
  behavioural: {
    label: 'Behavioural prep',
    href: '/feedback',
    actions: ['Write STAR stories for top 5 behavioural questions', 'Practice with a friend', 'Reflect on failures and learnings'],
  },
}

function buildHeuristicLearningPlan(
  gaps: Array<{ competency: CompetencyKey; title: string }>,
  track: 'swe' | 'ai_ml',
): LearningPlanItem[] {
  const plan: LearningPlanItem[] = []
  const seen = new Set<string>()

  // Group gaps by competency
  const byComp = new Map<CompetencyKey, string[]>()
  for (const g of gaps) {
    const arr = byComp.get(g.competency) || []
    arr.push(g.title)
    byComp.set(g.competency, arr)
  }

  let day = 1
  for (const [comp, titles] of byComp) {
    if (seen.has(comp)) continue
    seen.add(comp)
    const template = LEARNING_PLAN_TEMPLATES[comp] || LEARNING_PLAN_TEMPLATES.technical_knowledge
    const dayRange = day === 1 ? 'Days 1-3' : day <= 3 ? `Days ${day}-${day + 2}` : `Days ${day}-${day + 3}`
    plan.push({
      day_range: dayRange,
      focus_topic: titles[0] || comp,
      competency: comp,
      why: `Gap observed: ${titles.slice(0, 2).join(', ')}`,
      action_items: template.actions,
      platform_link: { label: template.label, href: template.href },
    })
    day += 3
    if (plan.length >= 5) break
  }

  // Fill up to 5 if needed
  const remainingComps: CompetencyKey[] = ['technical_knowledge', 'problem_solving', 'communication', 'code_quality', 'behavioural'].filter(
    c => !seen.has(c),
  ) as any
  for (const comp of remainingComps) {
    if (plan.length >= 5) break
    const template = LEARNING_PLAN_TEMPLATES[comp]
    plan.push({
      day_range: `Days ${day}-${day + 2}`,
      focus_topic: comp === 'technical_knowledge' ? (track === 'swe' ? 'DSA + OS/CN basics' : 'ML fundamentals + metrics') : comp,
      competency: comp,
      why: 'Strengthen overall readiness',
      action_items: template.actions,
      platform_link: { label: template.label, href: template.href },
    })
    day += 3
  }

  return plan.slice(0, 6)
}

export interface GenerateReportOptions {
  session: InterviewSession
  previousReports: InterviewReport[] // for trend
  cohortAverage?: number
}

export async function generateInterviewReport(opts: GenerateReportOptions): Promise<InterviewReport> {
  const { session, previousReports, cohortAverage = 62 } = opts
  const hasCoding = session.blueprint.sections.some(s => s.id === 'problem_solving') && session.code_submissions.length > 0

  // Compute competency breakdown server-side
  const competencies = computeCompetencyBreakdown(session.evaluations, hasCoding)
  const overallScore = computeOverallScore(competencies)
  const { band, meaning } = bandForScore(overallScore)

  const strengths = extractEvidencePoints(session.evaluations, 'strength', 3)
  const improvements = extractEvidencePoints(session.evaluations, 'improvement', 3)

  // Low confidence check
  const lowConfidenceCount = session.evaluations.filter(ev => ev.low_confidence).length
  const lowConfidenceWarning = lowConfidenceCount >= Math.ceil(session.evaluations.length * 0.4)

  // Build trend
  const sortedPrev = [...previousReports].sort((a, b) => new Date(a.completed_at).getTime() - new Date(b.completed_at).getTime())
  const trendAttempts: AttemptTrendPoint[] = sortedPrev.map(r => ({
    attempt_number: r.attempt_number,
    session_id: r.session_id,
    date: r.completed_at,
    track: r.track,
    mode: r.mode,
    overall_score: r.overall_score,
    band: r.band,
  }))

  // Add current as last point for trend calc (but not yet in previousReports)
  const allAttemptsForImprovement = [...trendAttempts, { attempt_number: session.attempt_number, overall_score: overallScore } as any]
  const improvementFromFirst = allAttemptsForImprovement.length > 1 ? overallScore - allAttemptsForImprovement[0].overall_score : null

  // Try AI report writer for summary and learning plan
  let aiSummary = `${band} — ${meaning} Overall ${overallScore}/100. ${strengths.length ? `Strengths: ${strengths.map(s => s.title).join(', ')}.` : ''} ${improvements.length ? `Focus: ${improvements.map(i => i.title).join(', ')}.` : ''}`
  let learningPlan: LearningPlanItem[] = buildHeuristicLearningPlan(
    improvements.map(i => ({ competency: i.competency, title: i.title })),
    session.track,
  )

  try {
    const prompt = buildReportWriterPrompt({
      studentName: session.student_name,
      track: session.track,
      year: session.year,
      mode: session.mode,
      overallScore,
      band,
      competencies: competencies.map(c => ({ key: c.key, label: c.label, avg_rubric: c.avg_rubric, score_100: c.score_100 })),
      strengths: strengths.map(s => ({ title: s.title, quote: s.quote })),
      improvements: improvements.map(i => ({ title: i.title, quote: i.quote })),
      questionReviews: session.evaluations.map(ev => ({
        question: ev.question_prompt,
        score: ev.competency_scores.technical_knowledge || 3,
        strengths: ev.strengths,
        gaps: ev.gaps,
      })),
      durationMin: Math.round(session.duration_sec / 60),
      attemptNumber: session.attempt_number,
    })

    const res = await gatewayCallLlmJson(
      [
        { role: 'system', content: 'You are a career coach writing interview reports. Return JSON only.' },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.4, maxTokens: 1200 },
    )

    if (res?.parsed) {
      if (typeof res.parsed.ai_summary === 'string' && res.parsed.ai_summary.length > 20) {
        aiSummary = res.parsed.ai_summary.slice(0, 600)
      }
      if (Array.isArray(res.parsed.learning_plan) && res.parsed.learning_plan.length > 0) {
        const parsedPlan = res.parsed.learning_plan
          .slice(0, 6)
          .map((item: any) => ({
            day_range: String(item.day_range || 'Days 1-3'),
            focus_topic: String(item.focus_topic || 'Review fundamentals'),
            competency: (['technical_knowledge', 'problem_solving', 'communication', 'code_quality', 'behavioural'].includes(item.competency)
              ? item.competency
              : 'technical_knowledge') as CompetencyKey,
            why: String(item.why || 'Based on observed gaps'),
            action_items: Array.isArray(item.action_items) ? item.action_items.slice(0, 3).map(String) : ['Practice daily'],
            platform_link: {
              label: String(item.platform_link?.label || 'Practice'),
              href: String(item.platform_link?.href || '/company-assessments'),
            },
          }))
        if (parsedPlan.length) learningPlan = parsedPlan
      }
    }
  } catch (e) {
    console.error('[interview-report] AI summary failed, using heuristic:', e)
  }

  const report: InterviewReport = {
    id: `rpt_${randomUUID().slice(0, 8)}`,
    session_id: session.id,
    student_id: session.student_id,
    attempt_number: session.attempt_number,
    track: session.track,
    year: session.year,
    mode: session.mode,
    language_style: session.language_style,
    overall_score: overallScore,
    band,
    band_meaning: meaning,
    has_coding: hasCoding,
    duration_sec: session.duration_sec,
    started_at: session.started_at || session.created_at,
    completed_at: session.ended_at || new Date().toISOString(),
    competencies,
    top_strengths: strengths,
    top_improvements: improvements,
    question_reviews: session.evaluations,
    integrity_events: session.integrity_events,
    learning_plan: learningPlan,
    trend: {
      attempts: trendAttempts,
      improvement_from_first: improvementFromFirst,
      cohort_average: cohortAverage,
      cohort_percentile: overallScore >= cohortAverage ? 60 + Math.min(35, overallScore - cohortAverage) : Math.max(10, 60 - (cohortAverage - overallScore)),
    },
    low_confidence_warning: lowConfidenceWarning,
    ai_summary: aiSummary,
    model_versions: {
      interviewer: session.model_versions.interviewer,
      evaluator: session.model_versions.evaluator,
      engine: session.evaluations.some(ev => ev.evaluator_engine === 'deepseek') ? 'deepseek' : 'grounded-heuristic',
    },
    created_at: new Date().toISOString(),
  }

  return report
}
