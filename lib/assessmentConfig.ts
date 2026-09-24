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

/** localStorage helpers that never throw (private mode / SSR). */
export function readLocal(key: string): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}
