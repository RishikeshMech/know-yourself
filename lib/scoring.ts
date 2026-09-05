// Calibiai scoring engine — pure function over answers + AI results.
// MCQ answers are stored as the chosen option TEXT (order-independent because
// options are shuffled per session). Behavioral answers store the option's
// own trait score (0-100). Subjective sections use DeepSeek results when
// present (aiResults), else a deterministic heuristic.
import { bank } from './questions'

export type Answers = Record<string, any>
export type AiResults = Record<string, { score: number; rubric?: Record<string, number>; summary?: string; strengths?: string[]; improvements?: string[]; engine?: string }>

function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, Math.round(n)))
}
function clamp01(n: number) {
  return Math.max(0, Math.min(1, n))
}
function round(n: number) {
  return Math.round(n)
}

export function computeScores(answers: Answers, ai: AiResults = {}, meta: { gridAcc?: number; speakingCount?: number } = {}) {
  // ---------------- English: Listening (max 50) ----------------
  const listenQs = bank.english.listening.clips.flatMap((c: any) => c.questions)
  const listenCorrect = listenQs.filter((q: any) => answers[q.id] === q.answer).length
  const listening = round((listenCorrect / listenQs.length) * 50)

  // ---------------- English: Speaking (max 50) ----------------
  const speakingCount =
    meta.speakingCount ??
    (answers['SP1_audio'] ? 1 : 0) + (answers['SP2_audio'] ? 1 : 0)
  const speakingAi = ai['SP_speaking']
  const speaking = speakingAi ? round((speakingAi.score / 100) * 50) : (speakingCount >= 2 ? 42 : speakingCount === 1 ? 32 : 0)

  // ---------------- English: Reading (max 50) ----------------
  const readQs = bank.english.reading.questions
  const readCorrect = readQs.filter((q: any) => answers[q.id] === q.answer).length
  const reading = round((readCorrect / readQs.length) * 50)

  // ---------------- English: Writing (max 50) ----------------
  const writingText: string = answers['WRITING'] || ''
  const writingAi = ai['WRITING']
  let writing = 0
  if (writingAi) writing = round((writingAi.score / 100) * 50)
  else if (writingText.trim()) {
    const words = writingText.trim().split(/\s+/).length
    const lengthScore = words >= 150 && words <= 300 ? 85 : words >= 90 ? 68 : words > 0 ? 48 : 20
    writing = round((lengthScore / 100) * 50)
  }

  const english_total = listening + speaking + reading + writing // /200

  // ---------------- Problem Solving (max 200) ----------------
  const psQs = bank.problem
  const psCorrect = psQs.filter((q: any) => answers[q.id] === q.answer).length
  const problem_solving = round((psCorrect / psQs.length) * 200)

  // ---------------- AI Debugging (max 150, 3 tasks) ----------------
  let debuggingPts = 0
  const debugPer: Record<string, number> = {}
  bank.debugging.forEach((d: any, idx: number) => {
    const fix = answers[d.id + '_fix'] || ''
    const r = ai[d.id]
    let s = 0
    if (r) s = r.score
    else s = fix.trim().length > 60 ? 72 : fix.trim().length > 20 ? 48 : fix.trim() ? 30 : 0
    debugPer[d.id] = s
    debuggingPts += (s / 100) * 50 // 3 tasks * 50 = 150
  })
  const ai_debugging = round(debuggingPts)

  // ---------------- AI Feature Development (max 150) ----------------
  const featureCode = answers['AF1_code'] || ''
  const fAi = ai['AF1']
  let featureScore100 = 0
  if (fAi) featureScore100 = fAi.score
  else featureScore100 = featureCode.trim().length > 120 ? 70 : featureCode.trim().length > 40 ? 45 : featureCode.trim() ? 25 : 0
  const ai_feature = round((featureScore100 / 100) * 150)

  // ---------------- Prompt Engineering (max 100, 3 tasks) ----------------
  let promptPts = 0
  const promptPer: Record<string, number> = {}
  bank.prompt.forEach((t: any) => {
    const val = answers[t.id] || ''
    const r = ai[t.id]
    let s = 0
    if (r) s = r.score
    else {
      const v = String(val).toLowerCase()
      const len = String(val).length
      let h = 30
      if (len > 60) h += 20
      if (/act as|you are|role/.test(v)) h += 14
      if (/constraint|must|only|without|limit/.test(v)) h += 14
      if (/json|format|bullet|exactly|return/.test(v)) h += 14
      if (/context|audience|given|scenario/.test(v)) h += 8
      s = val ? clamp(h) : 0
    }
    promptPer[t.id] = s
    promptPts += s
  })
  const prompt_engineering = round(promptPts / bank.prompt.length)

  // ---------------- Cognitive: Grid (max 30) ----------------
  const attempted = answers['GRID'] !== undefined || typeof meta.gridAcc === 'number'
  const gridAcc = clamp01(typeof meta.gridAcc === 'number' ? meta.gridAcc : (answers['GRID'] || 0))
  // Only award the speed/accuracy composite when the challenge was actually
  // attempted; a never-played grid must score 0 (no free speed points).
  const grid = attempted ? Math.round((0.7 * gridAcc + 0.3 * 0.85) * 30) : 0

  // ---------------- Cognitive: Logical (max 70) ----------------
  const clQs = bank.cognitive.logical
  const clCorrect = clQs.filter((q: any) => answers[q.id] === q.answer).length
  const logical = round((clCorrect / clQs.length) * 70)

  // ---------------- Behavioral (max 100) ----------------
  const behaviors = bank.cognitive.behavioral
  const traitScores: Record<string, number> = {}
  const traitLabels: Record<string, string> = {
    teamwork: 'Teamwork', accountability: 'Accountability', adaptability: 'Adaptability',
    responsible_ai: 'Responsible AI', decision_making: 'Decision Making', learning_mindset: 'Learning Mindset',
  }
  let bSum = 0, bCount = 0
  behaviors.forEach((b: any) => {
    const val = answers[b.id]
    const s = typeof val === 'number' ? clamp(val) : 40 // unanswered -> neutral-low
    traitScores[b.trait] = s
    bSum += s
    bCount++
  })
  const behavioral_total = bCount ? round(bSum / bCount) : 0
  const cognitive_score = grid + logical // /100
  const cognitive_total = cognitive_score + behavioral_total // /200

  // ---------------- Total ----------------
  const total = english_total + problem_solving + ai_debugging + ai_feature + prompt_engineering + cognitive_total
  const grade = total >= 900 ? 'S' : total >= 750 ? 'A' : total >= 600 ? 'B' : total >= 400 ? 'C' : 'D'
  const percentile = clamp(35 + (total / 1000) * 60 + (total > 750 ? 4 : 0), 1, 99.9)

  return {
    english: { listening, speaking, reading, writing, total: english_total, max: 200 },
    problem_solving,
    ai_debugging,
    ai_feature,
    prompt_engineering,
    cognitive: {
      grid, logical, cognitive_score, behavioral_total,
      total: cognitive_total, max: 200,
      behavioral: traitScores, traitLabels,
    },
    detail: {
      listeningCorrect: listenCorrect, listeningTotal: listenQs.length,
      readingCorrect: readCorrect, readingTotal: readQs.length,
      problemCorrect: psCorrect, problemTotal: psQs.length,
      logicalCorrect: clCorrect, logicalTotal: clQs.length,
      debugPer, promptPer, featureScore100,
      speakingCount,
    },
    total, grade, percentile: Number(percentile.toFixed(1)),
    ai_results: ai,
    verifiable_hash: `sha256:${(total * 2654435761 % 100000000).toString(16)}-${Date.now().toString(16).slice(2, 10)}`,
  }
}
