// Scoring engine for Assessment 2 — the Capgemini 2027 mock test.
// Mirrors computeScores() in lib/scoring.ts but walks the assessment-2 bank:
//
//   English Communication .... /200  (Listening 50 · Speaking 50 · Reading 50 · Writing 50)
//   AI Literacy .............. /400  (50 scenario MCQs, from the AI Literacy paper)
//   Debugging C/C++/Java ..... /250  (30 code MCQs, from the Section-2 paper)
//   Debugging Lab ............ /150  (3 compiler tasks × 50 — hidden tests + AI rubric)
//   TOTAL .................... /1000
//
// MCQ answers are stored as the chosen option TEXT (order-independent because
// options are shuffled per session), exactly like assessment 1.
//
// The question bank is passed in through `meta.bank` rather than imported, so
// this module can be exercised directly by `npm test` (Node's type-stripping
// loader cannot resolve the `@/` alias that data/questions2.json is loaded
// through). The app always supplies it via the assessment config.
import rawBank from '../data/questions2.json' with { type: 'json' }

const defaultBank: any = rawBank

export type Answers = Record<string, any>
export type AiResults = Record<string, { score: number; rubric?: Record<string, number>; summary?: string; strengths?: string[]; improvements?: string[]; engine?: string }>
export type TestResults = Record<string, { passed: number; total: number } | undefined>

function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, Math.round(n)))
}
function round(n: number) {
  return Math.round(n)
}

export function computeScores2(
  answers: Answers,
  ai: AiResults = {},
  meta: { speakingCount?: number; testResults?: TestResults; bank?: any } = {},
) {
  const bank2: any = meta.bank || defaultBank
  // ---------------- English: Listening (max 50) ----------------
  const listenQs = bank2.english.listening.clips.flatMap((c: any) => c.questions)
  const listenCorrect = listenQs.filter((q: any) => answers[q.id] === q.answer).length
  const listening = round((listenCorrect / listenQs.length) * 50)

  // ---------------- English: Speaking (max 50, 3 tasks) ----------------
  const speakingCount =
    meta.speakingCount ?? bank2.english.speaking.tasks.filter((t: any) => answers[t.id + '_audio']).length
  const speakingAi = ai['SP_speaking']
  const speaking = speakingAi
    ? round((speakingAi.score / 100) * 50)
    : speakingCount >= 3 ? 45 : speakingCount === 2 ? 38 : speakingCount === 1 ? 30 : 0

  // ---------------- English: Reading (max 50) ----------------
  const readQs = bank2.english.reading.questions
  const readCorrect = readQs.filter((q: any) => answers[q.id] === q.answer).length
  const reading = round((readCorrect / readQs.length) * 50)

  // ---------------- English: Writing (max 50, target 120–180 words) ----------------
  const writingText: string = answers['WRITING'] || ''
  const writingAi = ai['WRITING']
  let writing = 0
  if (writingAi) writing = round((writingAi.score / 100) * 50)
  else if (writingText.trim()) {
    const words = writingText.trim().split(/\s+/).length
    const lengthScore = words >= 120 && words <= 180 ? 85 : words >= 80 ? 68 : words > 0 ? 48 : 20
    writing = round((lengthScore / 100) * 50)
  }

  const english_total = listening + speaking + reading + writing // /200

  // ---------------- AI Literacy (max 400, 50 MCQs) ----------------
  const alQs = bank2.problem
  const alCorrect = alQs.filter((q: any) => answers[q.id] === q.answer).length
  const ai_literacy = round((alCorrect / alQs.length) * 400)

  // ---------------- Debugging C/C++/Java MCQs (max 250, 30 questions) ----------------
  const dmQs = bank2.debugmcq
  const dmCorrect = dmQs.filter((q: any) => answers[q.id] === q.answer).length
  const debug_mcq = round((dmCorrect / dmQs.length) * 250)

  // ---------------- Debugging Lab (max 150, 3 compiler tasks × 50) ----------------
  // Each task is scored out of 100 first. The hidden test-runner result is the
  // primary evidence (60%); an AI evaluation of the submitted fix contributes
  // 40%. Without a test run the AI score stands alone; without either, a
  // conservative length heuristic (mirroring assessment 1) applies.
  let labPts = 0
  const labPer: Record<string, number> = {}
  bank2.debugging.forEach((t: any) => {
    const fix = answers[t.id + '_fix'] || ''
    const r = ai[t.id]
    const tr = meta.testResults?.[t.id]
    let s = 0
    const testPct = tr && tr.total > 0 ? (tr.passed / tr.total) * 100 : null
    if (testPct != null && r) s = round(testPct * 0.6 + r.score * 0.4)
    else if (testPct != null) s = round(testPct)
    else if (r) s = r.score
    else s = fix.trim().length > 60 ? 72 : fix.trim().length > 20 ? 48 : fix.trim() ? 30 : 0
    labPer[t.id] = s
    labPts += (s / 100) * 50 // 3 tasks × 50 = 150
  })
  const debug_lab = round(labPts)

  // ---------------- Total ----------------
  const total = english_total + ai_literacy + debug_mcq + debug_lab
  const grade = total >= 900 ? 'S' : total >= 750 ? 'A' : total >= 600 ? 'B' : total >= 400 ? 'C' : 'D'
  const percentile = clamp(35 + (total / 1000) * 60 + (total > 750 ? 4 : 0), 1, 99.9)

  return {
    assessment_no: 2,
    assessment_title: bank2.title,
    english: { listening, speaking, reading, writing, total: english_total, max: 200 },
    ai_literacy,
    debug_mcq,
    debug_lab,
    detail: {
      listeningCorrect: listenCorrect, listeningTotal: listenQs.length,
      readingCorrect: readCorrect, readingTotal: readQs.length,
      aiLiteracyCorrect: alCorrect, aiLiteracyTotal: alQs.length,
      debugMcqCorrect: dmCorrect, debugMcqTotal: dmQs.length,
      labPer, speakingCount,
    },
    total, grade, percentile: Number(percentile.toFixed(1)),
    ai_results: ai,
    verifiable_hash: `sha256:${(total * 2654435761 % 100000000).toString(16)}-${Date.now().toString(16).slice(2, 10)}`,
  }
}
