/**
 * AI Mock Interview — Session Blueprint Builder (Section 6 & 8.2 FR-10)
 *
 * Builds a session plan from track/year/mode:
 * ordered sections, time budgets, target competencies, question ids from bank.
 * Implements anti-repetition (FR-18) and adaptive difficulty (FR-13).
 */

import { QUESTION_BANK, getQuestionById, getQuestionsBySection } from './questionBank.ts'
import type {
  InterviewBlueprint,
  InterviewMode,
  InterviewSectionId,
  InterviewTrack,
  InterviewYear,
  SectionPlan,
} from './types.ts'

interface TimeBudget {
  quick: number
  standard: number
  full: number
}

const SECTION_TIME_BUDGETS: Record<InterviewSectionId, TimeBudget> = {
  warmup: { quick: 1, standard: 3, full: 3 },
  fundamentals: { quick: 5, standard: 9, full: 12 },
  problem_solving: { quick: 6, standard: 12, full: 15 },
  project_or_design: { quick: 0, standard: 6, full: 8 },
  behavioural: { quick: 2, standard: 3, full: 5 },
  wrap_up: { quick: 1, standard: 2, full: 2 },
}

const SECTION_LABELS: Record<InterviewSectionId, string> = {
  warmup: 'Welcome & Warm-up',
  fundamentals: 'Core Fundamentals',
  problem_solving: 'Problem Solving',
  project_or_design: 'Project Deep-dive / Design',
  behavioural: 'Behavioural / HR',
  wrap_up: 'Wrap-up & Your Questions',
}

const SECTION_STATE_MAP: Record<InterviewSectionId, SectionPlan['state']> = {
  warmup: 'WARMUP',
  fundamentals: 'FUNDAMENTALS',
  problem_solving: 'PROBLEM_SOLVING',
  project_or_design: 'PROJECT_OR_DESIGN',
  behavioural: 'BEHAVIOURAL',
  wrap_up: 'WRAP_UP',
}

const SECTION_COMPETENCIES: Record<InterviewSectionId, SectionPlan['target_competencies']> = {
  warmup: ['communication', 'behavioural'],
  fundamentals: ['technical_knowledge', 'communication'],
  problem_solving: ['problem_solving', 'code_quality', 'technical_knowledge'],
  project_or_design: ['technical_knowledge', 'problem_solving', 'communication'],
  behavioural: ['behavioural', 'communication'],
  wrap_up: ['communication', 'behavioural'],
}

const MODE_TOTAL_MIN: Record<InterviewMode, number> = {
  quick: 15,
  standard: 35,
  full: 45,
}

const MODE_QUESTION_COUNTS: Record<InterviewMode, Record<InterviewSectionId, number>> = {
  quick: {
    warmup: 1,
    fundamentals: 2,
    problem_solving: 1,
    project_or_design: 0,
    behavioural: 1,
    wrap_up: 1,
  },
  standard: {
    warmup: 1,
    fundamentals: 3,
    problem_solving: 1,
    project_or_design: 1,
    behavioural: 1,
    wrap_up: 1,
  },
  full: {
    warmup: 1,
    fundamentals: 4,
    problem_solving: 2,
    project_or_design: 1,
    behavioural: 2,
    wrap_up: 1,
  },
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export interface BuildBlueprintOptions {
  track: InterviewTrack
  year: InterviewYear
  mode: InterviewMode
  /** Question ids used in last 3 sessions to avoid repetition (FR-18). */
  excludeQuestionIds?: string[]
  /** Starting difficulty level (1 easy, 2 medium, 3 hard). */
  startingDifficulty?: 1 | 2 | 3
  /** Custom project context to inject project questions. */
  hasProjectContext?: boolean
}

export function buildBlueprint(opts: BuildBlueprintOptions): InterviewBlueprint {
  const { track, year, mode, excludeQuestionIds = [], startingDifficulty } = opts
  const excludeSet = new Set(excludeQuestionIds)
  const counts = MODE_QUESTION_COUNTS[mode]

  const sections: SectionPlan[] = []
  const allQuestionIds: string[] = []

  const order: InterviewSectionId[] = ['warmup', 'fundamentals', 'problem_solving', 'project_or_design', 'behavioural', 'wrap_up']

  for (const sectionId of order) {
    const needed = counts[sectionId]
    if (needed === 0) continue

    const budget = SECTION_TIME_BUDGETS[sectionId][mode]
    if (budget === 0) continue

    // Pool: track matches or 'both', year matches, section matches, not excluded
    let pool = QUESTION_BANK.filter(q =>
      q.section === sectionId &&
      (q.track === track || q.track === 'both') &&
      q.years.includes(year) &&
      !excludeSet.has(q.id),
    )

    // If not enough after exclusion, allow previously excluded (but shuffled) to fill
    if (pool.length < needed) {
      const fallback = QUESTION_BANK.filter(q =>
        q.section === sectionId &&
        (q.track === track || q.track === 'both') &&
        q.years.includes(year),
      )
      // Prefer non-excluded first
      const nonExcluded = fallback.filter(q => !excludeSet.has(q.id))
      const excluded = fallback.filter(q => excludeSet.has(q.id))
      pool = [...nonExcluded, ...shuffle(excluded)]
    } else {
      pool = shuffle(pool)
    }

    // Sort by difficulty proximity to startingDifficulty for adaptive start (FR-13)
    const targetDiff = startingDifficulty || (year === 2 ? 1 : 2)
    pool.sort((a, b) => Math.abs(a.difficulty - targetDiff) - Math.abs(b.difficulty - targetDiff))

    const selected = pool.slice(0, needed)
    const questionIds = selected.map(q => q.id)
    allQuestionIds.push(...questionIds)

    sections.push({
      id: sectionId,
      label: SECTION_LABELS[sectionId],
      state: SECTION_STATE_MAP[sectionId],
      time_budget_min: budget,
      question_ids: questionIds,
      target_competencies: SECTION_COMPETENCIES[sectionId],
    })
  }

  // Determine initial difficulty
  const runningDifficulty: 1 | 2 | 3 = startingDifficulty || (year === 2 ? 1 : 2)

  return {
    track,
    year,
    mode,
    total_duration_min: MODE_TOTAL_MIN[mode],
    sections,
    active_section_index: 0,
    active_question_index: 0,
    current_question_id: allQuestionIds[0] || '',
    follow_ups_asked: 0,
    max_follow_ups_per_question: 3,
    running_difficulty: runningDifficulty,
  }
}

export function getNextQuestionId(blueprint: InterviewBlueprint): string | null {
  const section = blueprint.sections[blueprint.active_section_index]
  if (!section) return null
  if (blueprint.active_question_index < section.question_ids.length) {
    return section.question_ids[blueprint.active_question_index]
  }
  // Move to next section
  const nextSectionIndex = blueprint.active_section_index + 1
  if (nextSectionIndex < blueprint.sections.length) {
    const nextSection = blueprint.sections[nextSectionIndex]
    return nextSection.question_ids[0] || null
  }
  return null
}

export function advanceBlueprint(blueprint: InterviewBlueprint): InterviewBlueprint {
  const next = { ...blueprint, sections: blueprint.sections.map(s => ({ ...s, question_ids: [...s.question_ids] })) }
  const section = next.sections[next.active_section_index]
  if (!section) return next

  // If more questions in current section
  if (next.active_question_index + 1 < section.question_ids.length) {
    next.active_question_index += 1
    next.current_question_id = section.question_ids[next.active_question_index]
    next.follow_ups_asked = 0
    return next
  }

  // Move to next section
  const nextSectionIdx = next.active_section_index + 1
  if (nextSectionIdx < next.sections.length) {
    next.active_section_index = nextSectionIdx
    next.active_question_index = 0
    next.current_question_id = next.sections[nextSectionIdx].question_ids[0] || ''
    next.follow_ups_asked = 0
    return next
  }

  // No more questions — interview should go to WRAP_UP then EVALUATING
  next.current_question_id = ''
  return next
}

export function adaptDifficulty(
  blueprint: InterviewBlueprint,
  lastScore: number, // 1-5 rubric
): InterviewBlueprint {
  const next = { ...blueprint }
  if (lastScore >= 4 && next.running_difficulty < 3) {
    next.running_difficulty = (next.running_difficulty + 1) as 1 | 2 | 3
  } else if (lastScore <= 2 && next.running_difficulty > 1) {
    next.running_difficulty = (next.running_difficulty - 1) as 1 | 2 | 3
  }
  return next
}

export function getSectionTimeBudget(blueprint: InterviewBlueprint, sectionId: InterviewSectionId): number {
  const s = blueprint.sections.find(sec => sec.id === sectionId)
  return s?.time_budget_min || 0
}
