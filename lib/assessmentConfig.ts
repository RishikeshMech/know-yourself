/**
 * Shared configuration for the two assessments.
 *
 * The exam engine (components/AssessmentRunner.tsx) is written once and driven
 * by one of these configs, so Assessment 2 (the Capgemini 2027 mock test) gets
 * exactly the same proctoring, fullscreen lock, in-built compiler, in-exam AI
 * assistant, autosave, review and auto-submit behaviour as Assessment 1 — only
 * the questions, stages, duration, storage keys and scoring differ.
 */

export type StageId =
  | 'english'    // 4 subsections: Listening / Speaking / Reading / Writing
  | 'problem'    // flat MCQ list (bank.problem)
  | 'mcq'        // flat MCQ list with optional code blocks (bank[stage.bankKey])
  | 'debugging'  // code-fix tasks with the in-built compiler + AI assistant
  | 'feature'    // single feature build task (assessment 1 only)
  | 'prompt'     // prompt-writing tasks (assessment 1 only)
  | 'cognitive'  // Grid / Logical Reasoning / Behavioural (assessment 1 only)

export interface StageDef {
  id: StageId
  label: string
  /** Subsection labels — empty when the stage is a single flat page. */
  sub: string[]
  /** Suggested minutes, shown in the sidebar and header. */
  min: number
  /** Top-level bank key for `mcq` stages (e.g. 'debugmcq'). */
  bankKey?: string
}

export interface AssessmentKeys {
  /** localStorage key holding the active/finished session row. */
  session: string
  /** localStorage key per session id holding the answer draft. */
  answers: (sid: string) => string
  /** localStorage key per session id holding AI evaluation results. */
  ai: (sid: string) => string
  /** localStorage key holding the flattened final score payload. */
  scores: string
}

export interface AssessmentConfig {
  no: 1 | 2
  /** Header brand text on the live exam screen. */
  title: string
  /** Total timer length in seconds (the session row still owns the truth). */
  durationSec: number
  stages: StageDef[]
  bank: any
  keys: AssessmentKeys
  computeScores: (answers: any, ai: any, meta: any) => any
  buildReview: (bank: any, answers: Record<string, any>) => any
  /**
   * Where to send someone who lands on the exam page with no usable session.
   * Assessment 2 first verifies (locally) that assessment 1 was completed.
   */
  fallbackRoute: () => string
}

import bank1 from '@/data/questions.json'
import { computeScores } from './scoring'
import { buildReview } from './reviewModel'
import bank2 from '@/data/questions2.json'
import { computeScores2 } from './scoring2'
import { buildReview2 } from './reviewModel2'
import { AFTER_ASSESSMENT_ROUTE } from './nextStep'

/** localStorage helpers that never throw (private mode / SSR). */
export function readLocal(key: string): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export const ASSESSMENT_1: AssessmentConfig = {
  no: 1,
  title: 'CalibiAI Assessment',
  durationSec: 7200,
  stages: [
    { id: 'english', label: 'English Communication', sub: ['Listening', 'Speaking', 'Reading', 'Writing'], min: 15 },
    { id: 'problem', label: 'Problem Solving', sub: [], min: 20 },
    { id: 'debugging', label: 'AI-Assisted Debugging', sub: [], min: 20 },
    { id: 'feature', label: 'AI Feature Development', sub: [], min: 25 },
    { id: 'prompt', label: 'Prompt Engineering', sub: [], min: 15 },
    { id: 'cognitive', label: 'Cognitive Assessment', sub: ['Grid Challenge', 'Logical Reasoning', 'Behavioural'], min: 25 },
  ],
  bank: bank1,
  keys: {
    session: 'calibiai_session',
    answers: (sid) => `calibiai_answers_${sid}`,
    ai: (sid) => `calibiai_ai_${sid}`,
    scores: 'calibiai_scores',
  },
  computeScores,
  buildReview,
  fallbackRoute: () => (readLocal('calibiai_scores') ? AFTER_ASSESSMENT_ROUTE : '/instructions'),
}

export const ASSESSMENT_2: AssessmentConfig = {
  no: 2,
  title: 'Capgemini 2027 Mock',
  durationSec: 5400,
  stages: [
    { id: 'english', label: 'English Communication', sub: ['Listening', 'Speaking', 'Reading', 'Writing'], min: 30 },
    { id: 'problem', label: 'AI Literacy', sub: [], min: 25 },
    { id: 'mcq', label: 'Debugging — C/C++/Java', sub: [], min: 15, bankKey: 'debugmcq' },
    { id: 'debugging', label: 'Debugging Lab', sub: [], min: 20 },
  ],
  bank: bank2,
  keys: {
    session: 'calibiai2_session',
    answers: (sid) => `calibiai2_answers_${sid}`,
    ai: (sid) => `calibiai2_ai_${sid}`,
    scores: 'calibiai2_scores',
  },
  computeScores: computeScores2,
  buildReview: buildReview2,
  // No local assessment-2 session: a finished candidate goes to the dashboard;
  // someone who finished assessment 1 belongs on the assessment-2 instructions;
  // anyone else is routed through the assessment-1 flow (which gates itself).
  fallbackRoute: () =>
    readLocal('calibiai2_scores')
      ? AFTER_ASSESSMENT_ROUTE
      : readLocal('calibiai_scores')
        ? '/instructions2'
        : '/instructions',
}
