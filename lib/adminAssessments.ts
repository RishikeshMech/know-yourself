/**
 * Admin view of EVERY assessment a student has taken — pure and client-safe
 * (no Node/server imports) so the API routes, the admin page and the tests
 * share one implementation.
 *
 *   - normalise company-mock attempts and platform results from either store
 *     (local JSON or Supabase rows) into one shape;
 *   - enrich an AdminStudentRow with the CalibiAI Score (average of every
 *     completed assessment), the Capgemini mock, company-wise and
 *     category-wise scores, and the per-assessment breakdown;
 *   - flatten everything into CSV rows (one row per student, or one row per
 *     assessment attempt).
 */
import type { AdminStudentRow } from './csv.ts'
import { COMPANIES, COMPANY_TAGS, TAG_BY_ID, getCompany } from './company/catalog.ts'
import { PLATFORM_CATEGORY, companyEntry, computeCalibiScore, platformEntry, type ScoreEntry } from './calibiScore.ts'

export interface AdminRoundSummary {
  id?: string
  label: string
  percent: number | null
  cutoff?: number | null
  cleared?: boolean | null
}

export interface AdminCompanyAttempt {
  company: string
  name: string
  tag: string
  category: string
  status: string
  score: number | null
  verdict: string | null
  verdict_label: string
  started_at: string
  submitted_at: string
  duration_sec: number | null
  auto_submitted: boolean
  submit_reason: string
  strikes: number | null
  camera: boolean | null
  rounds: AdminRoundSummary[]
}

export interface AdminPlatformResult {
  total: number | null
  grade: string
  percentile: number | null
  created_at: string
  /** Module scores (Capgemini mock): english, technical, debugging, ai_coding, cognitive. */
  modules?: Record<string, number | null>
}

export interface StudentAssessmentData {
  a1?: AdminPlatformResult | null
  a2?: AdminPlatformResult | null
  company: AdminCompanyAttempt[]
}

export const VERDICT_LABEL: Record<string, string> = {
  ready: 'Interview-ready',
  almost: 'Almost there',
  borderline: 'Borderline',
  'not-yet': 'Not yet',
}

/** Category columns: platform assessments + the six company tags. */
export const CATEGORY_FIELDS = [
  { id: PLATFORM_CATEGORY.id, key: 'cat_platform', label: PLATFORM_CATEGORY.label },
  ...COMPANY_TAGS.map((t) => ({ id: t.id, key: `cat_${t.id.replace(/-/g, '_')}`, label: t.label })),
] as const

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v))
const fmt1 = (n: number | null | undefined): string => (n === null || n === undefined || !Number.isFinite(n) ? '' : String(Math.round(n * 10) / 10))

/** Accepts a local CompanyAttempt, a Supabase row (company_slug, proctoring JSON paths…) or an already-normalised attempt. */
export function normalizeCompanyAttempt(raw: any): AdminCompanyAttempt | null {
  if (!raw) return null
  const slug = str(raw.company ?? raw.company_slug)
  if (!slug) return null
  const c = getCompany(slug)
  const verdict = str(raw.verdict ?? raw.result?.verdict) || null
  const proctoring = raw.proctoring && typeof raw.proctoring === 'object' ? raw.proctoring : {}
  const roundsRaw = Array.isArray(raw.rounds) ? raw.rounds : Array.isArray(raw.result?.rounds) ? raw.result.rounds : []
  const status = str(raw.status) || 'in_progress'
  const score = status === 'in_progress' ? null : num(raw.score ?? raw.result?.score)
  return {
    company: slug,
    name: c?.name || str(raw.name) || slug,
    tag: c?.tag || str(raw.tag),
    category: (c && TAG_BY_ID[c.tag]?.label) || str(raw.category),
    status,
    score,
    verdict: status === 'in_progress' ? null : verdict,
    verdict_label: status === 'in_progress' ? 'In progress' : (verdict && VERDICT_LABEL[verdict]) || str(raw.verdict_label) || '',
    started_at: str(raw.started_at),
    submitted_at: str(raw.submitted_at),
    duration_sec: num(raw.duration_sec),
    auto_submitted: !!raw.auto_submitted,
    submit_reason: str(raw.submit_reason),
    strikes: num(raw.strikes ?? proctoring.strikes),
    camera: (raw.camera ?? proctoring.camera) === undefined || (raw.camera ?? proctoring.camera) === null ? null : !!(raw.camera ?? proctoring.camera),
    rounds: roundsRaw.map((r: any) => ({
      id: r?.id ? String(r.id) : undefined,
      label: str(r?.label || r?.id),
      percent: num(r?.percent),
      cutoff: num(r?.cutoff),
      cleared: r?.cleared === undefined || r?.cleared === null ? null : !!r.cleared,
    })),
  }
}

/** A platform (A1/A2) result from a stored row, a flattened `scores` object or narrow admin columns. */
export function normalizePlatformResult(raw: any, no: 1 | 2): AdminPlatformResult | null {
  if (!raw) return null
  const total = num(raw.total ?? raw.talent_score)
  if (total === null) return null
  const s = raw.scores && typeof raw.scores === 'object' ? raw.scores : raw
  const out: AdminPlatformResult = {
    total,
    grade: str(raw.grade),
    percentile: num(raw.percentile),
    created_at: str(raw.created_at ?? raw.assessment_created_at),
  }
  if (no === 2) {
    const dbg = num(raw.a2_debugging ?? s.debugging_total)
    const mcq = num(raw.a2_debug_mcq ?? s.debug_mcq)
    const lab = num(raw.a2_debug_lab ?? s.debug_lab)
    out.modules = {
      english: num(raw.a2_english ?? s.english?.total),
      technical: num(raw.a2_technical ?? s.ai_literacy),
      debugging: dbg ?? (mcq === null && lab === null ? null : (mcq || 0) + (lab || 0)),
      ai_coding: num(raw.a2_ai_coding ?? s.ai_coding),
      cognitive: num(raw.a2_cognitive ?? s.cognitive?.total),
    }
  }
  return out
}

/** Merge per-student data from two stores; the first argument wins per assessment. */
export function mergeAssessmentData(primary: StudentAssessmentData | undefined, secondary: StudentAssessmentData | undefined): StudentAssessmentData {
  const company = new Map<string, AdminCompanyAttempt>()
  for (const a of secondary?.company || []) company.set(a.company, a)
  for (const a of primary?.company || []) company.set(a.company, a)
  return {
    a1: primary?.a1 ?? secondary?.a1 ?? null,
    a2: primary?.a2 ?? secondary?.a2 ?? null,
    company: [...company.values()],
  }
}

/** Empty values for every enrichment column (buildRow uses this so rows are always complete). */
export function emptyEnrichment(): Pick<AdminStudentRow,
  'calibi_score' | 'calibi_grade' | 'assessments_taken' | 'tests_taken' |
  'a2_score' | 'a2_grade' | 'a2_percentile' | 'a2_english' | 'a2_technical' | 'a2_debugging' | 'a2_ai_coding' | 'a2_cognitive' | 'a2_at' |
  'company_taken' | 'company_in_progress' | 'company_avg' | 'company_best' | 'company_list' |
  'cat_platform' | 'cat_it_services' | 'cat_big_tech' | 'cat_product_startups' | 'cat_saas' | 'cat_bfsi' | 'cat_engineering'> {
  return {
    calibi_score: '', calibi_grade: '', assessments_taken: '0', tests_taken: '',
    a2_score: '', a2_grade: '', a2_percentile: '', a2_english: '', a2_technical: '', a2_debugging: '', a2_ai_coding: '', a2_cognitive: '', a2_at: '',
    company_taken: '0', company_in_progress: '0', company_avg: '', company_best: '', company_list: '',
    cat_platform: '', cat_it_services: '', cat_big_tech: '', cat_product_startups: '', cat_saas: '', cat_bfsi: '', cat_engineering: '',
  }
}

/**
 * Fill the CalibiAI / Capgemini / company / category columns of `row`.
 * `data.a1` defaults to the row's own assessment-1 fields.
 */
export function enrichRow(row: AdminStudentRow, data?: StudentAssessmentData | null): AdminStudentRow {
  const a1 = data?.a1 ?? (row.score !== '' && row.score !== undefined ? { total: num(row.score), grade: row.grade, percentile: num(row.percentile), created_at: row.assessed_at } : null)
  const a2 = data?.a2 ?? null
  // Completed attempts chronologically, then in-progress ones.
  const attempts = (data?.company || []).slice().sort((x, y) =>
    (x.status === 'in_progress' ? 1 : 0) - (y.status === 'in_progress' ? 1 : 0) ||
    str(x.submitted_at || x.started_at).localeCompare(str(y.submitted_at || y.started_at)))
  const calibi = computeCalibiScore([
    platformEntry(1, a1 ? { total: a1.total, grade: a1.grade, created_at: a1.created_at } : null),
    platformEntry(2, a2 ? { total: a2.total, grade: a2.grade, created_at: a2.created_at } : null),
    ...attempts.map((a) => companyEntry({ company: a.company, status: a.status, score: a.score, verdict: a.verdict, submitted_at: a.submitted_at })),
  ])
  const done = attempts.filter((a) => (a.status === 'submitted' || a.status === 'expired') && a.score !== null)
  const inProgress = attempts.filter((a) => a.status === 'in_progress')
  const best = done.reduce<AdminCompanyAttempt | null>((b, a) => (!b || (a.score ?? 0) > (b.score ?? 0) ? a : b), null)
  const companyAvg = done.length ? done.reduce((s, a) => s + (a.score || 0), 0) / done.length : null
  const cat = new Map(calibi.categories.map((c) => [c.id, c]))
  const out: AdminStudentRow = {
    ...row,
    calibi_score: calibi.score === null ? '' : String(calibi.score),
    calibi_grade: calibi.grade || '',
    assessments_taken: String(calibi.count),
    tests_taken: calibi.entries.map((e) => `${e.label} [${e.category}]`).join('; '),
    a2_score: a2?.total === null || a2?.total === undefined ? '' : String(a2.total),
    a2_grade: a2?.grade || '',
    a2_percentile: fmt1(a2?.percentile ?? null),
    a2_english: fmt1(a2?.modules?.english ?? null),
    a2_technical: fmt1(a2?.modules?.technical ?? null),
    a2_debugging: fmt1(a2?.modules?.debugging ?? null),
    a2_ai_coding: fmt1(a2?.modules?.ai_coding ?? null),
    a2_cognitive: fmt1(a2?.modules?.cognitive ?? null),
    a2_at: a2?.created_at || '',
    company_taken: String(done.length),
    company_in_progress: String(inProgress.length),
    company_avg: fmt1(companyAvg),
    company_best: best ? `${best.name} ${fmt1(best.score)}` : '',
    company_list: done.map((a) => `${a.name} ${fmt1(a.score)} (${a.verdict_label || a.status})`).join('; '),
    company_scores: Object.fromEntries(done.map((a) => [a.company, a.score as number])),
    assessments: calibi.entries,
    company_attempts: attempts,
  }
  for (const f of CATEGORY_FIELDS) (out as any)[f.key] = fmt1(cat.get(f.id)?.percent ?? null)
  return out
}

/** Per-company CSV columns, in the catalogue's plan order. */
export function companyScoreColumns(): Array<{ slug: string; label: string }> {
  return COMPANIES.map((c) => ({ slug: c.slug, label: `${c.name} (/100)` }))
}

/* ------------------------------------------------------------------ */
/* One row per assessment attempt                                       */
/* ------------------------------------------------------------------ */

export const ATTEMPT_COLUMNS = [
  'Name', 'Email', 'PRN', 'Mobile Number', 'College', 'Degree', 'Graduation Year',
  'Assessment', 'Type', 'Category', 'Status', 'Score', 'Out of', 'Percent', 'On the 1000 scale',
  'Grade / Verdict', 'Rounds', 'Proctoring strikes', 'Camera', 'Auto-submitted', 'Submit reason',
  'Started', 'Submitted', 'Time allowed (min)', 'CalibiAI Score (student avg /1000)', 'Student ID',
] as const

const TYPE_LABEL: Record<ScoreEntry['kind'], string> = {
  core: 'CalibiAI core assessment',
  capgemini: 'Platform mock (Capgemini 2027)',
  company: 'Company mock',
}

/** Flatten every assessment attempt of every row (rows must be enriched). */
export function attemptRows(rows: AdminStudentRow[]): string[][] {
  const out: string[][] = []
  for (const r of rows) {
    const who = [r.name, r.email, r.prn, r.phone, r.college, r.degree, r.graduation_year]
    const tail = [r.calibi_score, r.student_id]
    if (r.score !== '') {
      out.push([...who, 'CalibiAI Assessment', TYPE_LABEL.core, PLATFORM_CATEGORY.label, 'submitted', r.score, '1000', fmt1(Number(r.score) / 10), String(Math.round(Number(r.score))), r.grade ? `Grade ${r.grade}` : '', '', '', '', '', '', '', r.assessed_at, '120', ...tail])
    } else if (r.has_assessment === 'Yes') {
      out.push([...who, 'CalibiAI Assessment', TYPE_LABEL.core, PLATFORM_CATEGORY.label, 'submitted (result pending)', '', '1000', '', '', '', '', '', '', '', '', '', r.assessed_at, '120', ...tail])
    }
    if (r.a2_score !== '') {
      out.push([...who, 'Capgemini 2027 Mock', TYPE_LABEL.capgemini, PLATFORM_CATEGORY.label, 'submitted', r.a2_score, '1000', fmt1(Number(r.a2_score) / 10), String(Math.round(Number(r.a2_score))), r.a2_grade ? `Grade ${r.a2_grade}` : '', '', '', '', '', '', '', r.a2_at, '', ...tail])
    }
    for (const a of r.company_attempts || []) {
      const rounds = a.rounds.map((x) => `${x.label} ${fmt1(x.percent)}%${x.cleared === false ? ' (below cut-off)' : ''}`).join('; ')
      out.push([
        ...who, a.name, TYPE_LABEL.company, a.category, a.status,
        a.score === null ? '' : fmt1(a.score), '100', a.score === null ? '' : fmt1(a.score), a.score === null ? '' : String(Math.round(a.score * 10)),
        a.verdict_label, rounds, a.strikes === null ? '' : String(a.strikes), a.camera === null ? '' : a.camera ? 'on' : 'off',
        a.auto_submitted ? 'yes' : 'no', a.submit_reason, a.started_at, a.submitted_at,
        a.duration_sec ? String(Math.round(a.duration_sec / 60)) : '', ...tail,
      ])
    }
  }
  return out
}

/* ------------------------------------------------------------------ */
/* Company-wise results (admin "Company results" panel)                 */
/* ------------------------------------------------------------------ */

export interface CompanyResultSummary {
  company: string
  name: string
  tag: string
  category: string
  attempts: number
  completed: number
  in_progress: number
  average: number | null
  best: number | null
  ready: number
  pass_rate: number | null
}

/** Aggregate company attempts (rows must be enriched). */
export function summarizeCompanies(rows: AdminStudentRow[]): CompanyResultSummary[] {
  const by = new Map<string, AdminCompanyAttempt[]>()
  for (const r of rows) for (const a of r.company_attempts || []) (by.get(a.company) || by.set(a.company, []).get(a.company)!).push(a)
  return COMPANIES.map((c) => {
    const list = by.get(c.slug) || []
    const done = list.filter((a) => a.status !== 'in_progress' && a.score !== null)
    const scores = done.map((a) => a.score as number)
    const ready = done.filter((a) => a.verdict === 'ready').length
    return {
      company: c.slug,
      name: c.name,
      tag: c.tag,
      category: TAG_BY_ID[c.tag]?.label || c.tag,
      attempts: list.length,
      completed: done.length,
      in_progress: list.length - done.length,
      average: scores.length ? Math.round((scores.reduce((s, x) => s + x, 0) / scores.length) * 10) / 10 : null,
      best: scores.length ? Math.max(...scores) : null,
      ready,
      pass_rate: done.length ? Math.round((done.filter((a) => a.verdict === 'ready' || a.verdict === 'almost').length / done.length) * 1000) / 10 : null,
    }
  })
}
