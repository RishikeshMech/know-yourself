/**
 * AI Mock Interview — Scoring Model (Section 9)
 *
 * Competencies and weights:
 *   Technical knowledge 30% (40% without coding)
 *   Problem solving    25% (30% without coding)
 *   Communication      20%
 *   Code quality       15% (0% without coding)
 *   Behavioural        10%
 *
 * Anchored 1-5 scale per answer, hint penalties, server-side weighted sum.
 * Every final number computed server-side, never trusted from LLM.
 */

import type {
  AnswerEvaluation,
  CompetencyBreakdownItem,
  CompetencyKey,
  EvidencePoint,
  ReadinessBand,
} from './types.ts'

export interface CompetencyConfig {
  key: CompetencyKey
  label: string
  description: string
  weightWithCoding: number
  weightNoCoding: number
}

export const COMPETENCIES: CompetencyConfig[] = [
  {
    key: 'technical_knowledge',
    label: 'Technical Knowledge',
    description: 'Accuracy and depth of concept explanations',
    weightWithCoding: 30,
    weightNoCoding: 40,
  },
  {
    key: 'problem_solving',
    label: 'Problem Solving',
    description: 'Approach, decomposition, edge cases, complexity reasoning',
    weightWithCoding: 25,
    weightNoCoding: 30,
  },
  {
    key: 'communication',
    label: 'Communication',
    description: 'Clarity, structure, answering what was asked, thinking aloud',
    weightWithCoding: 20,
    weightNoCoding: 20,
  },
  {
    key: 'code_quality',
    label: 'Code Quality',
    description: 'Correctness, readability, tests passed, efficiency',
    weightWithCoding: 15,
    weightNoCoding: 0,
  },
  {
    key: 'behavioural',
    label: 'Behavioural & Professionalism',
    description: 'STAR structure, ownership, learning mindset',
    weightWithCoding: 10,
    weightNoCoding: 10,
  },
]

export const HINT_PENALTIES: Record<0 | 1 | 2 | 3, number> = {
  0: 0,
  1: 0.25,
  2: 0.5,
  3: 1.0,
}

export function hintPenalty(level: 0 | 1 | 2 | 3): number {
  return HINT_PENALTIES[level] ?? 0
}

/**
 * Section 9.2 Anchored 1-5 scale descriptors
 */
export const RUBRIC_DESCRIPTORS: Record<number, string> = {
  1: 'Incorrect or no relevant answer; fundamental misconceptions.',
  2: 'Partially correct; misses key ideas; needs heavy prompting.',
  3: 'Mostly correct on basics; limited depth; handles one follow-up.',
  4: 'Correct and clear; explains trade-offs; handles follow-ups well.',
  5: 'Accurate, deep and well-structured; connects concepts and gives examples unprompted.',
}

/**
 * Section 9.3 Readiness Bands
 */
export function bandForScore(score0to100: number): { band: ReadinessBand; meaning: string } {
  if (score0to100 >= 80) {
    return { band: 'Strong', meaning: 'Ready for competitive interviews; try Full Simulation at harder settings.' }
  }
  if (score0to100 >= 60) {
    return { band: 'Interview-ready', meaning: 'Solid for entry-level interviews; polish weak topics.' }
  }
  if (score0to100 >= 40) {
    return { band: 'Developing', meaning: 'Basics present; work on depth and structured answers.' }
  }
  return { band: 'Getting started', meaning: 'Focus on fundamentals; short daily practice recommended.' }
}

/**
 * Apply hint penalty to a single rubric score, clamped to minimum 1.
 */
export function applyHintPenalty(rawScore: number, hintsUsed: 0 | 1 | 2 | 3): { penalized: number; penalty: number } {
  const penalty = hintPenalty(hintsUsed)
  const penalized = Math.max(1, rawScore - penalty)
  return { penalized, penalty }
}

/**
 * Compute per-competency averages across evaluations, then weighted overall 0-100.
 * Server-side only — never trust LLM output for final number.
 */
export function computeCompetencyBreakdown(
  evaluations: AnswerEvaluation[],
  hasCoding: boolean,
): CompetencyBreakdownItem[] {
  const byCompetency = new Map<CompetencyKey, number[]>()

  for (const ev of evaluations) {
    if (ev.skipped) {
      // Skipped scores 1 for that competency per Section 9.4
      for (const comp of COMPETENCIES) {
        if (ev.competency_scores[comp.key] !== undefined || comp.key === 'technical_knowledge') {
          const arr = byCompetency.get(comp.key) || []
          arr.push(1)
          byCompetency.set(comp.key, arr)
        }
      }
      continue
    }
    for (const [k, v] of Object.entries(ev.competency_scores)) {
      const key = k as CompetencyKey
      if (typeof v === 'number' && v >= 1 && v <= 5) {
        const arr = byCompetency.get(key) || []
        arr.push(v)
        byCompetency.set(key, arr)
      }
    }
  }

  return COMPETENCIES.filter(c => hasCoding || c.key !== 'code_quality').map(cfg => {
    const scores = byCompetency.get(cfg.key) || []
    const avgRubric = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
    // Scale 1-5 rubric to 0-100: (avg-1)/4 *100
    const score100 = scores.length ? Math.round(((avgRubric - 1) / 4) * 100) : 0
    return {
      key: cfg.key,
      label: cfg.label,
      description: cfg.description,
      weight_pct: hasCoding ? cfg.weightWithCoding : cfg.weightNoCoding,
      avg_rubric: Math.round(avgRubric * 10) / 10,
      score_100: score100,
      evaluated_count: scores.length,
    }
  })
}

export function computeOverallScore(breakdown: CompetencyBreakdownItem[]): number {
  if (!breakdown.length) return 0
  const totalWeight = breakdown.reduce((s, b) => s + b.weight_pct, 0) || 100
  const weighted = breakdown.reduce((s, b) => s + (b.score_100 * b.weight_pct) / totalWeight, 0)
  return Math.round(weighted)
}

/**
 * Extract top strengths and improvements with evidence quotes (Section 9, G5).
 */
export function extractEvidencePoints(
  evaluations: AnswerEvaluation[],
  type: 'strength' | 'improvement',
  limit = 3,
): EvidencePoint[] {
  const points: EvidencePoint[] = []

  for (const ev of evaluations) {
    const items = type === 'strength' ? ev.strengths : ev.gaps
    for (const item of items) {
      points.push({
        title: item,
        detail: item,
        quote: ev.student_quote || ev.key_points.find(k => k.status === (type === 'strength' ? 'covered' : 'missing'))?.evidence || '',
        question_id: ev.question_id,
        competency: (Object.keys(ev.competency_scores)[0] as CompetencyKey) || 'technical_knowledge',
      })
    }
  }

  // Deduplicate by title and limit
  const seen = new Set<string>()
  const unique: EvidencePoint[] = []
  for (const p of points) {
    const key = p.title.toLowerCase().slice(0, 60)
    if (!seen.has(key)) {
      seen.add(key)
      unique.push(p)
    }
    if (unique.length >= limit) break
  }
  return unique
}

export function isLowConfidenceEvaluation(ev: AnswerEvaluation): boolean {
  return ev.confidence < 0.6 || ev.low_confidence
}
