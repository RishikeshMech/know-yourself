/**
 * AI Mock Interview — Supabase Persistence
 *
 * This module maps interview records to Postgres. The store uses this path as
 * the only source of truth when Supabase is configured; local JSON is reserved
 * for unconfigured demo mode. Persistence failures must be surfaced to the API
 * caller rather than silently converted into successful local-only writes.
 *
 * Tables (migration 0011):
 *   interview_sessions, interview_turns, interview_code_submissions,
 *   interview_evaluations, interview_reports, interview_consents,
 *   interview_integrity_events, interview_feedback_flags
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { toUuid } from '../persist.ts'
import type {
  InterviewSession,
  InterviewTurn,
  InterviewCodeSubmission,
  AnswerEvaluation,
  InterviewReport,
  IntegrityEvent,
  FeedbackFlag,
  ConsentRecord,
} from './types.ts'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function ensureUuid(id: string, scope: string): string {
  const mapped = toUuid(id, scope)
  return mapped || randomUUID()
}

function studentUuid(studentId: string): string | null {
  return toUuid(studentId, 'profile')
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------
export function interviewSessionRow(session: InterviewSession): Record<string, any> | null {
  const sid = studentUuid(session.student_id)
  if (!sid) {
    console.warn('[supabase] interview session persist skipped: invalid student_id', session.student_id)
    return null
  }
  return {
    id: ensureUuid(session.id, 'interview-session'),
    student_id: sid,
    attempt_number: session.attempt_number,
    track: session.track,
    year: session.year,
    mode: session.mode,
    language_style: session.language_style,
    state: session.state,
    previous_active_state: session.previous_active_state || null,
    scheduled_for: session.scheduled_for ? new Date(session.scheduled_for).toISOString() : null,
    project_context: session.project_context || null,
    blueprint: session.blueprint,
    custom_questions: session.custom_questions || {},
    consent: session.consent || null,
    device_check: session.device_check || null,
    hints_by_question: session.hints_by_question || {},
    skipped_questions: session.skipped_questions || [],
    abuse_strikes: session.abuse_strikes || 0,
    pause_count: session.pause_count || 0,
    paused_at: session.paused_at ? new Date(session.paused_at).toISOString() : null,
    total_paused_sec: session.total_paused_sec || 0,
    started_at: session.started_at ? new Date(session.started_at).toISOString() : null,
    ended_at: session.ended_at ? new Date(session.ended_at).toISOString() : null,
    last_active_at: session.last_active_at ? new Date(session.last_active_at).toISOString() : new Date().toISOString(),
    duration_sec: session.duration_sec || 0,
    token_usage: session.token_usage,
    model_versions: session.model_versions,
    report_id: session.report_id ? ensureUuid(session.report_id, 'interview-report') : null,
    created_at: session.created_at ? new Date(session.created_at).toISOString() : new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

export async function persistInterviewSession(client: SupabaseClient, session: InterviewSession): Promise<boolean> {
  const row = interviewSessionRow(session)
  if (!row) return false
  try {
    const { error } = await client.from('interview_sessions').upsert(row, { onConflict: 'id' })
    if (error) {
      console.warn('[supabase] interview_sessions persist failed:', error.message)
      return false
    }
    return true
  } catch (e: any) {
    console.warn('[supabase] interview_sessions persist failed:', e?.message || e)
    return false
  }
}

export async function fetchInterviewSession(client: SupabaseClient, sessionId: string): Promise<InterviewSession | null> {
  const id = ensureUuid(sessionId, 'interview-session')
  try {
    const { data, error } = await client.from('interview_sessions').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    if (!data) return null
    // Reconstruct session from row
    return {
      id: data.id,
      student_id: data.student_id,
      attempt_number: data.attempt_number,
      track: data.track,
      year: data.year,
      mode: data.mode,
      language_style: data.language_style,
      state: data.state,
      previous_active_state: data.previous_active_state || undefined,
      scheduled_for: data.scheduled_for,
      project_context: data.project_context,
      blueprint: data.blueprint,
      custom_questions: data.custom_questions || {},
      consent: data.consent,
      device_check: data.device_check,
      turns: [], // Turns loaded separately for efficiency
      hints_by_question: data.hints_by_question || {},
      skipped_questions: data.skipped_questions || [],
      code_submissions: [],
      evaluations: [],
      integrity_events: [],
      abuse_strikes: data.abuse_strikes || 0,
      pause_count: data.pause_count || 0,
      paused_at: data.paused_at,
      total_paused_sec: data.total_paused_sec || 0,
      started_at: data.started_at,
      ended_at: data.ended_at,
      last_active_at: data.last_active_at,
      duration_sec: data.duration_sec || 0,
      token_usage: data.token_usage,
      model_versions: data.model_versions,
      report_id: data.report_id,
      created_at: data.created_at,
    } as InterviewSession
  } catch (error) {
    throw error
  }
}

export async function fetchInterviewSessionsForStudent(client: SupabaseClient, studentId: string): Promise<InterviewSession[]> {
  const sid = studentUuid(studentId)
  if (!sid) throw new Error('Invalid interview student id')
  try {
    const { data, error } = await client
      .from('interview_sessions')
      .select('*')
      .eq('student_id', sid)
      .order('created_at', { ascending: false })
    if (error) throw error
    if (!Array.isArray(data)) throw new Error('Supabase returned an invalid interview result')
    return data.map(row => ({
      id: row.id,
      student_id: row.student_id,
      attempt_number: row.attempt_number,
      track: row.track,
      year: row.year,
      mode: row.mode,
      language_style: row.language_style,
      state: row.state,
      previous_active_state: row.previous_active_state || undefined,
      scheduled_for: row.scheduled_for,
      project_context: row.project_context,
      blueprint: row.blueprint,
      custom_questions: row.custom_questions || {},
      consent: row.consent,
      device_check: row.device_check,
      turns: [],
      hints_by_question: row.hints_by_question || {},
      skipped_questions: row.skipped_questions || [],
      code_submissions: [],
      evaluations: [],
      integrity_events: [],
      abuse_strikes: row.abuse_strikes || 0,
      pause_count: row.pause_count || 0,
      paused_at: row.paused_at,
      total_paused_sec: row.total_paused_sec || 0,
      started_at: row.started_at,
      ended_at: row.ended_at,
      last_active_at: row.last_active_at,
      duration_sec: row.duration_sec || 0,
      token_usage: row.token_usage,
      model_versions: row.model_versions,
      report_id: row.report_id,
      created_at: row.created_at,
    })) as InterviewSession[]
  } catch (error) {
    throw error
  }
}

// ---------------------------------------------------------------------------
// Turns — each Q&A turn stored immediately, no loss
// ---------------------------------------------------------------------------
export function interviewTurnRow(turn: InterviewTurn, studentId: string): Record<string, any> | null {
  const sid = studentUuid(studentId)
  if (!sid) return null
  return {
    id: ensureUuid(turn.id, 'interview-turn'),
    session_id: ensureUuid(turn.session_id, 'interview-session'),
    student_id: sid,
    section: turn.section,
    question_id: turn.question_id,
    role: turn.role,
    text: turn.text,
    is_follow_up: !!turn.is_follow_up,
    follow_up_index: turn.follow_up_index ?? null,
    hint_level: turn.hint_level ?? 0,
    input_mode: turn.input_mode || 'text',
    code_snapshot: turn.code_snapshot || null,
    code_language: turn.code_language || null,
    timestamp: turn.timestamp ? new Date(turn.timestamp).toISOString() : new Date().toISOString(),
    latency_ms: turn.latency_ms ?? null,
    created_at: new Date().toISOString(),
  }
}

export async function persistInterviewTurn(client: SupabaseClient, turn: InterviewTurn, studentId: string): Promise<boolean> {
  const row = interviewTurnRow(turn, studentId)
  if (!row) return false
  try {
    const { error } = await client.from('interview_turns').upsert(row, { onConflict: 'id' })
    if (error) {
      console.warn('[supabase] interview_turns persist failed:', error.message)
      return false
    }
    return true
  } catch (e: any) {
    console.warn('[supabase] interview_turns persist failed:', e?.message || e)
    return false
  }
}

export async function fetchInterviewTurns(client: SupabaseClient, sessionId: string): Promise<InterviewTurn[]> {
  const sid = ensureUuid(sessionId, 'interview-session')
  try {
    const { data, error } = await client
      .from('interview_turns')
      .select('*')
      .eq('session_id', sid)
      .order('created_at', { ascending: true })
    if (error) throw error
    if (!Array.isArray(data)) throw new Error('Supabase returned an invalid interview result')
    return data.map(r => ({
      id: r.id,
      session_id: r.session_id,
      section: r.section,
      question_id: r.question_id,
      role: r.role,
      text: r.text,
      is_follow_up: r.is_follow_up,
      follow_up_index: r.follow_up_index ?? undefined,
      hint_level: r.hint_level,
      input_mode: r.input_mode,
      code_snapshot: r.code_snapshot || undefined,
      code_language: r.code_language || undefined,
      timestamp: r.timestamp,
      latency_ms: r.latency_ms ?? undefined,
    })) as InterviewTurn[]
  } catch (error) {
    throw error
  }
}

// ---------------------------------------------------------------------------
// Code submissions
// ---------------------------------------------------------------------------
export function interviewCodeSubmissionRow(sub: InterviewCodeSubmission, studentId: string): Record<string, any> | null {
  const sid = studentUuid(studentId)
  if (!sid) return null
  return {
    id: ensureUuid(sub.id, 'interview-code'),
    session_id: ensureUuid(sub.session_id, 'interview-session'),
    student_id: sid,
    question_id: sub.question_id,
    language: sub.language,
    code: sub.code,
    passed: sub.passed,
    total: sub.total,
    test_results: sub.test_results,
    runtime_ms: sub.runtime_ms,
    submitted_at: sub.submitted_at ? new Date(sub.submitted_at).toISOString() : new Date().toISOString(),
    created_at: new Date().toISOString(),
  }
}

export async function persistInterviewCodeSubmission(
  client: SupabaseClient,
  sub: InterviewCodeSubmission,
  studentId: string,
): Promise<boolean> {
  const row = interviewCodeSubmissionRow(sub, studentId)
  if (!row) return false
  try {
    const { error } = await client.from('interview_code_submissions').upsert(row, { onConflict: 'id' })
    if (error) {
      console.warn('[supabase] interview_code_submissions persist failed:', error.message)
      return false
    }
    return true
  } catch (e: any) {
    console.warn('[supabase] interview_code_submissions persist failed:', e?.message || e)
    return false
  }
}

export async function fetchInterviewCodeSubmissions(client: SupabaseClient, sessionId: string): Promise<InterviewCodeSubmission[]> {
  const sid = ensureUuid(sessionId, 'interview-session')
  try {
    const { data, error } = await client
      .from('interview_code_submissions')
      .select('*')
      .eq('session_id', sid)
      .order('submitted_at', { ascending: true })
    if (error) throw error
    if (!Array.isArray(data)) throw new Error('Supabase returned an invalid interview result')
    return data.map(r => ({
      id: r.id,
      session_id: r.session_id,
      question_id: r.question_id,
      language: r.language,
      code: r.code,
      passed: r.passed,
      total: r.total,
      test_results: r.test_results,
      runtime_ms: r.runtime_ms,
      submitted_at: r.submitted_at,
    })) as InterviewCodeSubmission[]
  } catch (error) {
    throw error
  }
}

// ---------------------------------------------------------------------------
// Evaluations
// ---------------------------------------------------------------------------
export function interviewEvaluationRow(ev: AnswerEvaluation, sessionId: string, studentId: string): Record<string, any> | null {
  const sid = studentUuid(studentId)
  if (!sid) return null
  return {
    id: ensureUuid(`${sessionId}_${ev.question_id}`, 'interview-eval'),
    session_id: ensureUuid(sessionId, 'interview-session'),
    student_id: sid,
    question_id: ev.question_id,
    question_prompt: ev.question_prompt,
    section: ev.section,
    topic: ev.topic,
    skipped: ev.skipped,
    hints_used: ev.hints_used,
    hint_penalty: ev.hint_penalty,
    raw_competency_scores: ev.raw_competency_scores,
    competency_scores: ev.competency_scores,
    key_points: ev.key_points,
    strengths: ev.strengths,
    gaps: ev.gaps,
    student_quote: ev.student_quote,
    model_answer: ev.model_answer,
    model_answer_hint: ev.model_answer_hint,
    code_review: ev.code_review || null,
    confidence: ev.confidence,
    low_confidence: ev.low_confidence,
    evaluator_engine: ev.evaluator_engine,
    evaluated_at: ev.evaluated_at ? new Date(ev.evaluated_at).toISOString() : new Date().toISOString(),
    created_at: new Date().toISOString(),
  }
}

export async function persistInterviewEvaluation(
  client: SupabaseClient,
  ev: AnswerEvaluation,
  sessionId: string,
  studentId: string,
): Promise<boolean> {
  const row = interviewEvaluationRow(ev, sessionId, studentId)
  if (!row) return false
  try {
    const { error } = await client.from('interview_evaluations').upsert(row, { onConflict: 'id' })
    if (error) {
      console.warn('[supabase] interview_evaluations persist failed:', error.message)
      return false
    }
    return true
  } catch (e: any) {
    console.warn('[supabase] interview_evaluations persist failed:', e?.message || e)
    return false
  }
}

export async function fetchInterviewEvaluations(client: SupabaseClient, sessionId: string): Promise<AnswerEvaluation[]> {
  const sid = ensureUuid(sessionId, 'interview-session')
  try {
    const { data, error } = await client
      .from('interview_evaluations')
      .select('*')
      .eq('session_id', sid)
      .order('evaluated_at', { ascending: true })
    if (error) throw error
    if (!Array.isArray(data)) throw new Error('Supabase returned an invalid interview result')
    return data.map(r => ({
      question_id: r.question_id,
      question_prompt: r.question_prompt,
      section: r.section,
      topic: r.topic,
      skipped: r.skipped,
      hints_used: r.hints_used,
      hint_penalty: Number(r.hint_penalty) || 0,
      raw_competency_scores: r.raw_competency_scores,
      competency_scores: r.competency_scores,
      key_points: r.key_points,
      strengths: r.strengths,
      gaps: r.gaps,
      student_quote: r.student_quote,
      model_answer: r.model_answer,
      model_answer_hint: r.model_answer_hint,
      code_review: r.code_review || undefined,
      confidence: Number(r.confidence) || 0.75,
      low_confidence: !!r.low_confidence,
      evaluator_engine: r.evaluator_engine,
      evaluated_at: r.evaluated_at,
    })) as AnswerEvaluation[]
  } catch (error) {
    throw error
  }
}

// ---------------------------------------------------------------------------
// Reports — final report, overall score server-side
// ---------------------------------------------------------------------------
export function interviewReportRow(report: InterviewReport): Record<string, any> | null {
  const sid = studentUuid(report.student_id)
  if (!sid) return null
  return {
    id: ensureUuid(report.id, 'interview-report'),
    session_id: ensureUuid(report.session_id, 'interview-session'),
    student_id: sid,
    attempt_number: report.attempt_number,
    track: report.track,
    year: report.year,
    mode: report.mode,
    language_style: report.language_style,
    overall_score: report.overall_score,
    band: report.band,
    band_meaning: report.band_meaning,
    has_coding: report.has_coding,
    duration_sec: report.duration_sec,
    started_at: report.started_at ? new Date(report.started_at).toISOString() : null,
    completed_at: report.completed_at ? new Date(report.completed_at).toISOString() : new Date().toISOString(),
    competencies: report.competencies,
    top_strengths: report.top_strengths,
    top_improvements: report.top_improvements,
    question_reviews: report.question_reviews,
    integrity_events: report.integrity_events,
    learning_plan: report.learning_plan,
    trend: report.trend,
    low_confidence_warning: report.low_confidence_warning,
    ai_summary: report.ai_summary,
    model_versions: report.model_versions,
    student_rating: report.student_rating || null,
    created_at: report.created_at ? new Date(report.created_at).toISOString() : new Date().toISOString(),
  }
}

export async function persistInterviewReport(client: SupabaseClient, report: InterviewReport): Promise<boolean> {
  const row = interviewReportRow(report)
  if (!row) return false
  try {
    const { error } = await client.from('interview_reports').upsert(row, { onConflict: 'session_id' })
    if (error) {
      console.warn('[supabase] interview_reports persist failed:', error.message)
      return false
    }
    return true
  } catch (e: any) {
    console.warn('[supabase] interview_reports persist failed:', e?.message || e)
    return false
  }
}

export async function fetchInterviewReportBySession(client: SupabaseClient, sessionId: string): Promise<InterviewReport | null> {
  const sid = ensureUuid(sessionId, 'interview-session')
  try {
    const { data, error } = await client.from('interview_reports').select('*').eq('session_id', sid).maybeSingle()
    if (error) throw error
    if (!data) return null
    return {
      id: data.id,
      session_id: data.session_id,
      student_id: data.student_id,
      attempt_number: data.attempt_number,
      track: data.track,
      year: data.year,
      mode: data.mode,
      language_style: data.language_style,
      overall_score: data.overall_score,
      band: data.band,
      band_meaning: data.band_meaning,
      has_coding: data.has_coding,
      duration_sec: data.duration_sec,
      started_at: data.started_at,
      completed_at: data.completed_at,
      competencies: data.competencies,
      top_strengths: data.top_strengths,
      top_improvements: data.top_improvements,
      question_reviews: data.question_reviews,
      integrity_events: data.integrity_events,
      learning_plan: data.learning_plan,
      trend: data.trend,
      low_confidence_warning: data.low_confidence_warning,
      ai_summary: data.ai_summary,
      model_versions: data.model_versions,
      student_rating: data.student_rating || undefined,
      created_at: data.created_at,
    } as InterviewReport
  } catch (error) {
    throw error
  }
}

export async function fetchInterviewReportsForStudent(client: SupabaseClient, studentId: string): Promise<InterviewReport[]> {
  const sid = studentUuid(studentId)
  if (!sid) throw new Error('Invalid interview student id')
  try {
    const { data, error } = await client
      .from('interview_reports')
      .select('*')
      .eq('student_id', sid)
      .order('created_at', { ascending: false })
    if (error) throw error
    if (!Array.isArray(data)) throw new Error('Supabase returned an invalid interview result')
    return data.map(r => ({
      id: r.id,
      session_id: r.session_id,
      student_id: r.student_id,
      attempt_number: r.attempt_number,
      track: r.track,
      year: r.year,
      mode: r.mode,
      language_style: r.language_style,
      overall_score: r.overall_score,
      band: r.band,
      band_meaning: r.band_meaning,
      has_coding: r.has_coding,
      duration_sec: r.duration_sec,
      started_at: r.started_at,
      completed_at: r.completed_at,
      competencies: r.competencies,
      top_strengths: r.top_strengths,
      top_improvements: r.top_improvements,
      question_reviews: r.question_reviews,
      integrity_events: r.integrity_events,
      learning_plan: r.learning_plan,
      trend: r.trend,
      low_confidence_warning: r.low_confidence_warning,
      ai_summary: r.ai_summary,
      model_versions: r.model_versions,
      student_rating: r.student_rating || undefined,
      created_at: r.created_at,
    })) as InterviewReport[]
  } catch (error) {
    throw error
  }
}

// ---------------------------------------------------------------------------
// Integrity events
// ---------------------------------------------------------------------------
export function interviewIntegrityRow(ev: IntegrityEvent, studentId: string): Record<string, any> | null {
  const sid = studentUuid(studentId)
  if (!sid) return null
  return {
    id: ensureUuid(ev.id, 'interview-integrity'),
    session_id: ensureUuid(ev.session_id, 'interview-session'),
    student_id: sid,
    type: ev.type,
    details: ev.details,
    timestamp: ev.timestamp ? new Date(ev.timestamp).toISOString() : new Date().toISOString(),
    created_at: new Date().toISOString(),
  }
}

export async function persistInterviewIntegrityEvent(
  client: SupabaseClient,
  ev: IntegrityEvent,
  studentId: string,
): Promise<boolean> {
  const row = interviewIntegrityRow(ev, studentId)
  if (!row) return false
  try {
    const { error } = await client.from('interview_integrity_events').upsert(row, { onConflict: 'id' })
    if (error) {
      console.warn('[supabase] interview_integrity_events persist failed:', error.message)
      return false
    }
    return true
  } catch (e: any) {
    console.warn('[supabase] interview_integrity_events persist failed:', e?.message || e)
    return false
  }
}

// ---------------------------------------------------------------------------
// Consents
// ---------------------------------------------------------------------------
export async function persistInterviewConsents(
  client: SupabaseClient,
  session: InterviewSession,
): Promise<boolean> {
  const sid = studentUuid(session.student_id)
  if (!sid || !session.consent) return false
  const sessionId = ensureUuid(session.id, 'interview-session')
  const consents: Array<{ scope: string; granted: boolean }> = [
    { scope: 'ai_notice', granted: !!session.consent.accepted_ai_notice },
    { scope: 'record', granted: !!session.consent.record_session },
    { scope: 'share_with_faculty', granted: !!session.consent.share_with_faculty },
    { scope: 'camera_mic', granted: !!session.consent.camera_mic_enabled },
  ]
  try {
    for (const c of consents) {
      const row = {
        student_id: sid,
        session_id: sessionId,
        scope: c.scope,
        granted_at: c.granted ? new Date().toISOString() : null,
        revoked_at: !c.granted ? new Date().toISOString() : null,
        details: session.consent,
      }
      const { error } = await client.from('interview_consents').insert(row)
      if (error && !String(error.message).toLowerCase().includes('duplicate')) {
        console.warn('[supabase] interview_consents persist failed:', error.message)
        return false
      }
    }
    return true
  } catch (e: any) {
    console.warn('[supabase] interview_consents persist failed:', e?.message || e)
    return false
  }
}

// ---------------------------------------------------------------------------
// Feedback flags (unfair score)
// ---------------------------------------------------------------------------
export function interviewFeedbackFlagRow(flag: FeedbackFlag): Record<string, any> | null {
  const sid = studentUuid(flag.student_id)
  if (!sid) return null
  return {
    id: ensureUuid(flag.id, 'interview-feedback'),
    session_id: ensureUuid(flag.session_id, 'interview-session'),
    student_id: sid,
    question_id: flag.question_id,
    reason: flag.reason,
    status: flag.status,
    created_at: flag.created_at ? new Date(flag.created_at).toISOString() : new Date().toISOString(),
  }
}

export async function persistInterviewFeedbackFlag(client: SupabaseClient, flag: FeedbackFlag): Promise<boolean> {
  const row = interviewFeedbackFlagRow(flag)
  if (!row) return false
  try {
    const { error } = await client.from('interview_feedback_flags').upsert(row, { onConflict: 'id' })
    if (error) {
      console.warn('[supabase] interview_feedback_flags persist failed:', error.message)
      return false
    }
    return true
  } catch (e: any) {
    console.warn('[supabase] interview_feedback_flags persist failed:', e?.message || e)
    return false
  }
}
