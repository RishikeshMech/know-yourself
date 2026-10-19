'use client'
/**
 * Browser-side client for /api/company-assessments/*.
 *
 * Attaches the Supabase access token (when a Supabase session exists) so the
 * server can verify WHO is starting / saving / submitting an attempt — the
 * basis of the one-attempt-per-company rule. In local demo mode there is no
 * token and the server falls back to the student id.
 */
import { getSupabase } from '../supabase.ts'
import { supabaseAuthHeaders } from '../clientAuth.ts'
import type { AttemptSummary, ClientPaper } from './types.ts'
import type { PublicResult } from './scoring.ts'
import type { TestRunResult } from '../runTests.ts'
import type { OnDemandReview } from './aiReview.ts'

export interface ApiResponse<T> {
  ok: boolean
  status: number
  data: T & { error?: string }
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown, opts: { keepalive?: boolean; timeoutMs?: number } = {}): Promise<ApiResponse<T>> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 30_000)
  try {
    const headers = await supabaseAuthHeaders({ 'Content-Type': 'application/json' })
    let res = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
      keepalive: opts.keepalive,
      signal: ctrl.signal,
    })

    // If unauthorized (401), the access token may have expired. Refresh session and retry once.
    if (res.status === 401) {
      try {
        const sb = getSupabase()
        if (sb) {
          const { data: refreshData, error: refreshErr } = await sb.auth.refreshSession()
          if (!refreshErr && refreshData?.session?.access_token) {
            headers.set('Authorization', `Bearer ${refreshData.session.access_token}`)
            res = await fetch(path, {
              method,
              headers,
              body: body === undefined ? undefined : JSON.stringify(body),
              cache: 'no-store',
              keepalive: opts.keepalive,
              signal: ctrl.signal,
            })
          }
        }
      } catch {
        // Refresh failed — keep original response
      }
    }

    let data: any = {}
    try { data = await res.json() } catch { data = {} }
    return { ok: res.ok, status: res.status, data }
  } catch (e: any) {
    return { ok: false, status: 0, data: { error: e?.name === 'AbortError' ? 'The request timed out.' : 'Network error — check your connection.' } as any }
  } finally {
    clearTimeout(timer)
  }
}

const q = (params: Record<string, string>) => new URLSearchParams(params).toString()

export interface AttemptView {
  attempt: AttemptSummary & { id: string; duration_sec: number }
  paper: ClientPaper
  answers: Record<string, unknown>
  /** Sticky proctoring counters — a resume restores the warning budget. */
  proctoring?: { strikes: number; camera: boolean | null; fullscreen: boolean | null }
  server_now: string
}

export const companyApi = {
  list: (studentId: string) =>
    call<{ attempts: AttemptSummary[] }>('GET', `/api/company-assessments?${q({ student_id: studentId })}`),
  start: (studentId: string, company: string) =>
    call<Partial<AttemptView> & { outcome: 'created' | 'resumed' | 'completed'; attempt?: AttemptSummary }>(
      'POST', '/api/company-assessments/start', { student_id: studentId, company }),
  attempt: (studentId: string, company: string) =>
    call<Partial<AttemptView> & { state: 'none' | 'in_progress' | 'completed' }>(
      'GET', `/api/company-assessments/attempt?${q({ student_id: studentId, company })}`),
  save: (studentId: string, company: string, answers: Record<string, unknown>, proctoring: unknown, keepalive = false) =>
    call<{ saved: boolean; reason?: string }>('POST', '/api/company-assessments/save', { student_id: studentId, company, answers, proctoring }, { keepalive, timeoutMs: 15_000 }),
  submit: (studentId: string, company: string, answers: Record<string, unknown>, proctoring: unknown, auto: boolean, reason?: string) =>
    call<{ submitted: boolean; result: PublicResult | null; attempt: AttemptSummary }>(
      'POST', '/api/company-assessments/submit', { student_id: studentId, company, answers, proctoring, auto, reason }, { timeoutMs: 90_000 }),
  languages: () =>
    call<{ languages: Array<{ id: string }> }>('GET', '/api/company-assessments/languages'),
  runTests: (studentId: string, company: string, itemId: string, lang: string, code: string) =>
    call<TestRunResult & { ok: boolean }>('POST', '/api/company-assessments/runtests', { student_id: studentId, company, item_id: itemId, lang, code }, { timeoutMs: 50_000 }),
  evaluateAnswer: (studentId: string, company: string, itemId: string, kind: 'written' | 'coding', answer: string, lang?: string) =>
    call<{ ok: boolean; result: OnDemandReview }>('POST', '/api/company-assessments/evaluate', { student_id: studentId, company, item_id: itemId, kind, answer, ...(lang ? { lang } : {}) }, { timeoutMs: 25_000 }),
  result: (studentId: string, company: string) =>
    call<{ state: 'none' | 'in_progress' | 'completed'; attempt?: AttemptSummary & { proctoring?: { strikes: number; camera: boolean | null }; submit_reason?: string | null }; result?: PublicResult | null }>(
      'GET', `/api/company-assessments/result?${q({ student_id: studentId, company })}`),
}

export interface CachedCompanyResult {
  attempt: AttemptSummary & { proctoring?: { strikes: number; camera: boolean | null }; submit_reason?: string | null }
  result: PublicResult | null
  savedAt: number
}

export function saveCompanyResultCache(
  slug: string,
  attempt: AttemptSummary & { proctoring?: { strikes: number; camera: boolean | null }; submit_reason?: string | null },
  result: PublicResult | null,
): void {
  if (typeof window === 'undefined') return
  try {
    const payload: CachedCompanyResult = { attempt, result, savedAt: Date.now() }
    const str = JSON.stringify(payload)
    sessionStorage.setItem(`calibiai_company_result_${slug}`, str)
    localStorage.setItem(`calibiai_company_result_${slug}`, str)

    // Also update the list in calibiai_company_attempts
    const list = getCompanyAttemptsCache()
    const idx = list.findIndex((a) => a.company === slug)
    if (idx >= 0) list[idx] = attempt
    else list.push(attempt)
    saveCompanyAttemptsCache(list)

    window.dispatchEvent(new CustomEvent('calibiai_company_attempt_updated', { detail: attempt }))
  } catch {
    // Ignore storage quota errors
  }
}

export function getCompanyResultCache(slug: string): CachedCompanyResult | null {
  if (typeof window === 'undefined') return null
  try {
    const fromSession = sessionStorage.getItem(`calibiai_company_result_${slug}`)
    if (fromSession) {
      const parsed = JSON.parse(fromSession)
      if (parsed?.attempt) return parsed
    }
    const fromLocal = localStorage.getItem(`calibiai_company_result_${slug}`)
    if (fromLocal) {
      const parsed = JSON.parse(fromLocal)
      if (parsed?.attempt) return parsed
    }
  } catch {
    // Ignore parse errors
  }
  return null
}

export function getCompanyAttemptsCache(): AttemptSummary[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem('calibiai_company_attempts')
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch {
    // Ignore parse errors
  }
  return []
}

export function saveCompanyAttemptsCache(attempts: AttemptSummary[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem('calibiai_company_attempts', JSON.stringify(attempts))
  } catch {
    // Ignore storage quota errors
  }
}
