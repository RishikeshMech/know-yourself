/**
 * CalibiAI Score — the student's single headline number.
 *
 * Product rule: the CalibiAI Score is the AVERAGE of every assessment the
 * student has completed. Assessments are marked on different scales (the two
 * platform assessments out of 1000, every company mock out of 100), so each
 * result is first normalised to a percentage and the mean is reported on the
 * familiar 1000-point scale:
 *
 *     CalibiAI Score = round( mean(percent_i) × 10 )        (0 – 1000)
 *
 *   - every completed assessment counts once (equal weight);
 *   - only finished attempts WITH a score count — an in-progress company mock
 *     or a "taken · result pending" platform attempt is excluded until graded;
 *   - a student with no graded assessment has no CalibiAI Score (null).
 *
 * Pure and dependency-light (only the client-safe company catalog), so the
 * student dashboard, the admin API and the tests all share this one
 * implementation. The SQL mirror used for admin sorting lives in
 * supabase/migrations/0010_calibiai_average.sql and must stay in sync.
 */
import { TAG_BY_ID, getCompany } from './company/catalog.ts'

export type AssessmentKind = 'core' | 'capgemini' | 'company'

export interface ScoreEntry {
  /** Stable key: `a1`, `a2` or `company:<slug>`. */
  key: string
  kind: AssessmentKind
  /** Display name, e.g. "CalibiAI Assessment" or "Amazon". */
  label: string
  /** Category (company tag label, or "Platform assessments"). */
  category: string
  categoryId: string
  /** Company slug for company mocks. */
  company?: string
  /** Raw score on the assessment's own scale. */
  score: number
  max: number
  /** 0-100, one decimal (display). */
  percent: number
  /** 0-100, unrounded — what the average uses (matches the SQL view exactly). */
  exact: number
  /** Score on the 1000 scale (percent × 10), rounded. */
  scaled: number
  /** Grade (platform) or verdict label (company). */
  outcome: string | null
  at: string | null
}

export interface CategoryAverage {
  id: string
  label: string
  count: number
  /** Mean percent of the category's assessments (one decimal). */
  percent: number
}

export interface CalibiScore {
  /** 0-1000, or null when nothing has been graded yet. */
  score: number | null
  /** Mean percent (one decimal), or null. */
  percent: number | null
  grade: string | null
  count: number
  entries: ScoreEntry[]
  categories: CategoryAverage[]
}

export const PLATFORM_CATEGORY = { id: 'platform', label: 'Platform assessments' } as const

export const CALIBI_RULE =
  'Average of every assessment you have completed — each result is scaled to 1000 and every assessment counts equally.'

const VERDICT_LABEL: Record<string, string> = {
  ready: 'Interview-ready',
  almost: 'Almost there',
  borderline: 'Borderline',
  'not-yet': 'Not yet',
}

const round1 = (n: number) => Math.round(n * 10) / 10
const clampPct = (n: number) => Math.max(0, Math.min(100, n))

/** Same bands as the platform assessments (lib/scoring.ts). */
export function calibiGrade(score: number): string {
  return score >= 900 ? 'S' : score >= 750 ? 'A' : score >= 600 ? 'B' : score >= 400 ? 'C' : 'D'
}

function finiteNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Entry for platform assessment 1 (CalibiAI, /1000) or 2 (Capgemini 2027
 * mock, /1000). Accepts a flattened `scores` object, a stored result row or
 * an admin row fragment — anything with a numeric `total`.
 */
export function platformEntry(
  no: 1 | 2,
  result: { total?: unknown; grade?: unknown; created_at?: unknown; submitted_at?: unknown } | null | undefined,
): ScoreEntry | null {
  if (!result) return null
  const total = finiteNumber(result.total)
  if (total === null) return null
  const exact = clampPct(total / 10)
  const percent = round1(exact)
  return {
    key: no === 1 ? 'a1' : 'a2',
    kind: no === 1 ? 'core' : 'capgemini',
    label: no === 1 ? 'CalibiAI Assessment' : 'Capgemini 2027 Mock',
    category: PLATFORM_CATEGORY.label,
    categoryId: PLATFORM_CATEGORY.id,
    score: total,
    max: 1000,
    percent,
    exact,
    scaled: Math.round(exact * 10),
    outcome: result.grade ? `Grade ${String(result.grade)}` : null,
    at: String(result.created_at || result.submitted_at || '') || null,
  }
}

/** Entry for one company mock attempt (/100). Null unless finished and scored. */
export function companyEntry(
  attempt: { company?: unknown; status?: unknown; score?: unknown; verdict?: unknown; submitted_at?: unknown } | null | undefined,
): ScoreEntry | null {
  if (!attempt) return null
  const status = String(attempt.status || '')
  if (status !== 'submitted' && status !== 'expired') return null
  const score = finiteNumber(attempt.score)
  if (score === null) return null
  const slug = String(attempt.company || '')
  const company = getCompany(slug)
  const tag = company ? TAG_BY_ID[company.tag] : undefined
  const exact = clampPct(score)
  const percent = round1(exact)
  return {
    key: `company:${slug}`,
    kind: 'company',
    label: company?.name || slug,
    category: tag?.label || 'Company assessments',
    categoryId: company?.tag || 'company',
    company: slug,
    score,
    max: 100,
    percent,
    exact,
    scaled: Math.round(exact * 10),
    outcome: attempt.verdict ? VERDICT_LABEL[String(attempt.verdict)] || String(attempt.verdict) : null,
    at: String(attempt.submitted_at || '') || null,
  }
}

/** Average every graded assessment into the CalibiAI Score. */
export function computeCalibiScore(entries: Array<ScoreEntry | null | undefined>): CalibiScore {
  // One entry per key (the newest wins) so a duplicated row can never count twice.
  const byKey = new Map<string, ScoreEntry>()
  for (const e of entries) {
    if (!e) continue
    const prev = byKey.get(e.key)
    if (!prev || String(e.at || '') > String(prev.at || '')) byKey.set(e.key, e)
  }
  const list = [...byKey.values()].sort((a, b) =>
    (a.kind === 'company' ? 1 : 0) - (b.kind === 'company' ? 1 : 0) ||
    String(a.at || '').localeCompare(String(b.at || '')) ||
    a.label.localeCompare(b.label),
  )
  if (!list.length) return { score: null, percent: null, grade: null, count: 0, entries: [], categories: [] }

  const mean = list.reduce((s, e) => s + e.exact, 0) / list.length
  // Tiny epsilon so binary floating point never rounds x.5 down (matches SQL round()).
  const score = Math.round(mean * 10 + 1e-9)

  const cats = new Map<string, { label: string; sum: number; count: number }>()
  for (const e of list) {
    const c = cats.get(e.categoryId) || { label: e.category, sum: 0, count: 0 }
    c.sum += e.exact
    c.count++
    cats.set(e.categoryId, c)
  }
  const categories = [...cats.entries()].map(([id, c]) => ({
    id, label: c.label, count: c.count, percent: round1(c.sum / c.count),
  }))

  return { score, percent: round1(mean), grade: calibiGrade(score), count: list.length, entries: list, categories }
}

/** Convenience: build the score straight from the three raw sources. */
export function calibiFromSources(input: {
  a1?: Parameters<typeof platformEntry>[1]
  a2?: Parameters<typeof platformEntry>[1]
  company?: Array<Parameters<typeof companyEntry>[0]>
}): CalibiScore {
  return computeCalibiScore([
    platformEntry(1, input.a1),
    platformEntry(2, input.a2),
    ...(input.company || []).map(companyEntry),
  ])
}
