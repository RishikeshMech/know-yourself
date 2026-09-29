/**
 * Company-assessment attempts: start / resume / autosave / submit.
 *
 * THE RULE: one student gets exactly one attempt per company assessment.
 * It is enforced on the server, in three layers:
 *   1. The attempt id is derived from (student, company), so there is only
 *      ever one row to find — racing workers converge on the same id.
 *   2. Starting never overwrites: the local store checks first, and the
 *      Supabase insert is ON CONFLICT DO NOTHING against a
 *      UNIQUE (student_id, company_slug) constraint, after which the
 *      canonical row is re-read.
 *   3. The paper seed is derived from (student, company, server secret), so
 *      even two instances that race to create an attempt build the identical
 *      paper.
 * A submitted or timed-out attempt is final: /start answers 409.
 *
 * Timers are server-authoritative: `expires_at` is set here, saves are refused
 * after it (plus a small network grace), and an attempt left open past its
 * deadline is finalised lazily with its last autosaved answers.
 */
import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  flushDB, getCompanyAttempt, listCompanyAttempts, saveCompanyAttempt,
} from '../db.ts'
import {
  fetchCompanyAttempt, fetchCompanyAttemptSummaries, persistCompanyAttempt, toUuid,
} from '../persist.ts'
import { getCompany } from './catalog.ts'
import { blueprintMinutes, getBlueprint } from './blueprints.ts'
import { loadBank, type LoadedBank } from './bank.ts'
import { buildPaper, toClientPaper } from './paper.ts'
import { scoreAttempt, type ScoreDeps } from './scoring.ts'
import { gradeWritten, MAX_WRITTEN_CHARS } from './grading.ts'
import { runCodingTests, MAX_CODE_BYTES, SUPPORTED_LANGS } from './codeRunner.ts'
import { createLimiter } from '../concurrency.ts'
import type {
  AttemptSummary, ClientPaper, CompanyAttempt, ProctorEvent, ProctoringLog, StoredPaper,
} from './types.ts'

/** Autosaves are accepted this long after the deadline (network latency). */
export const SAVE_GRACE_MS = 60_000
/** A final submission is accepted this long after the deadline. */
export const SUBMIT_GRACE_MS = 180_000
const MAX_EVENTS = 120

export interface AttemptDeps {
  sb?: SupabaseClient | null
  now?: () => Date
  bank?: LoadedBank
  score?: Partial<ScoreDeps>
}

export type StartOutcome =
  | { outcome: 'created' | 'resumed'; attempt: CompanyAttempt }
  | { outcome: 'completed'; attempt: CompanyAttempt }

const nowOf = (deps: AttemptDeps) => (deps.now ? deps.now() : new Date())

export function attemptIdFor(studentId: string, company: string): string {
  return toUuid(`${studentId}::${company}`, 'company-attempt') as string
}

export function seedFor(studentId: string, company: string): number {
  const secret = process.env.COMPANY_PAPER_SECRET || process.env.ADMIN_SECRET || 'calibiai-company-papers'
  const h = createHash('sha256').update(`${secret}|${studentId}|${company}|v1`).digest()
  return h.readUInt32BE(0)
}

export function isFinal(a: Pick<CompanyAttempt, 'status'> | null | undefined): boolean {
  return !!a && (a.status === 'submitted' || a.status === 'expired')
}

export function isPastDeadline(a: Pick<CompanyAttempt, 'expires_at'>, now: Date, graceMs = 0): boolean {
  return now.getTime() > new Date(a.expires_at).getTime() + graceMs
}

export function emptyProctoring(): ProctoringLog {
  return { strikes: 0, camera: null, fullscreen: null, events: [] }
}

/** Merge a client proctoring report into the stored log (bounded, monotonic). */
export function mergeProctoring(prev: ProctoringLog | undefined, incoming: any): ProctoringLog {
  const base = prev || emptyProctoring()
  const inc = incoming && typeof incoming === 'object' ? incoming : {}
  const seen = new Set(base.events.map((e) => `${e.type}|${e.at}`))
  const events: ProctorEvent[] = [...base.events]
  for (const raw of Array.isArray(inc.events) ? inc.events.slice(-MAX_EVENTS) : []) {
    const type = String(raw?.type || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 40)
    const at = String(raw?.at || '')
    if (!type || !at || Number.isNaN(Date.parse(at))) continue
    const key = `${type}|${at}`
    if (seen.has(key)) continue
    seen.add(key)
    events.push({ type, at, ...(raw?.detail ? { detail: String(raw.detail).slice(0, 200) } : {}) })
  }
  const strikes = Math.max(base.strikes || 0, Math.min(10, Math.floor(Number(inc.strikes) || 0)))
  return {
    strikes,
    camera: typeof inc.camera === 'boolean' ? inc.camera : base.camera,
    fullscreen: typeof inc.fullscreen === 'boolean' ? inc.fullscreen : base.fullscreen,
    events: events.slice(-MAX_EVENTS),
  }
}

/** Keep only well-formed answers for questions that are actually in the paper. */
export function sanitizeAnswers(paper: StoredPaper, answers: unknown, bank: LoadedBank): Record<string, unknown> {
  const src = answers && typeof answers === 'object' ? (answers as Record<string, unknown>) : {}
  const out: Record<string, unknown> = {}
  for (const round of paper.rounds) {
    for (const it of round.items) {
      const q = bank.byId.get(it.id)
      const v = src[it.id]
      if (!q || v == null) continue
      if (q.kind === 'mcq') {
        if (typeof v === 'string' && q.options.includes(v)) out[it.id] = v
      } else if (q.kind === 'written') {
        if (typeof v === 'string' && v.trim()) out[it.id] = v.slice(0, MAX_WRITTEN_CHARS)
      } else if (typeof v === 'object') {
        const o = v as any
        const lang = SUPPORTED_LANGS.includes(o.lang) ? o.lang : 'python'
        const code = typeof o.code === 'string' ? o.code.slice(0, MAX_CODE_BYTES) : ''
        if (code.trim()) out[it.id] = { lang, code }
      }
    }
  }
  return out
}

const codeLimiter = createLimiter(4)

function defaultScoreDeps(deps: AttemptDeps): ScoreDeps {
  return {
    gradeWritten: deps.score?.gradeWritten || ((q, a) => gradeWritten(q, a)),
    runCode: deps.score?.runCode || (async (q, code, lang) => {
      // Submit-time grading must not be refused: wait up to a minute for a
      // judge slot, then run anyway. Only release a slot that was acquired —
      // releasing an unacquired one would corrupt the limiter's count.
      let acquired = codeLimiter.tryAcquire()
      for (let i = 0; i < 600 && !acquired; i++) {
        await new Promise((r) => setTimeout(r, 100))
        acquired = codeLimiter.tryAcquire()
      }
      try { return await runCodingTests(q, code, lang) } finally { if (acquired) codeLimiter.release() }
    }),
    now: deps.now,
    concurrency: deps.score?.concurrency ?? 4,
  }
}

async function persist(attempt: CompanyAttempt, deps: AttemptDeps, opts: { createOnly?: boolean; durable?: boolean } = {}) {
  saveCompanyAttempt(attempt)
  if (opts.durable) await flushDB()
  if (deps.sb) await persistCompanyAttempt(deps.sb, attempt, { createOnly: opts.createOnly })
}

/** The student's attempt for a company (Supabase first when configured). */
export async function loadAttempt(studentId: string, company: string, deps: AttemptDeps = {}): Promise<CompanyAttempt | null> {
  const local = getCompanyAttempt(studentId, company) || null
  if (deps.sb) {
    const remote = await fetchCompanyAttempt(deps.sb, studentId, company)
    if (remote) {
      // Keep the local student id (it may be a non-uuid demo id locally).
      const merged = { ...remote, student_id: studentId } as CompanyAttempt
      // A local row that is further along (e.g. submitted while Supabase was
      // briefly unreachable) wins over a stale remote copy — and repairs it.
      if (local && isFinal(local) && !isFinal(merged)) {
        await persistCompanyAttempt(deps.sb, local)
        return local
      }
      return merged
    }
  }
  return local
}

/** Finalise an attempt that ran past its deadline, using its saved answers. */
export async function finalizeExpired(attempt: CompanyAttempt, deps: AttemptDeps = {}): Promise<CompanyAttempt> {
  if (isFinal(attempt)) return attempt
  const bank = deps.bank || loadBank()
  const result = await scoreAttempt(attempt.paper, attempt.answers || {}, bank, defaultScoreDeps(deps))
  const at = nowOf(deps).toISOString()
  const done: CompanyAttempt = {
    ...attempt,
    status: 'expired',
    submitted_at: attempt.expires_at,
    auto_submitted: true,
    submit_reason: 'Time expired — submitted automatically with your last saved answers.',
    score: result.score,
    result,
    updated_at: at,
  }
  await persist(done, deps, { durable: true })
  return done
}

export async function startAttempt(studentId: string, companySlug: string, deps: AttemptDeps = {}): Promise<StartOutcome> {
  const company = getCompany(companySlug)
  if (!company) throw new Error(`Unknown company: ${companySlug}`)
  const blueprint = getBlueprint(company.blueprint)
  if (!blueprint) throw new Error(`Missing blueprint for ${company.slug}`)
  const now = nowOf(deps)

  const existing = await loadAttempt(studentId, company.slug, deps)
  if (existing) {
    if (isFinal(existing)) return { outcome: 'completed', attempt: existing }
    if (isPastDeadline(existing, now, SUBMIT_GRACE_MS)) {
      return { outcome: 'completed', attempt: await finalizeExpired(existing, deps) }
    }
    return { outcome: 'resumed', attempt: existing }
  }

  const bank = deps.bank || loadBank()
  const seed = seedFor(studentId, company.slug)
  const durationSec = blueprintMinutes(blueprint) * 60
  const at = now.toISOString()
  const attempt: CompanyAttempt = {
    id: attemptIdFor(studentId, company.slug),
    student_id: studentId,
    company: company.slug,
    status: 'in_progress',
    question_seed: seed,
    paper: buildPaper(blueprint, seed, bank),
    answers: {},
    proctoring: emptyProctoring(),
    started_at: at,
    expires_at: new Date(now.getTime() + durationSec * 1000).toISOString(),
    duration_sec: durationSec,
    submitted_at: null,
    auto_submitted: false,
    submit_reason: null,
    score: null,
    result: null,
    created_at: at,
    updated_at: at,
  }
  // Re-check immediately before writing: a concurrent request in this process
  // may have created it while we were awaiting Supabase.
  const raced = getCompanyAttempt(studentId, company.slug)
  if (raced) return { outcome: isFinal(raced) ? 'completed' : 'resumed', attempt: raced }
  await persist(attempt, deps, { createOnly: true, durable: true })
  if (deps.sb) {
    const canonical = await fetchCompanyAttempt(deps.sb, studentId, company.slug)
    if (canonical && canonical.started_at !== attempt.started_at) {
      const winner = { ...canonical, student_id: studentId } as CompanyAttempt
      saveCompanyAttempt(winner)
      return { outcome: isFinal(winner) ? 'completed' : 'resumed', attempt: winner }
    }
  }
  return { outcome: 'created', attempt }
}

export type SaveOutcome = { ok: true; attempt: CompanyAttempt } | { ok: false; reason: 'not-found' | 'final' | 'expired'; attempt?: CompanyAttempt }

export async function saveProgress(
  studentId: string, companySlug: string, answers: unknown, proctoring: unknown, deps: AttemptDeps = {},
): Promise<SaveOutcome> {
  const existing = await loadAttempt(studentId, companySlug, deps)
  if (!existing) return { ok: false, reason: 'not-found' }
  if (isFinal(existing)) return { ok: false, reason: 'final', attempt: existing }
  const now = nowOf(deps)
  if (isPastDeadline(existing, now, SUBMIT_GRACE_MS)) {
    return { ok: false, reason: 'expired', attempt: await finalizeExpired(existing, deps) }
  }
  if (isPastDeadline(existing, now, SAVE_GRACE_MS)) return { ok: false, reason: 'expired', attempt: existing }
  const bank = deps.bank || loadBank()
  const updated: CompanyAttempt = {
    ...existing,
    answers: { ...(existing.answers || {}), ...sanitizeAnswers(existing.paper, answers, bank) },
    proctoring: mergeProctoring(existing.proctoring, proctoring),
    updated_at: now.toISOString(),
  }
  await persist(updated, deps)
  return { ok: true, attempt: updated }
}

export interface SubmitInput {
  answers?: unknown
  proctoring?: unknown
  auto?: boolean
  reason?: string
}

export type SubmitOutcome = { ok: true; attempt: CompanyAttempt; alreadySubmitted: boolean } | { ok: false; reason: 'not-found' }

export async function submitAttempt(
  studentId: string, companySlug: string, input: SubmitInput, deps: AttemptDeps = {},
): Promise<SubmitOutcome> {
  const existing = await loadAttempt(studentId, companySlug, deps)
  if (!existing) return { ok: false, reason: 'not-found' }
  if (isFinal(existing)) return { ok: true, attempt: existing, alreadySubmitted: true }
  const now = nowOf(deps)
  const bank = deps.bank || loadBank()
  const late = isPastDeadline(existing, now, SUBMIT_GRACE_MS)
  // Answers arriving after the grace window are ignored — the last autosave stands.
  const answers = late
    ? existing.answers || {}
    : { ...(existing.answers || {}), ...sanitizeAnswers(existing.paper, input.answers, bank) }
  const proctoring = mergeProctoring(existing.proctoring, input.proctoring)
  const result = await scoreAttempt(existing.paper, answers, bank, defaultScoreDeps(deps))
  const at = now.toISOString()
  const auto = !!input.auto || late
  const done: CompanyAttempt = {
    ...existing,
    status: late ? 'expired' : 'submitted',
    answers,
    proctoring,
    submitted_at: late ? existing.expires_at : at,
    auto_submitted: auto,
    submit_reason: auto ? String(input.reason || (late ? 'Time expired.' : 'Submitted automatically.')).slice(0, 200) : null,
    score: result.score,
    result,
    updated_at: at,
  }
  await persist(done, deps, { durable: true })
  return { ok: true, attempt: done, alreadySubmitted: false }
}

export function toSummary(a: CompanyAttempt): AttemptSummary {
  return {
    company: a.company,
    status: a.status,
    started_at: a.started_at,
    expires_at: a.expires_at,
    submitted_at: a.submitted_at ?? null,
    score: a.score ?? null,
    verdict: a.result?.verdict ?? null,
    auto_submitted: !!a.auto_submitted,
  }
}

/** Dashboard statuses for every company attempt of a student. */
export async function listSummaries(studentId: string, deps: AttemptDeps = {}): Promise<AttemptSummary[]> {
  const now = nowOf(deps)
  const byCompany = new Map<string, AttemptSummary>()
  for (const a of listCompanyAttempts(studentId)) byCompany.set(a.company, toSummary(a))
  if (deps.sb) {
    const rows = await fetchCompanyAttemptSummaries(deps.sb, studentId)
    for (const r of rows || []) {
      const local = byCompany.get(r.company_slug)
      if (local && isFinal(local) && r.status === 'in_progress') continue
      byCompany.set(r.company_slug, {
        company: r.company_slug, status: r.status, started_at: r.started_at, expires_at: r.expires_at,
        submitted_at: r.submitted_at ?? null, score: r.score == null ? null : Number(r.score),
        verdict: r.verdict ?? null, auto_submitted: !!r.auto_submitted,
      })
    }
  }
  // Lazily finalise anything that timed out while the candidate was away.
  for (const s of byCompany.values()) {
    if (s.status === 'in_progress' && isPastDeadline(s, now, SUBMIT_GRACE_MS)) {
      const full = await loadAttempt(studentId, s.company, deps)
      if (full && !isFinal(full)) byCompany.set(s.company, toSummary(await finalizeExpired(full, deps)))
    }
  }
  return [...byCompany.values()]
}

/** Candidate-facing payload for an in-progress attempt. */
export function clientView(attempt: CompanyAttempt, deps: AttemptDeps = {}): {
  attempt: AttemptSummary & { id: string; duration_sec: number }
  paper: ClientPaper
  answers: Record<string, unknown>
  server_now: string
} {
  const company = getCompany(attempt.company)
  if (!company) throw new Error(`Unknown company: ${attempt.company}`)
  const bank = deps.bank || loadBank()
  return {
    attempt: { ...toSummary(attempt), id: attempt.id, duration_sec: attempt.duration_sec },
    paper: toClientPaper(company, attempt.paper, bank),
    answers: attempt.answers || {},
    server_now: nowOf(deps).toISOString(),
  }
}
