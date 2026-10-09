/**
 * AI Mock Interview — Session Store Helpers
 *
 * Storage modes are intentionally separate:
 *   - Local JSON is used only when Supabase is not configured (demo mode).
 *   - In Supabase mode, Postgres is authoritative and trusted writes use the
 *     service-role client after the route verifies the student's identity.
 *   - Reads and writes fail closed on Supabase errors; stale local data is
 *     never accepted as a successful remote read or write.
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
  // Supabase is authoritative in configured mode. Never calculate quota from
  // a stale local snapshot after a remote read failure.
  const existingSessions = input.supabase
    ? await fetchSessionsSupabase(input.supabase, input.student_id)
    : listSessionsForStudentLocal(input.student_id)

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

  if (input.supabase) {
    const ok = await persistSessionSupabase(input.supabase, session)
    if (!ok) throw new Error('Interview session was not saved to Supabase')
  } else {
    saveInterviewSessionRow({
      id: session.id,
      student_id: session.student_id,
      data: session,
      created_at: now,
      updated_at: now,
    })
    await flushDB()
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
  if (!supabase) return getInterviewSessionLocal(id)

  // In Supabase mode, a missing row stays missing and a query error bubbles up.
  // Falling back to the server's JSON store could return stale or another
  // account's copy, and can hide a broken live database connection.
  const base = await fetchSessionSupabase(supabase, id)
  if (!base) return null

  const [turns, codeSubs, evals] = await Promise.all([
    fetchInterviewTurns(supabase, id),
    fetchInterviewCodeSubmissions(supabase, id),
    fetchInterviewEvaluations(supabase, id),
  ])
  base.turns = turns
  base.code_submissions = codeSubs
  base.evaluations = evals
  return base
}

export async function saveInterviewSession(
  session: InterviewSession,
  supabase?: SupabaseClient | null,
  opts: { persistTurns?: boolean; persistEvals?: boolean; persistCode?: boolean; persistIntegrity?: boolean; persistConsent?: boolean } = {},
): Promise<void> {
  const now = new Date().toISOString()
  const toSave = { ...session, last_active_at: now }

  if (!supabase) {
    saveInterviewSessionRow({
      id: toSave.id,
      student_id: toSave.student_id,
      data: toSave,
      created_at: toSave.created_at,
      updated_at: now,
    })
    await flushDB()
    return
  }

  if (!(await persistSessionSupabase(supabase, toSave))) {
    throw new Error('Interview session was not saved to Supabase')
  }

  // Persist normalized records and fail the API response if any component did
  // not reach Supabase. This avoids reporting a saved answer when only the
  // server-local fallback received it.
  if (opts.persistTurns && toSave.turns?.length) {
    // One answer exchange appends both the student response and the generated
    // interviewer reply; persist both rows, not just the last reply.
    const latestTurns = toSave.turns.slice(-2)
    for (const turn of latestTurns) {
      if (!(await persistInterviewTurn(supabase, turn, toSave.student_id))) {
        throw new Error('Interview turn was not saved to Supabase')
      }
    }
  }
  if (opts.persistCode && toSave.code_submissions?.length) {
    const latest = toSave.code_submissions[toSave.code_submissions.length - 1]
    if (latest && !(await persistInterviewCodeSubmission(supabase, latest, toSave.student_id))) {
      throw new Error('Interview code submission was not saved to Supabase')
    }
  }
  if (opts.persistEvals && toSave.evaluations?.length) {
    const latest = toSave.evaluations[toSave.evaluations.length - 1]
    if (latest && !(await persistInterviewEvaluation(supabase, latest, toSave.id, toSave.student_id))) {
      throw new Error('Interview evaluation was not saved to Supabase')
    }
  }
  if (opts.persistIntegrity && toSave.integrity_events?.length) {
    // A request can record more than one integrity signal (e.g. a tab event
    // plus prompt-injection detection). Upserts are idempotent by event id.
    for (const event of toSave.integrity_events) {
      if (!(await persistInterviewIntegrityEvent(supabase, event, toSave.student_id))) {
        throw new Error('Interview integrity event was not saved to Supabase')
      }
    }
  }
  if (opts.persistConsent && toSave.consent && !(await persistInterviewConsents(supabase, toSave))) {
    throw new Error('Interview consent was not saved to Supabase')
  }
}

export function listSessionsForStudent(studentId: string): InterviewSession[] {
  return listSessionsForStudentLocal(studentId)
}

export async function listSessionsForStudentFull(
  studentId: string,
  supabase?: SupabaseClient | null,
): Promise<InterviewSession[]> {
  return supabase
    ? fetchSessionsSupabase(supabase, studentId)
    : listSessionsForStudentLocal(studentId)
}

export function getQuotaForStudent(studentId: string): { used: number; remaining: number; max: number; sessions: InterviewSession[] } {
  return getQuotaForStudentLocal(studentId)
}

export async function getQuotaForStudentFull(
  studentId: string,
  supabase?: SupabaseClient | null,
): Promise<{ used: number; remaining: number; max: number; sessions: InterviewSession[]; reports: InterviewReport[] }> {
  const [sessions, reports] = supabase
    ? await Promise.all([
        fetchSessionsSupabase(supabase, studentId),
        fetchReportsSupabase(supabase, studentId),
      ])
    : [listSessionsForStudentLocal(studentId), listReportsForStudent(studentId)]

  const active = sessions.filter((session) => session.state !== 'ABANDONED')
  return {
    used: active.length,
    remaining: Math.max(0, MAX_INTERVIEW_ATTEMPTS - active.length),
    max: MAX_INTERVIEW_ATTEMPTS,
    sessions,
    reports,
  }
}

export async function saveReport(
  report: InterviewReport,
  supabase?: SupabaseClient | null,
): Promise<void> {
  if (supabase) {
    if (!(await persistReportSupabase(supabase, report))) {
      throw new Error('Interview report was not saved to Supabase')
    }
    return
  }

  saveInterviewReportRow({
    id: report.id,
    session_id: report.session_id,
    student_id: report.student_id,
    data: report,
    created_at: report.created_at,
  })
  await flushDB()
}

export function getReportBySession(sessionId: string): InterviewReport | null {
  const row = getInterviewReportBySession(sessionId)
  return reportFromRow(row as any)
}

export async function getReportBySessionFull(
  sessionId: string,
  supabase?: SupabaseClient | null,
): Promise<InterviewReport | null> {
  return supabase
    ? fetchReportSupabase(supabase, sessionId)
    : getReportBySession(sessionId)
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
  return supabase
    ? fetchReportsSupabase(supabase, studentId)
    : listReportsForStudent(studentId)
}

export async function saveFeedbackFlag(
  flag: FeedbackFlag,
  supabase?: SupabaseClient | null,
): Promise<void> {
  if (supabase) {
    if (!(await persistInterviewFeedbackFlag(supabase, flag))) {
      throw new Error('Interview feedback was not saved to Supabase')
    }
    return
  }

  saveInterviewFeedbackFlagRow({
    id: flag.id,
    session_id: flag.session_id,
    student_id: flag.student_id,
    data: flag,
    created_at: flag.created_at,
  })
  await flushDB()
}

export function getCustomOrBankQuestion(session: InterviewSession, questionId: string): InterviewQuestion | undefined {
  if (session.custom_questions && session.custom_questions[questionId]) {
    return session.custom_questions[questionId]
  }
  return QUESTION_BANK.find(q => q.id === questionId)
}
