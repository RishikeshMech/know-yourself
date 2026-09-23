/**
 * Pre-submit "Review" model for Assessment 2 (the Capgemini 2027 mock test).
 *
 * Same contract as buildReview() in lib/reviewModel.ts, but it walks the
 * assessment-2 bank and targets the assessment-2 stage layout:
 *   0 english   (0 Listening, 1 Speaking, 2 Reading, 3 Writing)
 *   1 problem   — AI Literacy (50 scenario MCQs)
 *   2 debugging — Debugging Assessment (0 Code MCQs, 1 Debugging Lab)
 *   3 feature   — AI-assisted Coding (in-exam AI assistant + compiler)
 *   4 cognitive — Cognitive Assessment (0 Grid, 1 Logical, 2 Behavioural)
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

  const debugLab: ReviewQuestion[] = bank.debugging.map((t: any, i: number) => {
    const answered = isAnswered(a[t.id + '_fix'])
    const len = String(a[t.id + '_fix'] ?? '').length
    return {
      key: t.id,
      prompt: t.title,
      answered,
      preview: answered ? `${len} chars of code` : '',
      target: { stage: 2, sub: 1, task: i },
    }
  })
  sections.push({
    answered: 0,
    total: 0,
    key: 'debugging',
    label: 'Debugging Assessment',
    icon: '🐞',
    groups: [
      { key: 'debugmcq', label: `${debugMcq.length} code questions`, questions: debugMcq },
      { key: 'debuglab', label: `${debugLab.length} bug-fix tasks (in-built compiler)`, questions: debugLab },
    ],
  })

  /* ---------------- AI-assisted Coding (journey stage 4) ---------------- */
  const fid: string = bank.feature?.id || 'CG4'
  const featureAnswered = isAnswered(a[fid + '_code'])
  const featureLen = String(a[fid + '_code'] ?? '').length
  sections.push({
    answered: 0,
    total: 0,
    key: 'ai_coding',
    label: 'AI-assisted Coding',
    icon: '🚀',
    groups: [{
      key: 'feature',
      label: 'AI-assisted build task',
      questions: [{
        key: fid,
        prompt: bank.feature?.title || 'AI-assisted coding task',
        answered: featureAnswered,
        preview: featureAnswered ? `${featureLen} chars of code` : '',
        target: { stage: 3, sub: 0, task: 0 },
      }],
    }],
  })

  /* ---------------- Cognitive Assessment (journey stage 5) ---------------- */
  const gridAnswered = isAnswered(a['GRID'])
  const grid: ReviewQuestion[] = [{
    key: 'GRID',
    prompt: 'Motion & Grid Challenge — memorise the highlighted pattern and reproduce it.',
    answered: gridAnswered,
    preview: gridAnswered ? `Completed · ${Math.round(Number(a['GRID']) * 100)}% average` : '',
    target: { stage: 4, sub: 0 },
  }]
  const logical: ReviewQuestion[] = (bank.cognitive?.logical || []).map((q: any) => {
    const answered = isAnswered(a[q.id])
    return {
      key: q.id,
      prompt: q.q,
      answered,
      preview: answered ? clip(String(a[q.id])) : '',
      target: { stage: 4, sub: 1 },
    }
  })
  const behavioural: ReviewQuestion[] = (bank.cognitive?.behavioral || []).map((b: any) => {
    const answered = isAnswered(a[b.id])
    const opt = b.options?.find((o: any) => o.score === a[b.id])
    return {
      key: b.id,
      prompt: b.q,
      answered,
      preview: answered ? clip(opt?.text || `Score ${a[b.id]}`) : '',
      target: { stage: 4, sub: 2 },
    }
  })
  sections.push({
    answered: 0,
    total: 0,
    key: 'cognitive',
    label: 'Cognitive Assessment',
    icon: '🧠',
    groups: [
      { key: 'grid', label: 'Motion & Grid Challenge', questions: grid },
      { key: 'logical', label: 'Logical Reasoning', questions: logical },
      { key: 'behavioural', label: 'Behavioural', questions: behavioural },
    ],
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
