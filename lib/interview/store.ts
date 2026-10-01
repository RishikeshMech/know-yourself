/**
 * AI Mock Interview — Session Store Helpers with Supabase (no data loss)
 *
 * Dual-write strategy (mirrors company attempts):
 *   - Local JSON (calibiai_db.runtime.json) is ALWAYS written — demo mode source of truth
 *   - When Supabase service_role is configured, every write is ALSO mirrored to Postgres
 *   - Reads prefer Supabase when available, fallback to local
 *   - Every turn, code submission, evaluation, integrity event, consent, report is stored immediately
 *
 * Ensures zero data loss: even if Supabase is temporarily unreachable, local still has full data
 * and will repair Supabase on next successful write.
 */

import { randomUUID } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  saveInterviewSessionRow,
  getInterviewSessionRow,
  listInterviewSessionsForStudent,
  saveInterviewReportRow,
  getInterviewReportBySession,
  listInterviewReportsForStudent,
  getInterviewReportRow,
  saveInterviewFeedbackFlagRow,
  flushDB,
} from '../db.ts'
import { buildBlueprint } from './blueprint.ts'
import { QUESTION_BANK, personalizeQuestion, formatTrackName } from './questionBank.ts'
import { PROMPT_VERSION } from './prompts.ts'
import {
  persistInterviewSession as persistSessionSupabase,
  fetchInterviewSessionsForStudent as fetchSessionsSupabase,
  fetchInterviewSession as fetchSessionSupabase,
  persistInterviewTurn,
  fetchInterviewTurns,
  persistInterviewCodeSubmission,
  fetchInterviewCodeSubmissions,
  persistInterviewEvaluation,
  fetchInterviewEvaluations,
  persistInterviewReport as persistReportSupabase,
  fetchInterviewReportBySession as fetchReportSupabase,
  fetchInterviewReportsForStudent as fetchReportsSupabase,
  persistInterviewIntegrityEvent,
  persistInterviewConsents,
  persistInterviewFeedbackFlag,
} from './persist.ts'
import type {
  InterviewSession,
  InterviewReport,
  InterviewTrack,
  InterviewYear,
  InterviewMode,
  LanguageStyle,
  FeedbackFlag,
  InterviewQuestion,
  InterviewTurn,
  InterviewCodeSubmission,
  AnswerEvaluation,
  IntegrityEvent,
} from './types.ts'
import { MAX_INTERVIEW_ATTEMPTS } from './types.ts'

export function sessionFromRow(row: any): InterviewSession | null {
  if (!row) return null
  const data = row.data || row
  return data as InterviewSession
}

export function reportFromRow(row: any): InterviewReport | null {
  if (!row) return null
  const data = row.data || row
  return data as InterviewReport
}

// ---------------------------------------------------------------------------
// Local-only helpers (used by tests and fallback)
// ---------------------------------------------------------------------------

export function getInterviewSessionLocal(id: string): InterviewSession | null {
  const row = getInterviewSessionRow(id)
  return sessionFromRow(row as any)
}

export function listSessionsForStudentLocal(studentId: string): InterviewSession[] {
  const rows = listInterviewSessionsForStudent(studentId)
  return rows.map(r => sessionFromRow(r)).filter(Boolean) as InterviewSession[]
}

export function getQuotaForStudentLocal(studentId: string): { used: number; remaining: number; max: number; sessions: InterviewSession[] } {
  const sessions = listSessionsForStudentLocal(studentId)
  const active = sessions.filter(s => s.state !== 'ABANDONED')
  return {
    used: active.length,
    remaining: Math.max(0, MAX_INTERVIEW_ATTEMPTS - active.length),
    max: MAX_INTERVIEW_ATTEMPTS,
    sessions,
  }
}

// ---------------------------------------------------------------------------
// Supabase-aware helpers — dual-write, no data loss
// ---------------------------------------------------------------------------

export async function createInterviewSession(input: {
  student_id: string
  student_name?: string
  institution_id?: string
  track: InterviewTrack
  year: InterviewYear
  mode: InterviewMode
  language_style: LanguageStyle
  project_context?: InterviewSession['project_context']
  scheduled_for?: string | null
  supabase?: SupabaseClient | null
}): Promise<{ session: InterviewSession; quota: { used: number; remaining: number } } | { error: string; quota: { used: number; remaining: number } }> {
  // Try Supabase first for quota when available
  let existingSessions: InterviewSession[] = []
  if (input.supabase) {
    try {
      existingSessions = await fetchSessionsSupabase(input.supabase, input.student_id)
    } catch {
      existingSessions = listSessionsForStudentLocal(input.student_id)
    }
  } else {
    existingSessions = listSessionsForStudentLocal(input.student_id)
  }

  const activeAttempts = existingSessions.filter(s => s.state !== 'ABANDONED')
  if (activeAttempts.length >= MAX_INTERVIEW_ATTEMPTS) {
    return {
      error: `You have used all ${MAX_INTERVIEW_ATTEMPTS} attempts. Each student gets only 3 AI Mock Interviews.`,
      quota: { used: activeAttempts.length, remaining: 0 },
    }
  }

  const recentQuestionIds = existingSessions
    .slice(0, 3)
    .flatMap(s => s.blueprint?.sections?.flatMap(sec => sec.question_ids) || [])

  const blueprint = buildBlueprint({
    track: input.track,
    year: input.year,
    mode: input.mode,
    excludeQuestionIds: recentQuestionIds,
  })

  const attemptNumber = activeAttempts.length + 1
  const now = new Date().toISOString()

  const session: InterviewSession = {
    id: `iv_${randomUUID().slice(0, 8)}`,
    student_id: input.student_id,
    student_name: input.student_name,
    institution_id: input.institution_id,
    attempt_number: attemptNumber,
    track: input.track,
    year: input.year,
    mode: input.mode,
    language_style: input.language_style,
    state: 'SCHEDULED',
    scheduled_for: input.scheduled_for || null,
    project_context: input.project_context || null,
    blueprint,
    custom_questions: {},
    consent: null,
    device_check: null,
    turns: [],
    hints_by_question: {},
    skipped_questions: [],
    code_submissions: [],
    evaluations: [],
    integrity_events: [],
    abuse_strikes: 0,
    pause_count: 0,
    paused_at: null,
    total_paused_sec: 0,
    started_at: null,
    ended_at: null,
    last_active_at: now,
    duration_sec: 0,
    token_usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      cached_tokens: 0,
      estimated_cost_inr: 0,
    },
    model_versions: {
      interviewer: 'deepseek-chat',
      evaluator: 'deepseek-chat',
      prompt_version: PROMPT_VERSION,
    },
    report_id: null,
    created_at: now,
  }

  // Always write local first — no data loss even if Supabase fails
  saveInterviewSessionRow({
    id: session.id,
    student_id: session.student_id,
    data: session,
    created_at: now,
    updated_at: now,
  })
  await flushDB()

  // Mirror to Supabase when configured
  if (input.supabase) {
    const ok = await persistSessionSupabase(input.supabase, session)
    if (!ok) {
      console.warn('[interview] Supabase session persist failed, local copy preserved — will retry on next write')
    }
  }

  return {
    session,
    quota: { used: attemptNumber, remaining: MAX_INTERVIEW_ATTEMPTS - attemptNumber },
  }
}

export function getInterviewSession(id: string): InterviewSession | null {
  return getInterviewSessionLocal(id)
}

export async function getInterviewSessionFull(
  id: string,
  supabase?: SupabaseClient | null,
): Promise<InterviewSession | null> {
  let base: InterviewSession | null = null

  if (supabase) {
    try {
      base = await fetchSessionSupabase(supabase, id)
      if (base) {
        // Enrich with turns, code submissions, evaluations from normalized tables
        const [turns, codeSubs, evals] = await Promise.all([
          fetchInterviewTurns(supabase, id),
          fetchInterviewCodeSubmissions(supabase, id),
          fetchInterviewEvaluations(supabase, id),
        ])
        if (turns.length) base.turns = turns
        if (codeSubs.length) base.code_submissions = codeSubs
        if (evals.length) base.evaluations = evals
        return base
      }
    } catch (e) {
      console.warn('[interview] Supabase fetch failed, falling back to local:', e)
    }
  }

  return getInterviewSessionLocal(id)
}

export async function saveInterviewSession(
  session: InterviewSession,
  supabase?: SupabaseClient | null,
  opts: { persistTurns?: boolean; persistEvals?: boolean; persistCode?: boolean; persistIntegrity?: boolean } = {},
): Promise<void> {
  const now = new Date().toISOString()
  const toSave = { ...session, last_active_at: now }

  // Local always
  saveInterviewSessionRow({
    id: toSave.id,
    student_id: toSave.student_id,
    data: toSave,
    created_at: toSave.created_at,
    updated_at: now,
  })
  await flushDB()

  if (!supabase) return

  // Supabase mirror — session row
  await persistSessionSupabase(supabase, toSave)

  // Optionally persist normalized children for no-loss granular storage
  try {
    if (opts.persistTurns && toSave.turns?.length) {
      // Persist only the latest turn to avoid re-writing all
      const latest = toSave.turns[toSave.turns.length - 1]
      if (latest) await persistInterviewTurn(supabase, latest, toSave.student_id)
    }
    if (opts.persistCode && toSave.code_submissions?.length) {
      const latest = toSave.code_submissions[toSave.code_submissions.length - 1]
      if (latest) await persistInterviewCodeSubmission(supabase, latest, toSave.student_id)
    }
    if (opts.persistEvals && toSave.evaluations?.length) {
      const latest = toSave.evaluations[toSave.evaluations.length - 1]
      if (latest) await persistInterviewEvaluation(supabase, latest, toSave.id, toSave.student_id)
    }
    if (opts.persistIntegrity && toSave.integrity_events?.length) {
      const latest = toSave.integrity_events[toSave.integrity_events.length - 1]
      if (latest) await persistInterviewIntegrityEvent(supabase, latest, toSave.student_id)
    }
    // Consents are persisted once on consent step
    if (toSave.consent) {
      await persistInterviewConsents(supabase, toSave)
    }
  } catch (e) {
    console.warn('[interview] Supabase child persist failed, local preserved:', e)
  }
}

export function listSessionsForStudent(studentId: string): InterviewSession[] {
  return listSessionsForStudentLocal(studentId)
}

export async function listSessionsForStudentFull(
  studentId: string,
  supabase?: SupabaseClient | null,
): Promise<InterviewSession[]> {
  if (supabase) {
    try {
      const remote = await fetchSessionsSupabase(supabase, studentId)
      if (remote.length) return remote
    } catch {}
  }
  return listSessionsForStudentLocal(studentId)
}

export function getQuotaForStudent(studentId: string): { used: number; remaining: number; max: number; sessions: InterviewSession[] } {
  return getQuotaForStudentLocal(studentId)
}

export async function getQuotaForStudentFull(
  studentId: string,
  supabase?: SupabaseClient | null,
): Promise<{ used: number; remaining: number; max: number; sessions: InterviewSession[]; reports: InterviewReport[] }> {
  let sessions: InterviewSession[] = []
  let reports: InterviewReport[] = []

  if (supabase) {
    try {
      const [s, r] = await Promise.all([
        fetchSessionsSupabase(supabase, studentId),
        fetchReportsSupabase(supabase, studentId),
      ])
      sessions = s
      reports = r
      if (sessions.length || reports.length) {
        const active = sessions.filter(ss => ss.state !== 'ABANDONED')
        return {
          used: active.length,
          remaining: Math.max(0, MAX_INTERVIEW_ATTEMPTS - active.length),
          max: MAX_INTERVIEW_ATTEMPTS,
          sessions,
          reports,
        }
      }
    } catch {}
  }

  const localSessions = listSessionsForStudentLocal(studentId)
  const localReports = listReportsForStudent(studentId)
  const active = localSessions.filter(ss => ss.state !== 'ABANDONED')
  return {
    used: active.length,
    remaining: Math.max(0, MAX_INTERVIEW_ATTEMPTS - active.length),
    max: MAX_INTERVIEW_ATTEMPTS,
    sessions: localSessions,
    reports: localReports,
  }
}

export async function saveReport(
  report: InterviewReport,
  supabase?: SupabaseClient | null,
): Promise<void> {
  saveInterviewReportRow({
    id: report.id,
    session_id: report.session_id,
    student_id: report.student_id,
    data: report,
    created_at: report.created_at,
  })
  await flushDB()

  if (supabase) {
    const ok = await persistReportSupabase(supabase, report)
    if (!ok) console.warn('[interview] Supabase report persist failed, local preserved')
  }
}

export function getReportBySession(sessionId: string): InterviewReport | null {
  const row = getInterviewReportBySession(sessionId)
  return reportFromRow(row as any)
}

export async function getReportBySessionFull(
  sessionId: string,
  supabase?: SupabaseClient | null,
): Promise<InterviewReport | null> {
  if (supabase) {
    try {
      const remote = await fetchReportSupabase(supabase, sessionId)
      if (remote) return remote
    } catch {}
  }
  return getReportBySession(sessionId)
}

export function getReportById(id: string): InterviewReport | null {
  const row = getInterviewReportRow(id)
  return reportFromRow(row as any)
}

export function listReportsForStudent(studentId: string): InterviewReport[] {
  const rows = listInterviewReportsForStudent(studentId)
  return rows.map(r => reportFromRow(r)).filter(Boolean) as InterviewReport[]
}

export async function listReportsForStudentFull(
  studentId: string,
  supabase?: SupabaseClient | null,
): Promise<InterviewReport[]> {
  if (supabase) {
    try {
      const remote = await fetchReportsSupabase(supabase, studentId)
      if (remote.length) return remote
    } catch {}
  }
  return listReportsForStudent(studentId)
}

export async function saveFeedbackFlag(
  flag: FeedbackFlag,
  supabase?: SupabaseClient | null,
): Promise<void> {
  saveInterviewFeedbackFlagRow({
    id: flag.id,
    session_id: flag.session_id,
    student_id: flag.student_id,
    data: flag,
    created_at: flag.created_at,
  })
  await flushDB()

  if (supabase) {
    const ok = await persistInterviewFeedbackFlag(supabase, flag)
    if (!ok) console.warn('[interview] Supabase feedback flag persist failed, local preserved')
  }
}

export function getCustomOrBankQuestion(session: InterviewSession, questionId: string): InterviewQuestion | undefined {
  const raw =
    session.custom_questions && session.custom_questions[questionId]
      ? session.custom_questions[questionId]
      : QUESTION_BANK.find(q => q.id === questionId)
  if (!raw) return undefined
  return personalizeQuestion(raw, {
    track: session.track,
    year: session.year,
    studentName: session.student_name,
    projectTitle: session.project_context?.title || null,
  })
}

export interface SessionQuestionPlanItem {
  question_number: number
  total_questions: number
  id: string
  section: InterviewQuestion['section']
  section_label: string
  topic: string[]
  type: InterviewQuestion['type']
  difficulty: 1 | 2 | 3
  time_limit_min: number
  prompt: string
  hint_ladder: [string, string, string]
  follow_ups: string[]
  coding_spec?: {
    fn_name: any
    starter_code: any
    sample_input_output: any
    target_complexity: string
  }
  status: 'answered' | 'current' | 'skipped' | 'upcoming'
  student_answer?: string
  student_turn_timestamp?: string
  follow_up_qa?: Array<{ interviewer: string; student?: string }>
  interviewer_continuation_reply?: string
  hints_used: number
  evaluation_summary?: {
    strengths: string[]
    gaps: string[]
    competency_scores: Record<string, number>
    covered_points: number
    total_points: number
  }
}

export function buildSessionQuestionsPlan(session: InterviewSession): SessionQuestionPlanItem[] {
  const sections = session.blueprint?.sections || []
  const allEntries: Array<{ qId: string; sectionId: InterviewQuestion['section']; sectionLabel: string }> = []
  for (const sec of sections) {
    for (const qId of sec.question_ids || []) {
      allEntries.push({ qId, sectionId: sec.id, sectionLabel: sec.label })
    }
  }

  const total = allEntries.length
  const currentQId = session.blueprint?.current_question_id || ''
  const isSessionEnded = ['REPORT_READY', 'EVALUATING', 'ABANDONED', 'TERMINATED'].includes(session.state)
  const skippedSet = new Set(session.skipped_questions || [])
  const evalByQ = new Map<string, AnswerEvaluation>()
  for (const ev of session.evaluations || []) {
    evalByQ.set(ev.question_id, ev)
  }

  // Group student and interviewer turns per question_id
  const turns = session.turns || []

  let foundCurrent = false
  return allEntries.map((entry, idx) => {
    const q = getCustomOrBankQuestion(session, entry.qId)
    const ev = evalByQ.get(entry.qId)
    const studentTurnsForQ = turns.filter(t => t.role === 'student' && t.question_id === entry.qId)
    const mainStudentTurn = studentTurnsForQ[0]
    const hasAnswered = studentTurnsForQ.length > 0 || !!ev

    let status: SessionQuestionPlanItem['status'] = 'upcoming'
    if (entry.qId === currentQId && !isSessionEnded) {
      status = 'current'
      foundCurrent = true
    } else if (skippedSet.has(entry.qId) || ev?.skipped) {
      status = 'skipped'
    } else if (hasAnswered || (!foundCurrent && currentQId && entry.qId !== currentQId)) {
      status = hasAnswered ? 'answered' : 'upcoming'
    }

    // Collect follow-up Q&A on this question if any
    const followUpQa: Array<{ interviewer: string; student?: string }> = []
    const followUpInterviewerTurns = turns.filter(
      t => t.role === 'interviewer' && t.question_id === entry.qId && t.is_follow_up,
    )
    followUpInterviewerTurns.forEach((ft, fIdx) => {
      const followStudent = studentTurnsForQ[fIdx + 1]
      followUpQa.push({
        interviewer: ft.text,
        student: followStudent?.text,
      })
    })

    // Find the interviewer continuation turn that followed the student's answer to this question
    let continuationReply: string | undefined
    if (studentTurnsForQ.length > 0) {
      const lastStudentTurnForQ = studentTurnsForQ[studentTurnsForQ.length - 1]
      const lastIdx = turns.findIndex(t => t.id === lastStudentTurnForQ.id)
      if (lastIdx >= 0 && turns[lastIdx + 1]?.role === 'interviewer') {
        continuationReply = turns[lastIdx + 1].text
      }
    }

    const coveredCount = ev?.key_points?.filter(k => k.status === 'covered' || k.status === 'partially').length || 0
    const totalPoints = ev?.key_points?.length || q?.key_points?.length || 0

    return {
      question_number: idx + 1,
      total_questions: total,
      id: entry.qId,
      section: entry.sectionId,
      section_label: entry.sectionLabel,
      topic: q?.topic || [],
      type: q?.type || 'conceptual',
      difficulty: q?.difficulty || 1,
      time_limit_min: q?.time_limit_min || 3,
      prompt: q?.prompt || '',
      hint_ladder: q?.hint_ladder || ['', '', ''],
      follow_ups: q?.follow_ups || [],
      coding_spec: q?.coding_spec
        ? {
            fn_name: q.coding_spec.fn_name,
            starter_code: q.coding_spec.starter_code,
            sample_input_output: q.coding_spec.sample_input_output,
            target_complexity: q.coding_spec.target_complexity,
          }
        : undefined,
      status,
      student_answer:
        studentTurnsForQ.length > 0
          ? studentTurnsForQ.map(t => t.text).join('\n\n[Follow-up Answer]: ')
          : undefined,
      student_turn_timestamp: mainStudentTurn?.timestamp,
      follow_up_qa: followUpQa.length > 0 ? followUpQa : undefined,
      interviewer_continuation_reply: continuationReply,
      hints_used: session.hints_by_question?.[entry.qId] || 0,
      evaluation_summary: ev
        ? {
            strengths: ev.strengths || [],
            gaps: ev.gaps || [],
            competency_scores: (ev.competency_scores as Record<string, number>) || {},
            covered_points: coveredCount,
            total_points: totalPoints,
          }
        : undefined,
    }
  })
}

/**
 * Ensures any legacy `{track}` placeholder in turns/evaluations is cleaned
 * and guarantees that an active interview session has Sam's opening turn
 * asking Question 1 in continuation.
 */
export function ensureOpeningInterviewerTurn(session: InterviewSession): boolean {
  let mutated = false
  const trackName = formatTrackName(session.track)

  // Sanitize any existing turns that may have unreplaced {track}
  if (Array.isArray(session.turns)) {
    for (const t of session.turns) {
      if (typeof t.text === 'string' && /\{track\}/i.test(t.text)) {
        t.text = t.text.replace(/\{track\}/gi, trackName)
        mutated = true
      }
    }
  }
  if (Array.isArray(session.evaluations)) {
    for (const ev of session.evaluations) {
      if (typeof ev.question_prompt === 'string' && /\{track\}/i.test(ev.question_prompt)) {
        ev.question_prompt = ev.question_prompt.replace(/\{track\}/gi, trackName)
        mutated = true
      }
    }
  }

  const inactiveStates = ['SCHEDULED', 'CREATED', 'REPORT_READY', 'ABANDONED', 'TERMINATED']
  if (inactiveStates.includes(session.state)) return mutated

  if (!Array.isArray(session.turns)) session.turns = []
  if (session.turns.length === 0 && session.blueprint?.current_question_id) {
    const firstQ = getCustomOrBankQuestion(session, session.blueprint.current_question_id)
    if (firstQ) {
      const firstSection = session.blueprint.sections?.[0]
      const totalQs = (session.blueprint.sections || []).reduce(
        (sum, s) => sum + (s.question_ids?.length || 0),
        0,
      )
      const studentFirst = session.student_name
        ? session.student_name.trim().split(/\s+/)[0]
        : 'Candidate'
      const yearLabel = session.year === 2 ? '2nd Year' : '3rd Year'
      const modeLabel =
        session.mode === 'quick'
          ? 'Quick Practice (15 min)'
          : session.mode === 'full'
            ? 'Full Simulation (45 min)'
            : 'Standard Simulation (35 min)'

      const openingText = `Namaste ${studentFirst}! Welcome to your ${trackName} AI mock interview (${yearLabel} · ${modeLabel}). We have ${totalQs} questions planned across ${session.blueprint.sections.length} sections, and I will ask each question in continuation based on your responses. Your microphone and live recording are active. Let's begin with Question 1 of ${totalQs} (${firstSection?.label || 'Welcome & Warm-up'}): ${firstQ.prompt}`

      session.turns.push({
        id: `t_${randomUUID().slice(0, 8)}`,
        session_id: session.id,
        section: firstQ.section,
        question_id: firstQ.id,
        role: 'interviewer',
        text: openingText,
        is_follow_up: false,
        timestamp: session.started_at || new Date().toISOString(),
        latency_ms: 0,
      })
      mutated = true
    }
  }

  return mutated
}

/**
 * Extracts a short, natural topic/phrase from the student's answer so Sam can
 * acknowledge it in conversational continuation.
 */
function extractStudentHighlight(studentText: string, previousQuestion: InterviewQuestion): string | null {
  const clean = String(studentText || '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!clean || clean === '[SKIPPED]' || clean.length < 8) return null

  // Check if student mentioned any of the question's key points or topic words
  for (const kp of previousQuestion.key_points || []) {
    const words = kp
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(w => w.length >= 4)
    const matched = words.find(w => clean.toLowerCase().includes(w))
    if (matched) {
      return kp.toLowerCase()
    }
  }

  // Otherwise extract a clean 4-8 word phrase from the student's first sentence
  const firstSentence = clean.split(/[.?!]/)[0]?.trim() || clean
  const words = firstSentence.split(/\s+/).slice(0, 9).join(' ')
  if (words.length >= 10) {
    return `"${words}${firstSentence.split(/\s+/).length > 9 ? '…' : ''}"`
  }
  return null
}

/**
 * Builds a rich, natural conversational continuation reply from Sam that:
 * 1. Acknowledges the student's answer to `previousQuestion`
 * 2. Transitions smoothly in continuation to `nextQuestion` (mentioning track, section, question number)
 * 3. Explicitly asks `nextQuestion.prompt` in full.
 */
export function buildContinuationInterviewerReply(opts: {
  session: InterviewSession
  previousQuestion: InterviewQuestion
  studentText: string
  isSkipped: boolean
  evaluation: AnswerEvaluation
  nextQuestion: InterviewQuestion
  nextQuestionNumber: number
  totalQuestions: number
  nextSectionLabel: string
  sameSection: boolean
}): string {
  const {
    session,
    previousQuestion,
    studentText,
    isSkipped,
    evaluation,
    nextQuestion,
    nextQuestionNumber,
    totalQuestions,
    nextSectionLabel,
    sameSection,
  } = opts
  const trackName = formatTrackName(session.track)

  let acknowledgment = ''
  if (isSkipped) {
    acknowledgment = `No worries — we will skip that question and keep our momentum going in your ${trackName} interview.`
  } else {
    const highlight = extractStudentHighlight(studentText, previousQuestion)
    const techScore = evaluation.competency_scores?.technical_knowledge || evaluation.competency_scores?.communication || 3
    const coveredPoint = evaluation.key_points?.find(k => k.status === 'covered')?.point
    const missingPoint = evaluation.key_points?.find(k => k.status === 'missing')?.point

    if (previousQuestion.section === 'warmup') {
      acknowledgment = highlight
        ? `Thank you for sharing that! Your background around ${highlight} sets a great foundation for our ${trackName} session.`
        : `Thank you for that introduction! That gives me helpful context for your ${trackName} mock interview.`
    } else if (techScore >= 4 && coveredPoint) {
      acknowledgment = `Well explained! You clearly covered ${coveredPoint.toLowerCase()}${missingPoint ? `, and keeping ${missingPoint.toLowerCase()} in mind will make it even stronger` : ''}.`
    } else if (techScore >= 3) {
      acknowledgment = highlight
        ? `Good point on ${highlight}.${missingPoint ? ` In interviews, also remember to touch upon ${missingPoint.toLowerCase()}.` : ''}`
        : `Thanks for walking through your approach on ${previousQuestion.topic.join(' & ')}.`
    } else {
      acknowledgment = `Thank you for your attempt on ${previousQuestion.topic.join(' & ')}.${missingPoint ? ` A key concept to review here is ${missingPoint.toLowerCase()}.` : ''}`
    }
  }

  const nextTopics = nextQuestion.topic?.length ? ` (${nextQuestion.topic.join(', ')})` : ''
  const bridge = sameSection
    ? `Continuing in ${nextSectionLabel}, here is Question ${nextQuestionNumber} of ${totalQuestions}${nextTopics}:`
    : `Moving forward in continuation to our next section — ${nextSectionLabel} — here is Question ${nextQuestionNumber} of ${totalQuestions}${nextTopics}:`

  return `${acknowledgment} ${bridge} ${nextQuestion.prompt}`
}

/**
 * Ensures that an LLM-generated interviewer reply never omits the actual next question
 * and never leaves `{track}` unreplaced.
 */
export function ensureQuestionAskedInContinuation(
  llmReply: string,
  fallbackContinuationReply: string,
  nextQuestion: InterviewQuestion,
  nextQuestionNumber: number,
  totalQuestions: number,
  nextSectionLabel: string,
  track: InterviewTrack,
): string {
  const trackName = formatTrackName(track)
  const cleaned = String(llmReply || '')
    .replace(/\{track\}/gi, trackName)
    .trim()

  if (!cleaned) return fallbackContinuationReply

  // Check whether the LLM reply actually asked the new question
  const promptCore = nextQuestion.prompt
    .slice(0, Math.min(45, nextQuestion.prompt.length))
    .toLowerCase()
  const hasQuestionText = cleaned.toLowerCase().includes(promptCore)

  if (hasQuestionText) {
    return cleaned
  }

  // LLM gave conversational feedback/follow-up commentary but forgot to state the new question!
  // Combine LLM's conversational acknowledgment with the explicit next question in continuation.
  return `${cleaned}\n\nContinuing to Question ${nextQuestionNumber} of ${totalQuestions} (${nextSectionLabel} · ${nextQuestion.topic.join(', ')}): ${nextQuestion.prompt}`
}
