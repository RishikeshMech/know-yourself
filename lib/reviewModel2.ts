/**
 * Pre-submit "Review" model for Assessment 2 (the Capgemini 2027 mock test).
 *
 * Same contract as buildReview() in lib/reviewModel.ts, but it walks the
 * assessment-2 bank and targets the assessment-2 stage layout:
 *   0 english   (0 Listening, 1 Speaking, 2 Reading, 3 Writing)
 *   1 problem   — AI Literacy (50 scenario MCQs)
 *   2 mcq       — Debugging C/C++/Java (30 code MCQs)
 *   3 debugging — Debugging Lab (compiler tasks 0..2)
 */
import type {
  ReviewModel, ReviewQuestion, ReviewSection,
} from './reviewModel'

const isAnswered = (v: any): boolean =>
  v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0)

const clip = (s: string, n = 110): string => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)
const wordCount = (t: any): number => String(t ?? '').trim().split(/\s+/).filter(Boolean).length

export function buildReview2(bank: any, answers: Record<string, any>): ReviewModel {
  const a = answers || {}
  const sections: ReviewSection[] = []

  /* ---------------- English Communication ---------------- */
  const listening: ReviewQuestion[] = bank.english.listening.clips.flatMap((c: any) =>
    c.questions.map((q: any) => {
      const answered = isAnswered(a[q.id])
      return {
        key: q.id,
        prompt: q.question,
        answered,
        preview: answered ? clip(String(a[q.id])) : '',
        target: { stage: 0, sub: 0 },
      }
    }),
  )

  const speaking: ReviewQuestion[] = bank.english.speaking.tasks.map((t: any) => {
    const answered = isAnswered(a[t.id + '_audio'])
    const meta = a[t.id + '_audio']
    const kb = meta?.size ? Math.max(1, Math.round(Number(meta.size) / 1024)) : 0
    return {
      key: t.id,
      prompt: clip(t.prompt, 130),
      answered,
      preview: answered ? (kb ? `Audio recorded · ${kb} KB` : 'Audio recorded') : '',
      target: { stage: 0, sub: 1 },
    }
  })

  const reading: ReviewQuestion[] = bank.english.reading.questions.map((q: any) => {
    const answered = isAnswered(a[q.id])
    return {
      key: q.id,
      prompt: q.question,
      answered,
      preview: answered ? clip(String(a[q.id])) : '',
      target: { stage: 0, sub: 2 },
    }
  })

  const writingAnswered = isAnswered(a['WRITING'])
  const writing: ReviewQuestion[] = [{
    key: 'WRITING',
    prompt: clip(bank.english.writing.scenario, 130),
    answered: writingAnswered,
    preview: writingAnswered ? `${wordCount(a['WRITING'])} words` : '',
    target: { stage: 0, sub: 3 },
  }]

  sections.push({
    answered: 0,
    total: 0,
    key: 'english',
    label: 'English Communication',
    icon: '🗣️',
    groups: [
      { key: 'listening', label: 'Listening', questions: listening },
      { key: 'speaking', label: 'Speaking', questions: speaking },
      { key: 'reading', label: 'Reading', questions: reading },
      { key: 'writing', label: 'Writing', questions: writing },
    ],
  })

  /* ---------------- AI Literacy ---------------- */
  const literacy: ReviewQuestion[] = bank.problem.map((q: any) => {
    const answered = isAnswered(a[q.id])
    return {
      key: q.id,
      prompt: q.q,
      answered,
      preview: answered ? clip(String(a[q.id])) : '',
      target: { stage: 1, sub: 0 },
    }
  })
  sections.push({
    answered: 0,
    total: 0,
    key: 'ai_literacy',
    label: 'AI Literacy',
    icon: '🤖',
    groups: [{ key: 'literacy', label: `${literacy.length} scenario questions`, questions: literacy }],
  })

  /* ---------------- Debugging C/C++/Java (MCQ) ---------------- */
  const debugMcq: ReviewQuestion[] = bank.debugmcq.map((q: any) => {
    const answered = isAnswered(a[q.id])
    return {
      key: q.id,
      prompt: `${q.tag ? q.tag + ' — ' : ''}${q.q}`,
      answered,
      preview: answered ? clip(String(a[q.id])) : '',
      target: { stage: 2, sub: 0 },
    }
  })
  sections.push({
    answered: 0,
    total: 0,
    key: 'debug_mcq',
    label: 'Debugging — C/C++/Java',
    icon: '🐞',
    groups: [{ key: 'debugmcq', label: `${debugMcq.length} code questions`, questions: debugMcq }],
  })

  /* ---------------- Debugging Lab (compiler tasks) ---------------- */
  const debugLab: ReviewQuestion[] = bank.debugging.map((t: any, i: number) => {
    const answered = isAnswered(a[t.id + '_fix'])
    const len = String(a[t.id + '_fix'] ?? '').length
    return {
      key: t.id,
      prompt: t.title,
      answered,
      preview: answered ? `${len} chars of code` : '',
      target: { stage: 3, sub: 0, task: i },
    }
  })
  sections.push({
    answered: 0,
    total: 0,
    key: 'debug_lab',
    label: 'Debugging Lab',
    icon: '⌨️',
    groups: [{ key: 'debuglab', label: `${debugLab.length} bug-fix tasks (in-built compiler)`, questions: debugLab }],
  })

  /* ---------------- Totals ---------------- */
  for (const s of sections) {
    const all = s.groups.flatMap((g) => g.questions)
    s.answered = all.filter((q) => q.answered).length
    s.total = all.length
  }

  const allQuestions = sections.flatMap((s) => s.groups.flatMap((g) => g.questions))
  const stats = {
    answered: allQuestions.filter((q) => q.answered).length,
    total: allQuestions.length,
  }

  return { sections, stats }
}
