/**
 * Review model for a company paper, in the shape the shared pre-submit review
 * page (components/AssessmentReview.tsx) already renders: rounds → parts →
 * questions, each with answered status and a jump target
 * ({ stage: round index, sub: item index }).
 */
import type { ReviewModel, ReviewSection } from '../reviewModel.ts'
import { SECTION_BY_ID } from './sections.ts'
import type { ClientItem, ClientPaper } from './types.ts'

const clip = (s: string, n = 110) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)
const wordCount = (t: string) => t.trim().split(/\s+/).filter(Boolean).length

export function itemAnswered(item: ClientItem, value: unknown): boolean {
  if (value == null) return false
  if (item.kind === 'mcq') return typeof value === 'string' && item.options.includes(value)
  if (item.kind === 'written') return typeof value === 'string' && value.trim().length > 0
  const code = typeof value === 'object' ? (value as any).code : value
  if (typeof code !== 'string' || !code.trim()) return false
  const lang = typeof value === 'object' ? (value as any).lang : 'python'
  const starter = item.starter[lang === 'javascript' ? 'javascript' : 'python']
  return code.trim() !== starter.trim()
}

function preview(item: ClientItem, value: unknown): string {
  if (item.kind === 'mcq') return `Selected: ${clip(String(value), 80)}`
  if (item.kind === 'written') return `${wordCount(String(value))} words written`
  const v = value as any
  const lines = String(v?.code || '').split('\n').filter((l: string) => l.trim()).length
  return `${v?.lang === 'javascript' ? 'JavaScript' : 'Python'} · ${lines} lines of code`
}

function prompt(item: ClientItem, index: number): string {
  if (item.kind === 'coding') return `Q${index + 1}. Coding — ${item.title}`
  return `Q${index + 1}. ${clip(item.q)}`
}

export function buildCompanyReview(paper: ClientPaper, answers: Record<string, unknown>): ReviewModel {
  let answered = 0
  let total = 0
  const sections: ReviewSection[] = paper.rounds.map((round, stage) => {
    const groups = new Map<string, ReviewSection['groups'][number]>()
    let rAnswered = 0
    round.items.forEach((item, sub) => {
      const key = item.part || 'Questions'
      if (!groups.has(key)) groups.set(key, { key: `${round.id}-${key}`, label: key, questions: [] })
      const isDone = itemAnswered(item, answers[item.id])
      if (isDone) rAnswered++
      groups.get(key)!.questions.push({
        key: item.id,
        prompt: prompt(item, sub),
        answered: isDone,
        preview: isDone ? preview(item, answers[item.id]) : '',
        target: { stage, sub },
      })
    })
    answered += rAnswered
    total += round.items.length
    const firstSection = round.items[0]?.section
    return {
      key: round.id,
      label: `${stage + 1}. ${round.label}`,
      icon: firstSection ? SECTION_BY_ID[firstSection]?.icon || '📝' : '📝',
      groups: [...groups.values()],
      answered: rAnswered,
      total: round.items.length,
    }
  })
  return { sections, stats: { answered, total } }
}
