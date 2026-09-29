/**
 * Server-side loader behind the admin's "everything a student has taken"
 * view: the Capgemini mock (assessment 2), every company-mock attempt, and an
 * explicit assessment-1 result — read from BOTH stores (Supabase + the local
 * JSON store) and folded into AdminStudentRows by enrichRow().
 *
 * Egress-conscious like the rest of the admin: page requests only read rows
 * for the page's student ids (chunked `.in()` filters) with narrow projections
 * (JSON-path selects instead of whole JSONB blobs); full exports paginate.
 * Every Supabase failure degrades to a warning — never a thrown error.
 */
import { assessmentNoOf, getDB, listAllCompanyAttempts } from './db.ts'
import { buildRow } from './studentRows.ts'
import type { AdminStudentRow } from './csv'
import {
  enrichRow,
  mergeAssessmentData,
  normalizeCompanyAttempt,
  normalizePlatformResult,
  type StudentAssessmentData,
} from './adminAssessments.ts'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CHUNK = 150
const PAGE = 1000

/** Narrow result projection: scalar columns + the A2 module scores via JSON paths. */
const RESULT_COLUMNS = [
  'student_id', 'assessment_no', 'total', 'grade', 'percentile', 'created_at',
  'marker:scores->>assessment_no',
  'a2_english:scores->english->total', 'a2_technical:scores->ai_literacy',
  'a2_debugging:scores->debugging_total', 'a2_debug_mcq:scores->debug_mcq', 'a2_debug_lab:scores->debug_lab',
  'a2_ai_coding:scores->ai_coding', 'a2_cognitive:scores->cognitive->total',
  'skill_english:scores->english', 'skill_problem_solving:scores->problem_solving',
  'skill_ai_debugging:scores->ai_debugging', 'skill_ai_feature:scores->ai_feature',
  'skill_prompt_engineering:scores->prompt_engineering', 'skill_ai_literacy:scores->ai_literacy',
  'skill_debug_mcq:scores->debug_mcq', 'skill_debug_lab:scores->debug_lab',
  'skill_ai_coding:scores->ai_coding', 'skill_cognitive:scores->cognitive',
].join(',')
const RESULT_COLUMNS_LEGACY = RESULT_COLUMNS.split(',').filter((c) => c !== 'assessment_no').join(',')

const ATTEMPT_COLUMNS = [
  'student_id', 'company_slug', 'status', 'score', 'verdict', 'started_at', 'submitted_at', 'duration_sec',
  'auto_submitted', 'submit_reason', 'strikes:proctoring->strikes', 'camera:proctoring->camera',
  'rounds:result->rounds', 'skill_items:result->items',
].join(',')

/** Full assessment-1 rows, only fetched to repair rows from a pre-0008 view. */
const A1_FULL_COLUMNS = 'student_id,assessment_no,total,grade,percentile,scores,verifiable_hash,created_at'

type DataMap = Map<string, StudentAssessmentData>

const idKey = (id: unknown) => String(id || '').trim().toLowerCase()
const emailKey = (e: unknown) => String(e || '').trim().toLowerCase()

function put(map: DataMap, key: string, patch: Partial<StudentAssessmentData>) {
  if (!key) return
  const cur = map.get(key) || { a1: null, a2: null, company: [] }
  map.set(key, mergeAssessmentData({ a1: patch.a1 ?? null, a2: patch.a2 ?? null, company: patch.company || [] }, cur))
}

function isMissingRelation(error: any): boolean {
  const msg = String(error?.message || '')
  return error?.code === '42P01' || error?.code === 'PGRST205' || /relation .* does not exist|could not find the table|schema cache/i.test(msg)
}

function mentionsColumn(error: any, column: string): boolean {
  const msg = String(error?.message || '').toLowerCase()
  return msg.includes(column.toLowerCase()) && (/column/.test(msg) || error?.code === '42703')
}

/* ------------------------------------------------------------------ */
/* Local JSON store                                                     */
/* ------------------------------------------------------------------ */

function localData(): { byId: DataMap; byEmail: DataMap } {
  const byId: DataMap = new Map()
  const byEmail: DataMap = new Map()
  const db = getDB()
  const emailOf = new Map<string, string>()
  for (const u of db.users) if (u.email) emailOf.set(idKey(u.id), emailKey(u.email))
  for (const p of db.profiles) if (p.email) emailOf.set(idKey(p.id), emailKey(p.email))

  const latest = new Map<string, any>()
  for (const r of db.assessment_results) {
    const no = assessmentNoOf(r) === 2 ? 2 : 1
    const key = `${idKey(r.student_id)}|${no}`
    const prev = latest.get(key)
    if (!prev || String(r.created_at || '') > String(prev.created_at || '')) latest.set(key, r)
  }
  for (const [key, r] of latest) {
    const [id, no] = key.split('|')
    const patch = no === '2' ? { a2: normalizePlatformResult(r, 2) } : { a1: normalizePlatformResult(r, 1) }
    put(byId, id, patch)
    const email = emailOf.get(id)
    if (email) put(byEmail, email, patch)
  }
  for (const a of listAllCompanyAttempts()) {
    const n = normalizeCompanyAttempt(a)
    if (!n) continue
    put(byId, idKey(a.student_id), { company: [n] })
    const email = emailOf.get(idKey(a.student_id))
    if (email) put(byEmail, email, { company: [n] })
  }
  return { byId, byEmail }
}

/* ------------------------------------------------------------------ */
/* Supabase                                                             */
/* ------------------------------------------------------------------ */

async function selectForIds(sb: any, table: string, columns: string, ids: string[] | null): Promise<{ data: any[]; error: any }> {
  const out: any[] = []
  if (ids) {
    for (let i = 0; i < ids.length; i += CHUNK) {
      const { data, error } = await sb.from(table).select(columns).in('student_id', ids.slice(i, i + CHUNK))
      if (error) return { data: out, error }
      out.push(...(data || []))
    }
    return { data: out, error: null }
  }
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from(table).select(columns).order('student_id', { ascending: true }).range(from, from + PAGE - 1)
    if (error) return { data: out, error }
    out.push(...(data || []))
    if (!data || data.length < PAGE) return { data: out, error: null }
  }
}

async function remoteData(sb: any, ids: string[] | null): Promise<{ byId: DataMap; warnings: string[] }> {
  const byId: DataMap = new Map()
  const warnings: string[] = []
  if (ids && !ids.length) return { byId, warnings }

  // Assessment results (A1 + A2), newest per (student, assessment).
  let res = await selectForIds(sb, 'assessment_results', RESULT_COLUMNS, ids)
  if (res.error && mentionsColumn(res.error, 'assessment_no')) res = await selectForIds(sb, 'assessment_results', RESULT_COLUMNS_LEGACY, ids)
  if (res.error) warnings.push(`Could not read assessment results for the Capgemini mock: ${res.error.message}`)
  const latest = new Map<string, any>()
  for (const r of res.data) {
    const no = Number(r.assessment_no ?? r.marker ?? 1) === 2 ? 2 : 1
    const key = `${idKey(r.student_id)}|${no}`
    const prev = latest.get(key)
    if (!prev || String(r.created_at || '') > String(prev.created_at || '')) latest.set(key, r)
  }
  for (const [key, r] of latest) {
    const [id, no] = key.split('|')
    put(byId, id, no === '2' ? { a2: normalizePlatformResult(r, 2) } : { a1: normalizePlatformResult(r, 1) })
  }

  // Company mock attempts (migration 0009).
  const att = await selectForIds(sb, 'company_assessment_attempts', ATTEMPT_COLUMNS, ids)
  if (att.error) {
    warnings.push(isMissingRelation(att.error)
      ? 'Company mock results are not in Supabase yet — apply supabase/migrations/0009_company_assessments.sql.'
      : `Could not read company mock attempts: ${att.error.message}`)
  }
  for (const a of att.data) {
    const n = normalizeCompanyAttempt(a)
    if (n) put(byId, idKey(a.student_id), { company: [n] })
  }
  return { byId, warnings }
}

/** Assessment-1 result fields copied when a row came from a pre-0008 view that picked the A2 result. */
const A1_FIELDS: (keyof AdminStudentRow)[] = [
  'score', 'grade', 'percentile', 'english', 'english_listening', 'english_speaking',
  'english_reading', 'english_writing', 'problem_solving', 'ai_debugging', 'ai_feature',
  'prompt_engineering', 'cognitive', 'cognitive_grid', 'cognitive_logical',
  'behavioral_total', 'teamwork', 'accountability', 'adaptability', 'responsible_ai',
  'decision_making', 'learning_mindset', 'listening_correct', 'listening_total',
  'reading_correct', 'reading_total', 'problem_correct', 'problem_total',
  'logical_correct', 'logical_total', 'verifiable_hash', 'assessed_at',
]

async function repairA1(sb: any, rows: AdminStudentRow[], lookup: (r: AdminStudentRow) => StudentAssessmentData): Promise<AdminStudentRow[]> {
  const suspects = rows.filter((r) => {
    const d = lookup(r)
    if (!UUID_RE.test(r.student_id) || r.score === '') return false
    if (d.a1 && (String(d.a1.total) !== r.score || (d.a1.created_at && r.assessed_at && d.a1.created_at !== r.assessed_at))) return true
    return !d.a1 && !!d.a2 && !!r.assessed_at && d.a2.created_at === r.assessed_at
  })
  if (!suspects.length) return rows
  const full = await selectForIds(sb, 'assessment_results', A1_FULL_COLUMNS, suspects.map((r) => r.student_id)).catch(() => ({ data: [], error: true }))
  if ((full as any).error) return rows
  const best = new Map<string, any>()
  for (const r of full.data) {
    if (Number(r.assessment_no ?? 1) !== 1) continue
    const k = idKey(r.student_id)
    if (!best.has(k) || String(r.created_at) > String(best.get(k).created_at)) best.set(k, r)
  }
  const fix = new Map<string, AdminStudentRow>()
  for (const r of suspects) {
    const a1 = best.get(idKey(r.student_id))
    const built = buildRow({ student_id: r.student_id, profile: {}, scores: a1 || null, verifiable_hash: a1?.verifiable_hash, assessed_at: a1?.created_at })
    const next: AdminStudentRow = { ...r, has_assessment: a1 ? 'Yes' : r.has_assessment }
    for (const f of A1_FIELDS) (next as any)[f] = (built as any)[f]
    fix.set(r.student_id, next)
  }
  return rows.map((r) => fix.get(r.student_id) || r)
}

/* ------------------------------------------------------------------ */
/* Public API                                                           */
/* ------------------------------------------------------------------ */

/**
 * Enrich rows with every assessment the student has taken. `all` reads whole
 * tables (exports); otherwise only the rows' ids are queried (table pages).
 */
export async function enrichStudentRows(
  sb: any | null,
  rows: AdminStudentRow[],
  opts: { all?: boolean } = {},
): Promise<{ rows: AdminStudentRow[]; warning?: string }> {
  const warnings: string[] = []
  let local: { byId: DataMap; byEmail: DataMap } = { byId: new Map(), byEmail: new Map() }
  try {
    local = localData()
  } catch (e: any) {
    warnings.push(`Could not read local assessment data: ${e?.message || e}`)
  }
  let remote: DataMap = new Map()
  if (sb) {
    try {
      const ids = opts.all ? null : [...new Set(rows.map((r) => r.student_id).filter((id) => UUID_RE.test(id)))]
      const got = await remoteData(sb, ids)
      remote = got.byId
      warnings.push(...got.warnings)
    } catch (e: any) {
      warnings.push(`Could not read assessment data from Supabase: ${e?.message || e}`)
    }
  }
  const lookup = (r: AdminStudentRow): StudentAssessmentData => {
    const id = idKey(r.student_id)
    const byRemote = remote.get(id)
    const byLocal = mergeAssessmentData(local.byId.get(id), local.byEmail.get(emailKey(r.email)))
    return mergeAssessmentData(byRemote, byLocal)
  }
  let base = rows
  if (sb) {
    try {
      base = await repairA1(sb, rows, lookup)
    } catch {
      base = rows
    }
  }
  const out = base.map((r) => {
    const d = lookup(r)
    // The row's own A1 scalar fields stay authoritative; enrichRow preserves
    // the result-derived skill evidence from the loaded assessment separately.
    return enrichRow(r, d)
  })
  return { rows: out, warning: [...new Set(warnings)].join(' ') || undefined }
}

/**
 * Everything the platform stores about one student — profile, resume
 * analysis, both platform results (with AI feedback), every company attempt
 * (graded items, feedback, proctoring log) and feedback history. Used by the
 * admin's per-student "Download full record".
 */
export async function loadStudentRecord(sb: any | null, row: AdminStudentRow): Promise<Record<string, unknown>> {
  const id = row.student_id
  const record: Record<string, unknown> = {
    exported_at: new Date().toISOString(),
    student: row,
  }
  const db = (() => { try { return getDB() } catch { return null } })()
  const localIds = new Set<string>([idKey(id)])
  if (db && row.email) {
    for (const p of db.profiles) if (emailKey(p.email) === emailKey(row.email)) localIds.add(idKey(p.id))
    for (const u of db.users) if (emailKey(u.email) === emailKey(row.email)) localIds.add(idKey(u.id))
  }
  const local = db
    ? {
        profile: db.profiles.find((p) => localIds.has(idKey(p.id))) || null,
        assessment_results: db.assessment_results.filter((r) => localIds.has(idKey(r.student_id))),
        assessment_sessions: db.assessment_sessions.filter((s) => localIds.has(idKey(s.student_id))).map(({ answers, ...rest }: any) => ({ ...rest, answered: answers ? Object.keys(answers).length : 0 })),
        resume_analyses: db.resume_analyses.filter((r) => localIds.has(idKey(r.student_id))),
        company_attempts: db.company_attempts.filter((a) => localIds.has(idKey(a.student_id))),
      }
    : null
  record.local = local
  if (sb && UUID_RE.test(id)) {
    const q = async (table: string, columns = '*') => {
      try {
        const { data, error } = await sb.from(table).select(columns).eq(table === 'profiles' ? 'id' : 'student_id', id)
        return error ? { error: error.message } : data
      } catch (e: any) {
        return { error: String(e?.message || e) }
      }
    }
    record.supabase = {
      profile: await q('profiles'),
      assessment_results: await q('assessment_results'),
      assessment_sessions: await q('assessment_sessions', 'id,student_id,status,started_at,submitted_at,created_at,assessment_no'),
      resume_analyses: await q('resume_analyses'),
      company_attempts: await q('company_assessment_attempts', 'id,student_id,company_slug,status,started_at,expires_at,duration_sec,submitted_at,auto_submitted,submit_reason,score,verdict,proctoring,result,created_at,updated_at'),
    }
  }
  return record
}
