/**
 * AI Mock Interview — Core Domain Types & Contracts
 *
 * Implements the full specification from AI_Mock_Interview_Feature_Requirements.docx:
 *   - Two tracks at launch: Software Engineer ('swe') & AI/ML Engineer ('ai_ml')
 *   - Two difficulty profiles: 2nd Year (2) & 3rd Year (3)
 *   - Three session lengths: Quick (15m), Standard (35m, default), Full Simulation (45m)
 *   - Strict 3-attempt quota per student, enforced server-side
 *   - State machine (Section 11.2):
 *       SCHEDULED -> CREATED -> CONSENTED -> SETUP_CHECK -> WARMUP -> FUNDAMENTALS
 *       -> PROBLEM_SOLVING -> PROJECT_OR_DESIGN -> BEHAVIOURAL -> WRAP_UP
 *       -> EVALUATING -> REPORT_READY
 *       (+ PAUSED, DISCONNECTED, ABANDONED, TERMINATED)
 *   - Explainable, rubric-anchored scoring (Section 9 & 10.7) computed server-side
 */

import type { CodeLang } from '../company/languages.ts'
import type { CodingTest } from '../company/types.ts'

/** Maximum number of AI Mock Interview attempts allowed per student. */
export const MAX_INTERVIEW_ATTEMPTS = 3

/** Maximum pauses allowed per interview session (Section 6.1: once, up to 5 min). */
export const MAX_PAUSES_PER_SESSION = 1
export const MAX_PAUSE_DURATION_SEC = 5 * 60
export const RECONNECT_WINDOW_SEC = 30 * 60

export type InterviewTrack = 'swe' | 'ai_ml'
export type InterviewYear = 2 | 3
export type InterviewMode = 'quick' | 'standard' | 'full'
export type LanguageStyle = 'en' | 'hinglish'

export type InterviewSectionId =
  | 'warmup'
  | 'fundamentals'
  | 'problem_solving'
  | 'project_or_design'
  | 'behavioural'
  | 'wrap_up'

export type InterviewState =
  | 'SCHEDULED'
  | 'CREATED'
  | 'CONSENTED'
  | 'SETUP_CHECK'
  | 'WARMUP'
  | 'FUNDAMENTALS'
  | 'PROBLEM_SOLVING'
  | 'PROJECT_OR_DESIGN'
  | 'BEHAVIOURAL'
  | 'WRAP_UP'
  | 'EVALUATING'
  | 'REPORT_READY'
  | 'PAUSED'
  | 'DISCONNECTED'
  | 'ABANDONED'
  | 'TERMINATED'

export type QuestionType =
  | 'warmup'
  | 'conceptual'
  | 'coding'
  | 'design'
  | 'project'
  | 'behavioural'
  | 'wrap_up'

export type CompetencyKey =
  | 'technical_knowledge'
  | 'problem_solving'
  | 'communication'
  | 'code_quality'
  | 'behavioural'

export type ReadinessBand =
  | 'Getting started'
  | 'Developing'
  | 'Interview-ready'
  | 'Strong'

export interface InterviewCodingSpec {
  fn_name: Record<CodeLang, string>
  starter_code: Record<CodeLang, string>
  compare: 'exact' | 'unordered' | 'unordered-nested' | 'float'
  tests: CodingTest[]
  sample_input_output: Array<{ input: string; output: string; explanation?: string }>
  target_complexity: string
}

/**
 * Appendix A Question Bank Entry
 */
export interface InterviewQuestion {
  id: string
  track: InterviewTrack | 'both'
  section: InterviewSectionId
  topic: string[]
  difficulty: 1 | 2 | 3
  years: InterviewYear[]
  type: QuestionType
  prompt: string
  reference_answer: string
  key_points: string[]
  common_mistakes: string[]
  follow_ups: string[]
  hint_ladder: [string, string, string]
  time_limit_min: number
  coding_spec?: InterviewCodingSpec
}

export interface SectionPlan {
  id: InterviewSectionId
  label: string
  state: InterviewState
  time_budget_min: number
  question_ids: string[]
  target_competencies: CompetencyKey[]
}

export interface InterviewBlueprint {
  track: InterviewTrack
  year: InterviewYear
  mode: InterviewMode
  total_duration_min: number
  sections: SectionPlan[]
  active_section_index: number
  active_question_index: number
  current_question_id: string
  follow_ups_asked: number
  max_follow_ups_per_question: number
  running_difficulty: 1 | 2 | 3
}

export interface ConsentRecord {
  accepted_ai_notice: boolean
  record_session: boolean
  share_with_faculty: boolean
  camera_mic_enabled: boolean
  granted_at: string
}

export interface DeviceCheckStatus {
  camera_ok: boolean
  mic_ok: boolean
  speaker_ok: boolean
  network_ok: boolean
  code_editor_ok: boolean
  voice_mode_enabled: boolean
  checked_at: string
}

export interface InterviewTurn {
  id: string
  session_id: string
  section: InterviewSectionId
  question_id: string
  role: 'interviewer' | 'student'
  text: string
  is_follow_up?: boolean
  follow_up_index?: number
  hint_level?: 0 | 1 | 2 | 3
  input_mode?: 'voice' | 'text' | 'code'
  code_snapshot?: string
  code_language?: CodeLang
  timestamp: string
  latency_ms?: number
}

export interface InterviewCodeSubmission {
  id: string
  session_id: string
  question_id: string
  language: CodeLang
  code: string
  passed: number
  total: number
  test_results: Array<{
    name: string
    passed: boolean
    status?: string
    ms?: number
    got?: string
    expected?: string
    message?: string
  }>
  runtime_ms: number
  submitted_at: string
}

export interface KeyPointEvaluation {
  point: string
  status: 'covered' | 'partially' | 'missing'
  evidence: string | null
}

/**
 * Section 10.7 Evaluator Output Schema
 */
export interface AnswerEvaluation {
  question_id: string
  question_prompt: string
  section: InterviewSectionId
  topic: string[]
  skipped: boolean
  hints_used: 0 | 1 | 2 | 3
  hint_penalty: number
  raw_competency_scores: Partial<Record<CompetencyKey, number>>
  competency_scores: Partial<Record<CompetencyKey, number>>
  key_points: KeyPointEvaluation[]
  strengths: string[]
  gaps: string[]
  student_quote: string
  model_answer: string
  model_answer_hint: string
  code_review?: {
    language: CodeLang
    code: string
    tests_passed: number
    tests_total: number
    complexity_note: string
    readability_note: string
  }
  confidence: number
  low_confidence: boolean
  evaluator_engine: 'deepseek' | 'grounded-heuristic'
  evaluated_at: string
}

export type IntegritySignalType =
  | 'tab_switch'
  | 'large_paste'
  | 'fast_answer'
  | 'repeated_answer'
  | 'prompt_injection'
  | 'camera_off'
  | 'off_topic'

export interface IntegrityEvent {
  id: string
  session_id: string
  type: IntegritySignalType
  details: string
  timestamp: string
}

export interface FeedbackFlag {
  id: string
  session_id: string
  student_id: string
  question_id: string
  reason: string
  status: 'open' | 'reviewed' | 'added_to_golden_set'
  created_at: string
}

export interface CompetencyBreakdownItem {
  key: CompetencyKey
  label: string
  description: string
  weight_pct: number
  avg_rubric: number // 1.0 - 5.0
  score_100: number  // 0 - 100
  evaluated_count: number
}

export interface EvidencePoint {
  title: string
  detail: string
  quote: string
  question_id: string
  competency: CompetencyKey
}

export interface LearningPlanItem {
  day_range: string
  focus_topic: string
  competency: CompetencyKey
  why: string
  action_items: string[]
  platform_link: { label: string; href: string }
}

export interface AttemptTrendPoint {
  attempt_number: number
  session_id: string
  date: string
  track: InterviewTrack
  mode: InterviewMode
  overall_score: number
  band: ReadinessBand
}

/**
 * Appendix B Sample Report Layout
 */
export interface InterviewReport {
  id: string
  session_id: string
  student_id: string
  attempt_number: number
  track: InterviewTrack
  year: InterviewYear
  mode: InterviewMode
  language_style: LanguageStyle
  overall_score: number // 0 - 100, computed server-side
  band: ReadinessBand
  band_meaning: string
  has_coding: boolean
  duration_sec: number
  started_at: string
  completed_at: string
  competencies: CompetencyBreakdownItem[]
  top_strengths: EvidencePoint[]
  top_improvements: EvidencePoint[]
  question_reviews: AnswerEvaluation[]
  integrity_events: IntegrityEvent[]
  learning_plan: LearningPlanItem[]
  trend: {
    attempts: AttemptTrendPoint[]
    improvement_from_first: number | null
    cohort_average: number
    cohort_percentile: number
  }
  low_confidence_warning: boolean
  ai_summary: string
  model_versions: {
    interviewer: string
    evaluator: string
    engine: 'deepseek' | 'grounded-heuristic'
  }
  student_rating?: {
    stars: number
    comment?: string
    rated_at: string
  }
  created_at: string
}

export interface InterviewSession {
  id: string
  student_id: string
  student_name?: string
  institution_id?: string
  attempt_number: number // 1, 2, or 3
  track: InterviewTrack
  year: InterviewYear
  mode: InterviewMode
  language_style: LanguageStyle
  state: InterviewState
  previous_active_state?: InterviewState
  scheduled_for?: string | null
  project_context?: {
    title: string
    summary: string
    tech_stack: string[]
    redacted_text: string
  } | null
  blueprint: InterviewBlueprint
  custom_questions?: Record<string, InterviewQuestion>
  consent?: ConsentRecord | null
  device_check?: DeviceCheckStatus | null
  turns: InterviewTurn[]
  hints_by_question: Record<string, 0 | 1 | 2 | 3>
  skipped_questions: string[]
  code_submissions: InterviewCodeSubmission[]
  evaluations: AnswerEvaluation[]
  integrity_events: IntegrityEvent[]
  abuse_strikes: number
  pause_count: number
  paused_at?: string | null
  total_paused_sec: number
  started_at?: string | null
  ended_at?: string | null
  last_active_at: string
  duration_sec: number
  token_usage: {
    prompt_tokens: number
    completion_tokens: number
    cached_tokens: number
    estimated_cost_inr: number
  }
  model_versions: {
    interviewer: string
    evaluator: string
    prompt_version: string
  }
  report_id?: string | null
  created_at: string
}
