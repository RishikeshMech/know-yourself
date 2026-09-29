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
import { QUESTION_BANK } from './questionBank.ts'
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
  if (session.custom_questions && session.custom_questions[questionId]) {
    return session.custom_questions[questionId]
  }
  return QUESTION_BANK.find(q => q.id === questionId)
}
