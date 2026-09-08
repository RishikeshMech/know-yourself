/**
 * Builds the pre-submit "Review" model: every section, group and question in
 * the assessment with its answered / not-answered status and a navigation
 * target so the candidate can jump straight back to it from the review page.
 *
 * `bank` is the raw question data (see lib/questions.ts); it is passed in so
 * this module stays dependency-free and testable under Node's type-stripping
 * test runner (which does not resolve the `@/` path alias).
 *
 * Stage / sub indices mirror the STAGES order in app/assessment/page.tsx:
 *   0 english   (0 Listening, 1 Speaking, 2 Reading, 3 Writing)
 *   1 problem
 *   2 debugging (task index 0..2)
 *   3 feature   (task index 0)
 *   4 prompt
 *   5 cognitive (0 Grid, 1 Logical, 2 Behavioural)
 */

export interface ReviewTarget {
  stage: number
  sub: number
  task?: number
}

export interface ReviewQuestion {
  key: string
  prompt: string
  answered: boolean
  preview: string
  target: ReviewTarget
}

export interface ReviewGroup {
  key: string
  label: string
  questions: ReviewQuestion[]
}

export interface ReviewSection {
  key: string
  label: string
  icon: string
  groups: ReviewGroup[]
  answered: number
  total: number
}

export interface ReviewStats {
  answered: number
  total: number
}

export interface ReviewModel {
  sections: ReviewSection[]
  stats: ReviewStats
}

const isAnswered = (v: any): boolean =>
  v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0)

const clip = (s: string, n = 110): string => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)
const wordCount = (t: any): number => String(t ?? '').trim().split(/\s+/).filter(Boolean).length

export function buildReview(bank: any, answers: Record<string, any>): ReviewModel {
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
      prompt: t.prompt,
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

  /* ---------------- Problem Solving ---------------- */
  const problem: ReviewQuestion[] = bank.problem.map((q: any) => {
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
    key: 'problem',
    label: 'Problem Solving',
    icon: '🧩',
    groups: [{ key: 'problem', label: `${problem.length} questions`, questions: problem }],
  })

  /* ---------------- AI-Assisted Debugging ---------------- */
  const debugging: ReviewQuestion[] = bank.debugging.map((t: any, i: number) => {
    const answered = isAnswered(a[t.id + '_fix'])
    const len = String(a[t.id + '_fix'] ?? '').length
    return {
      key: t.id,
      prompt: t.title,
      answered,
      preview: answered ? `${len} chars of code` : '',
      target: { stage: 2, sub: 0, task: i },
    }
  })
  sections.push({
    answered: 0,
    total: 0,
    key: 'debugging',
    label: 'AI-Assisted Debugging',
    icon: '🐞',
    groups: [{ key: 'debug', label: `${debugging.length} bug-fix tasks`, questions: debugging }],
  })

  /* ---------------- AI Feature Development ---------------- */
  const featureAnswered = isAnswered(a['AF1_code'])
  const featureLen = String(a['AF1_code'] ?? '').length
  const feature: ReviewQuestion[] = [{
    key: 'AF1',
    prompt: bank.feature.title,
    answered: featureAnswered,
    preview: featureAnswered ? `${featureLen} chars of code` : '',
    target: { stage: 3, sub: 0, task: 0 },
  }]
  sections.push({
    answered: 0,
    total: 0,
    key: 'feature',
    label: 'AI Feature Development',
    icon: '🚀',
    groups: [{ key: 'feature', label: 'Feature implementation', questions: feature }],
  })

  /* ---------------- Prompt Engineering ---------------- */
  const prompt: ReviewQuestion[] = bank.prompt.map((t: any) => {
    const answered = isAnswered(a[t.id])
    const len = String(a[t.id] ?? '').length
    return {
      key: t.id,
      prompt: t.task,
      answered,
      preview: answered ? `${len} chars` : '',
      target: { stage: 4, sub: 0 },
    }
  })
  sections.push({
    answered: 0,
    total: 0,
    key: 'prompt',
    label: 'Prompt Engineering',
    icon: '✍️',
    groups: [{ key: 'prompt', label: `${prompt.length} prompts`, questions: prompt }],
  })

  /* ---------------- Cognitive Assessment ---------------- */
  const gridAnswered = isAnswered(a['GRID'])
  const grid: ReviewQuestion[] = [{
    key: 'GRID',
    prompt: 'Motion & Grid Challenge — memorise the highlighted pattern and reproduce it.',
    answered: gridAnswered,
    preview: gridAnswered ? `Completed · ${Math.round(Number(a['GRID']) * 100)}% average` : '',
    target: { stage: 5, sub: 0 },
  }]

  const logical: ReviewQuestion[] = bank.cognitive.logical.map((q: any) => {
    const answered = isAnswered(a[q.id])
    return {
      key: q.id,
      prompt: q.q,
      answered,
      preview: answered ? clip(String(a[q.id])) : '',
      target: { stage: 5, sub: 1 },
    }
  })

  const behavioural: ReviewQuestion[] = bank.cognitive.behavioral.map((b: any) => {
    const answered = isAnswered(a[b.id])
    const opt = b.options?.find((o: any) => o.score === a[b.id])
    return {
      key: b.id,
      prompt: b.q,
      answered,
      preview: answered ? clip(opt?.text || `Score ${a[b.id]}`) : '',
      target: { stage: 5, sub: 2 },
    }
  })

  sections.push({
    answered: 0,
    total: 0,
    key: 'cognitive',
    label: 'Cognitive Assessment',
    icon: '🧠',
    groups: [
      { key: 'grid', label: 'Grid Challenge', questions: grid },
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
  const stats: ReviewStats = {
    answered: allQuestions.filter((q) => q.answered).length,
    total: allQuestions.length,
  }

  return { sections, stats }
}
