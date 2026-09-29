/**
 * Server-side scoring for a company-assessment attempt.
 *
 * Nothing here trusts the browser: MCQs are checked against the bank's answer
 * keys, coding answers are re-run against the hidden tests, and written
 * answers are graded on the server. Dependencies (grader, code runner) are
 * injected so the whole pipeline is unit-testable without subprocesses or an
 * LLM.
 */
import { getBlueprint } from './blueprints.ts'
import { SECTION_BY_ID } from './sections.ts'
import type {
  AttemptResult, CodingQuestion, ItemResult, McqQuestion, RoundResult, SectionId,
  SectionResult, StoredPaper, Verdict, WrittenQuestion,
} from './types.ts'
import type { LoadedBank } from './bank.ts'
import type { WrittenGrade } from './grading.ts'
import type { CodeLang } from './languages.ts'
import { isCodeLang } from './languages.ts'
import type { TestRunResult } from '../runTests.ts'

export interface CodingAnswer {
  lang: CodeLang
  code: string
}

export interface ScoreDeps {
  gradeWritten: (q: WrittenQuestion, answer: string) => Promise<WrittenGrade>
  runCode: (q: CodingQuestion, code: string, lang: CodeLang) => Promise<TestRunResult>
  now?: () => Date
  /** Max concurrent grader / code-runner calls. */
  concurrency?: number
}

const round1 = (n: number) => Math.round(n * 10) / 10
const round2 = (n: number) => Math.round(n * 100) / 100

export const VERDICT_LABEL: Record<Verdict, string> = {
  ready: 'Interview-ready',
  almost: 'Almost there',
  borderline: 'Borderline',
  'not-yet': 'Not yet ready',
}

export function verdictFor(score: number, allCleared: boolean): Verdict {
  if (score >= 75 && allCleared) return 'ready'
  if (score >= 60) return 'almost'
  if (score >= 45) return 'borderline'
  return 'not-yet'
}

/** Normalise a submitted coding answer ({lang, code} or a bare string). */
export function readCodingAnswer(v: unknown): CodingAnswer | null {
  if (!v) return null
  if (typeof v === 'string') return v.trim() ? { lang: 'python', code: v } : null
  if (typeof v === 'object') {
    const o = v as any
    const lang: CodeLang = isCodeLang(o.lang) ? o.lang : 'python'
    const code = typeof o.code === 'string' ? o.code : ''
    return code.trim() ? { lang, code } : null
  }
  return null
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  })
  await Promise.all(workers)
  return out
}

export async function scoreAttempt(
  paper: StoredPaper,
  answers: Record<string, unknown>,
  bank: LoadedBank,
  deps: ScoreDeps,
): Promise<AttemptResult> {
  const bp = getBlueprint(paper.blueprint)
  const flat = paper.rounds.flatMap((r) => r.items.map((it) => ({ roundId: r.id, it })))
  const graders = { written: 'none', coding: 'none' }

  const itemResults = await mapLimit(flat, deps.concurrency ?? 4, async ({ roundId, it }): Promise<(ItemResult & { roundId: string }) | null> => {
    const q = bank.byId.get(it.id)
    if (!q) return null
    const base = { id: q.id, kind: q.kind, section: q.section, topic: q.topic, area: q.area, difficulty: q.difficulty, marks: it.marks, roundId }
    const raw = answers[q.id]

    if (q.kind === 'mcq') {
      const mq = q as McqQuestion
      const chosen = typeof raw === 'string' ? raw : ''
      const answered = !!chosen && mq.options.includes(chosen)
      const correct = answered && chosen === mq.answer
      return { ...base, earned: correct ? it.marks : 0, answered, correct }
    }

    if (q.kind === 'written') {
      const text = typeof raw === 'string' ? raw : ''
      const grade = await deps.gradeWritten(q as WrittenQuestion, text)
      if (text.trim()) graders.written = grade.engine
      return {
        ...base,
        earned: round2((it.marks * grade.score) / 100),
        answered: !!text.trim(),
        correct: grade.score >= 60,
        score: grade.score,
        feedback: { strengths: grade.strengths, improvements: grade.improvements, summary: grade.summary, engine: grade.engine },
      }
    }

    const cq = q as CodingQuestion
    const ans = readCodingAnswer(raw)
    if (!ans) return { ...base, earned: 0, answered: false, correct: false, passed: 0, total: cq.tests.length }
    const run = await deps.runCode(cq, ans.code, ans.lang)
    graders.coding = ans.lang
    const total = run.total || cq.tests.length
    const passed = Math.min(run.passed, total)
    return {
      ...base,
      earned: round2(total ? (it.marks * passed) / total : 0),
      answered: true,
      correct: total > 0 && passed === total,
      passed,
      total,
      score: total ? Math.round((passed / total) * 100) : 0,
      feedback: codingFeedback(run, passed, total, ans.lang),
    }
  })

  const items = itemResults.filter(Boolean) as Array<ItemResult & { roundId: string }>

  const rounds: RoundResult[] = paper.rounds.map((r) => {
    const spec = bp?.rounds.find((x) => x.id === r.id)
    const rs = items.filter((i) => i.roundId === r.id)
    const possible = rs.reduce((s, i) => s + i.marks, 0)
    const earned = round2(rs.reduce((s, i) => s + i.earned, 0))
    const percent = possible ? round1((earned / possible) * 100) : 0
    const cutoff = spec?.cutoff
    return {
      id: r.id,
      label: spec?.label || r.id,
      weight: spec?.weight ?? 0,
      earned,
      possible,
      percent,
      ...(cutoff != null ? { cutoff } : {}),
      cleared: cutoff == null ? true : percent >= cutoff,
      answered: rs.filter((i) => i.answered).length,
      total: rs.length,
    }
  })

  const weightSum = rounds.reduce((s, r) => s + (r.possible ? r.weight : 0), 0)
  const score = weightSum ? round1(rounds.reduce((s, r) => s + (r.possible ? r.weight * r.percent : 0), 0) / weightSum) : 0

  const sectionIds = [...new Set(items.map((i) => i.section))] as SectionId[]
  const sections: SectionResult[] = sectionIds
    .map((sid) => {
      const ss = items.filter((i) => i.section === sid)
      const possible = ss.reduce((s, i) => s + i.marks, 0)
      const earned = round2(ss.reduce((s, i) => s + i.earned, 0))
      return {
        section: sid,
        title: SECTION_BY_ID[sid]?.title || sid,
        earned,
        possible,
        percent: possible ? round1((earned / possible) * 100) : 0,
        answered: ss.filter((i) => i.answered).length,
        total: ss.length,
      }
    })
    .sort((a, b) => Number(a.section.slice(1)) - Number(b.section.slice(1)))

  const allCleared = rounds.every((r) => r.cleared)
  const verdict = verdictFor(score, allCleared)
  return {
    score,
    verdict,
    verdictLabel: VERDICT_LABEL[verdict],
    rounds,
    sections,
    items: items.map(({ roundId: _r, ...rest }) => rest),
    answered: items.filter((i) => i.answered).length,
    total: items.length,
    gradedAt: (deps.now ? deps.now() : new Date()).toISOString(),
    graders,
  }
}

export interface TopicStat {
  section: SectionId
  topic: string
  earned: number
  possible: number
  percent: number
}

export interface AreaStat {
  section: SectionId
  area: string
  label: string
  earned: number
  possible: number
  percent: number
  items: number
}

export interface PublicResult extends Omit<AttemptResult, 'items'> {
  /** Topic-level performance. */
  topics: TopicStat[]
  /** Area-level performance (e.g. "Quantitative Aptitude", "DBMS") — the
   *  basis of the strengths / focus-areas summary, less noisy than topics. */
  areas: AreaStat[]
  /** Written and coding items only — with grader feedback. MCQ-level
   *  correctness is never exposed, so the key cannot be reconstructed and
   *  shared with candidates who have not taken the test yet. */
  items: Array<Pick<ItemResult, 'id' | 'kind' | 'section' | 'topic' | 'difficulty' | 'marks' | 'earned' | 'answered' | 'score' | 'passed' | 'total' | 'feedback'>>
}

export function toPublicResult(result: AttemptResult): PublicResult {
  const byTopic = new Map<string, TopicStat>()
  for (const it of result.items) {
    const key = `${it.section}|${it.topic}`
    const t = byTopic.get(key) || { section: it.section, topic: it.topic, earned: 0, possible: 0, percent: 0 }
    t.earned += it.earned
    t.possible += it.marks
    byTopic.set(key, t)
  }
  const topics = [...byTopic.values()]
    .map((t) => ({ ...t, earned: round2(t.earned), percent: t.possible ? round1((t.earned / t.possible) * 100) : 0 }))
    .sort((a, b) => b.possible - a.possible || a.topic.localeCompare(b.topic))
  const byArea = new Map<string, AreaStat>()
  for (const it of result.items) {
    const area = it.kind === 'coding' ? 'coding' : it.area || 'general'
    const key = `${it.section}|${area}`
    const label = SECTION_BY_ID[it.section]?.areas[area] || SECTION_BY_ID[it.section]?.title || area
    const a = byArea.get(key) || { section: it.section, area, label, earned: 0, possible: 0, percent: 0, items: 0 }
    a.earned += it.earned
    a.possible += it.marks
    a.items++
    byArea.set(key, a)
  }
  const areas = [...byArea.values()]
    .map((a) => ({ ...a, earned: round2(a.earned), percent: a.possible ? round1((a.earned / a.possible) * 100) : 0 }))
    .sort((a, b) => b.possible - a.possible || a.label.localeCompare(b.label))
  const { items, ...rest } = result
  return {
    ...rest,
    topics,
    areas,
    items: items
      .filter((i) => i.kind !== 'mcq')
      .map(({ id, kind, section, topic, difficulty, marks, earned, answered, score, passed, total, feedback }) => ({
        id, kind, section, topic, difficulty, marks, earned, answered, score, passed, total, feedback,
      })),
  }
}

/** LeetCode-style verdict summary for one judged coding answer. */
export function codingFeedback(run: TestRunResult, passed: number, total: number, engine: string) {
  const n = (st: string) => run.results.filter((r) => r.status === st).length
  const tle = n('tle'), wrong = n('wrong'), err = n('error')
  const stressTotal = run.results.filter((r) => r.stress).length
  const stressPassed = run.results.filter((r) => r.stress && r.passed).length
  const strengths: string[] = []
  const improvements: string[] = []
  if (total > 0 && passed === total) strengths.push(stressTotal ? `All ${total} tests passed, including ${stressTotal} large stress test${stressTotal > 1 ? 's' : ''} within the time limit.` : `All ${total} tests passed.`)
  else if (passed > 0) strengths.push(`${passed} of ${total} tests passed.`)
  if (run.error) improvements.push(run.timedOut ? 'The run timed out — check for infinite loops or a very slow algorithm.' : String(run.error).slice(0, 200))
  if (tle) improvements.push(`${tle} test${tle > 1 ? 's' : ''} exceeded the time limit — aim for the complexity stated in the constraints (e.g. O(n) or O(n log n) instead of O(n²)).`)
  if (wrong) improvements.push(`${wrong} test${wrong > 1 ? 's' : ''} returned a wrong answer — check edge cases such as empty input, duplicates, negative numbers and boundary values.`)
  if (err) improvements.push(`${err} test${err > 1 ? 's' : ''} crashed with a runtime error${run.results.find((r) => r.status === 'error' && r.message)?.message ? ` (${run.results.find((r) => r.status === 'error' && r.message)!.message})` : ''}.`)
  const parts = [`${passed}/${total} tests passed`]
  if (stressTotal) parts.push(`stress ${stressPassed}/${stressTotal}`)
  if (tle) parts.push(`${tle} TLE`)
  if (wrong) parts.push(`${wrong} wrong`)
  if (err) parts.push(`${err} error${err > 1 ? 's' : ''}`)
  return { strengths, improvements, summary: parts.join(' · ') + '.', engine }
}
