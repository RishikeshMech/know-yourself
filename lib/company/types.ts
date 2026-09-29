/**
 * Shared types for the company-specific assessments.
 *
 * Everything in this file is type-only (erased at runtime), so it is safe to
 * import from client components, server routes and the Node test runner alike.
 *
 * Vocabulary
 *  - Section   one of the 11 master-bank sections in the `Ques/` folder.
 *  - Question  a bank item. MCQs carry their answer key, which is why the bank
 *              itself is server-only (see lib/company/bank.ts).
 *  - Blueprint the round structure of a company mock (rounds → parts → counts).
 *  - Paper     the concrete, per-attempt selection of questions for a blueprint.
 *  - Attempt   one student's single sitting of one company's mock.
 */

export type SectionId =
  | 's1' | 's2' | 's3' | 's4' | 's5' | 's6' | 's7' | 's8' | 's9' | 's10' | 's11'

export type Difficulty = 'easy' | 'medium' | 'hard'

export type QuestionKind = 'mcq' | 'written' | 'coding'

export type QuestionOrigin = 'ques' | 'supplement' | 'generated'

interface BaseQuestion {
  /** Stable, content-derived id (unchanged questions keep their id across rebuilds). */
  id: string
  kind: QuestionKind
  section: SectionId
  topic: string
  /** Coarser grouping inside a section (e.g. s1: quant / reasoning / verbal). */
  area: string
  difficulty: Difficulty
  /** Questions sharing a group never appear together in one paper. */
  group: string
  origin: QuestionOrigin
  /** Question numbers in the source Ques document this item was built from. */
  sourceRefs?: number[]
  /**
   * The label printed in the Ques document when it differs from `difficulty`.
   * The source assigned labels by position (identical text appears as Easy,
   * Medium and Hard), so the bank calibrates difficulty by content and keeps
   * the original label here for traceability.
   */
  sourceDifficulty?: Difficulty | Difficulty[]
}

export interface McqQuestion extends BaseQuestion {
  kind: 'mcq'
  q: string
  /** Optional code block rendered under the stem. */
  code?: string
  /** Canonical option order. Papers re-shuffle per attempt. */
  options: string[]
  /** Exact text of the correct option. SERVER-ONLY. */
  answer: string
  /** Short rationale shown to reviewers (never to candidates during a test). */
  explanation?: string
}

export interface RubricPoint {
  /** Human label, e.g. "Shared address space". */
  label: string
  /** Lower-case phrases; matching ANY of them credits the point. */
  any: string[]
}

export interface WrittenQuestion extends BaseQuestion {
  kind: 'written'
  q: string
  /** The base prompt without the angle/variant suffix. */
  base: string
  /** Extra angle the variant asks for (edge cases, trade-offs, …), if any. */
  angle?: WrittenAngle
  minWords: number
  maxWords: number
  rubric: RubricPoint[]
}

export type WrittenAngle = 'example' | 'complexity' | 'compare' | 'practical' | 'mistakes'

export interface CodingTest {
  name: string
  /**
   * Positional arguments. Any value may be a deterministic generator spec
   * (`{"$gen": "ints", "n": 100000, "lo": 0, "hi": 9, "seed": 7}`) that the
   * judge expands identically in Python and JavaScript — see codeRunner.ts.
   */
  args: unknown[]
  /** Expected return value, or `{"$digest": sha256}` of its canonical JSON. */
  expected: unknown
  /** Per-test time limit in ms (number, or per language). Default 1000. */
  limitMs?: number | { python?: number; javascript?: number }
  /** Performance test on a large input — an inefficient solution times out. */
  stress?: boolean
  /** Mirrors a statement example; the candidate sees their output if wrong. */
  sample?: boolean
}

export interface CodingQuestion extends BaseQuestion {
  kind: 'coding'
  title: string
  statement: string
  examples: Array<{ input: string; output: string; explain?: string }>
  constraints: string[]
  /** Function the candidate must implement, per language. */
  fn: { python: string; javascript: string }
  starter: { python: string; javascript: string }
  /** How results are compared. `unordered` sorts top-level arrays first. */
  compare: 'exact' | 'unordered' | 'unordered-nested' | 'float'
  /** Hidden tests. SERVER-ONLY. */
  tests: CodingTest[]
}

export type BankQuestion = McqQuestion | WrittenQuestion | CodingQuestion

export interface QuestionBank {
  version: string
  generatedAt: string
  questions: BankQuestion[]
}

/* ------------------------------------------------------------------ */
/* Blueprints                                                          */
/* ------------------------------------------------------------------ */

export interface DifficultyMix {
  easy: number
  medium: number
  hard: number
}

export interface PartSpec {
  kind: QuestionKind
  /** Pools to draw from; questions are spread across them round-robin. */
  sections: SectionId[]
  /** Optional restriction to areas inside the sections (e.g. ['quant']). */
  areas?: string[]
  /** Optional restriction to topics. */
  topics?: string[]
  count: number
  /** Proportions; missing buckets borrow from neighbours. */
  mix?: DifficultyMix
  /** Marks per question (defaults: mcq 1, written 10, coding 20). */
  marks?: number
  /** Short label shown in the paper (e.g. "Numerical Ability"). */
  label?: string
}

export interface RoundSpec {
  id: string
  label: string
  /** Step number in the research document this round simulates. */
  step: number
  /** Suggested minutes (a single global timer runs the whole mock). */
  minutes: number
  /** Share of the overall score (all rounds of a blueprint sum to 100). */
  weight: number
  /** One-line description of what the round measures. */
  about: string
  parts: PartSpec[]
  /** Sectional cut-off (percent) used for the "shortlist" verdict. */
  cutoff?: number
}

export interface Blueprint {
  id: string
  label: string
  rounds: RoundSpec[]
}

/* ------------------------------------------------------------------ */
/* Catalog                                                             */
/* ------------------------------------------------------------------ */

export type CompanyTagId = 'it-services' | 'big-tech' | 'product-startups' | 'saas' | 'bfsi' | 'engineering'

export type Priority = 1 | 2 | 3

export interface HiringStep {
  no: number
  title: string
  detail: string
}

export interface Company {
  slug: string
  name: string
  priority: Priority
  tag: CompanyTagId
  /** Typical hiring track / programme name. */
  track: string
  role: string
  blueprint: string
  /** Hiring flow steps (from the research document when documented). */
  steps: HiringStep[]
  /** True when the research doc has a dedicated step section for the company. */
  documented: boolean
  /** Short bullet points on what this mock emphasises. */
  focus: string[]
  color: string
  initials: string
}

/* ------------------------------------------------------------------ */
/* Papers & attempts                                                   */
/* ------------------------------------------------------------------ */

/** What is persisted per attempt: ids + per-attempt option order. No keys. */
export interface StoredPaperItem {
  id: string
  marks: number
  /** MCQ option order for this attempt (a permutation of the bank options). */
  options?: string[]
  part?: string
}

export interface StoredPaperRound {
  id: string
  items: StoredPaperItem[]
}

export interface StoredPaper {
  blueprint: string
  bankVersion: string
  rounds: StoredPaperRound[]
}

/** Candidate-facing projections — never contain answer keys or hidden tests. */
export type ClientItem =
  | {
      kind: 'mcq'; id: string; section: SectionId; topic: string; difficulty: Difficulty
      marks: number; part?: string; q: string; code?: string; options: string[]
    }
  | {
      kind: 'written'; id: string; section: SectionId; topic: string; difficulty: Difficulty
      marks: number; part?: string; q: string; minWords: number; maxWords: number
    }
  | {
      kind: 'coding'; id: string; section: SectionId; topic: string; difficulty: Difficulty
      marks: number; part?: string; title: string; statement: string
      examples: Array<{ input: string; output: string; explain?: string }>
      constraints: string[]; starter: { python: string; javascript: string }; testCount: number
    }

export interface ClientRound {
  id: string
  label: string
  step: number
  minutes: number
  weight: number
  about: string
  items: ClientItem[]
}

export interface ClientPaper {
  company: string
  rounds: ClientRound[]
}

export type AttemptStatus = 'in_progress' | 'submitted' | 'expired'

export interface ProctorEvent {
  type: string
  at: string
  detail?: string
}

export interface ProctoringLog {
  strikes: number
  camera: boolean | null
  fullscreen: boolean | null
  events: ProctorEvent[]
}

export interface ItemResult {
  id: string
  kind: QuestionKind
  section: SectionId
  topic: string
  area?: string
  difficulty: Difficulty
  marks: number
  earned: number
  answered: boolean
  /** mcq: correct? coding: all tests passed? written: score ≥ 60? */
  correct: boolean
  /** Written: 0-100 grader score. Coding: tests passed / total. */
  score?: number
  passed?: number
  total?: number
  feedback?: { strengths: string[]; improvements: string[]; summary: string; engine: string }
}

export interface RoundResult {
  id: string
  label: string
  weight: number
  earned: number
  possible: number
  percent: number
  cutoff?: number
  cleared: boolean
  answered: number
  total: number
}

export interface SectionResult {
  section: SectionId
  title: string
  earned: number
  possible: number
  percent: number
  answered: number
  total: number
}

export type Verdict = 'ready' | 'almost' | 'borderline' | 'not-yet'

export interface AttemptResult {
  score: number
  verdict: Verdict
  verdictLabel: string
  rounds: RoundResult[]
  sections: SectionResult[]
  items: ItemResult[]
  answered: number
  total: number
  gradedAt: string
  graders: { written: string; coding: string }
}

export interface CompanyAttempt {
  id: string
  student_id: string
  company: string
  status: AttemptStatus
  question_seed: number
  paper: StoredPaper
  answers: Record<string, unknown>
  proctoring: ProctoringLog
  started_at: string
  expires_at: string
  duration_sec: number
  submitted_at?: string | null
  auto_submitted?: boolean
  submit_reason?: string | null
  score?: number | null
  result?: AttemptResult | null
  created_at: string
  updated_at: string
}

/** Lightweight status row for dashboards (no paper / answers). */
export interface AttemptSummary {
  company: string
  status: AttemptStatus
  started_at: string
  expires_at: string
  submitted_at?: string | null
  score?: number | null
  verdict?: Verdict | null
  auto_submitted?: boolean
}
