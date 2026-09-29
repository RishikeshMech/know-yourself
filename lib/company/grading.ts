/**
 * Grader for open-ended (written) answers in the company assessments.
 *
 * Follows the platform's grading philosophy (lib/ai.ts): brutal and honest.
 * Guard clauses run BEFORE any model call, so an empty, trivially short,
 * gibberish or copied-from-the-question answer scores 0 and can never be
 * inflated by a lenient LLM.
 *
 * Engines
 *   - LLM (DeepSeek / CalibiAI, when configured): grades against the item's
 *     rubric and returns strict JSON.
 *   - Heuristic (always available): rubric-concept coverage, length, structure
 *     and whether the variant's extra "angle" (edge cases, trade-offs, …) was
 *     addressed. Deterministic, so the whole flow works with no API key.
 */
import { callLlmJson, isLlmConfigured } from '../llm.ts'
import type { WrittenAngle, WrittenQuestion } from './types.ts'

export interface WrittenGrade {
  score: number
  strengths: string[]
  improvements: string[]
  summary: string
  engine: 'calibiai' | 'heuristic'
  coverage?: number
}

/** Hard cap on stored answer length (characters). */
export const MAX_WRITTEN_CHARS = 12_000

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)))

/** Rubric phrases that signal structure, not subject knowledge. */
const GENERIC_PHRASES = new Set([
  'for example', 'e.g.', 'for instance', 'such as', 'example',
  'however', 'on the other hand', 'although', 'while', 'whereas', 'but',
  'in conclusion', 'to conclude', 'overall', 'therefore', 'in summary',
  'first', 'then', 'finally', 'because', 'when', 'during', 'result',
])

/**
 * Word-aware phrase matching. Phrases are stems ("synchroniz" matches
 * "synchronization"), so only a leading word boundary is required — except for
 * very short tokens ("ide", "run", "ttl"), which must match as whole words so
 * they cannot fire inside unrelated words ("prov-ide", "p-run-e").
 */
const phraseCache = new Map<string, RegExp>()
function phraseRegex(phrase: string): RegExp {
  let re = phraseCache.get(phrase)
  if (!re) {
    const esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const short = phrase.replace(/\W/g, '').length <= 3
    re = new RegExp(`${/^\w/.test(phrase) ? '\\b' : ''}${esc}${short && /\w$/.test(phrase) ? '\\b' : ''}`, 'i')
    phraseCache.set(phrase, re)
  }
  return re
}
const hasPhrase = (text: string, phrase: string) => phraseRegex(phrase).test(text)
const words = (t: string) => t.trim().split(/\s+/).filter(Boolean)

const ANGLE_CUES: Record<WrittenAngle, { label: string; cues: RegExp }> = {
  example: { label: 'a concrete example and edge cases', cues: /for example|for instance|e\.g\.|such as|edge case|boundary|corner case|empty|null/i },
  complexity: { label: 'complexity, risks and testing', cues: /complexit|o\(|risk|test/i },
  compare: { label: 'a comparison of at least two approaches', cues: /approach|alternative|compared|versus|\bvs\.?\b|on the other hand|trade-?off|whereas/i },
  practical: { label: 'a practical, step-by-step answer', cues: /\bi would\b|\bi'd\b|step|first|then|finally|in practice/i },
  mistakes: { label: 'common mistakes and how to avoid them', cues: /mistake|pitfall|avoid|common error|gotcha|anti-?pattern/i },
}

function zero(summary: string, improvements: string[]): WrittenGrade {
  return { score: 0, strengths: [], improvements, summary, engine: 'heuristic', coverage: 0 }
}

/** Guard clauses shared by both engines. Returns a zero grade or null. */
export function guardAnswer(q: WrittenQuestion, answer: string): WrittenGrade | null {
  const text = String(answer || '').trim()
  const w = words(text)
  if (!w.length) return zero('No answer was submitted — scored 0.', ['Write an answer that addresses the question directly.'])
  const floor = Math.max(20, Math.round(q.minWords * 0.35))
  if (w.length < floor) {
    return zero(`The answer is only ${w.length} words — below the ${floor}-word minimum to earn credit.`, [
      `Aim for at least ${q.minWords} words covering the key concepts.`,
    ])
  }
  const letters = (text.match(/[a-z]/gi) || []).length
  if (letters / Math.max(1, text.replace(/\s/g, '').length) < 0.55) {
    return zero('The answer is not meaningful prose — scored 0.', ['Answer in complete sentences.'])
  }
  const unique = new Set(w.map((x) => x.toLowerCase().replace(/[^a-z0-9]/g, ''))).size
  if (unique / w.length < 0.3) {
    return zero('The answer repeats the same words — scored 0.', ['Explain the concepts instead of repeating words.'])
  }
  const qWords = new Set(words(q.q.toLowerCase()).map((x) => x.replace(/[^a-z0-9]/g, '')))
  const overlap = w.filter((x) => qWords.has(x.toLowerCase().replace(/[^a-z0-9]/g, ''))).length / w.length
  if (overlap > 0.8 && w.length <= words(q.q).length * 1.5) {
    return zero('The answer restates the question without answering it — scored 0.', ['Answer the question rather than repeating it.'])
  }
  return null
}

export function heuristicGrade(q: WrittenQuestion, answer: string): WrittenGrade {
  const guard = guardAnswer(q, answer)
  if (guard) return guard
  const text = String(answer).trim()
  const lower = text.toLowerCase()
  const w = words(text)

  // A point matched only through a generic phrase ("for example") proves
  // nothing about relevance, so it counts only once the answer has at least two
  // content-specific matches — otherwise any fluent essay would collect it.
  const specific = q.rubric.filter((p) => p.any.some((phrase) => !GENERIC_PHRASES.has(phrase) && hasPhrase(lower, phrase)))
  const genericOnly = q.rubric.filter((p) => !specific.includes(p) && p.any.some((phrase) => GENERIC_PHRASES.has(phrase) && hasPhrase(lower, phrase)))
  const matched = specific.length >= 2 ? [...specific, ...genericOnly] : specific
  const missing = q.rubric.filter((p) => !matched.includes(p))
  const coverage = q.rubric.length ? matched.length / q.rubric.length : 0

  const lengthScore = Math.min(1, w.length / Math.max(1, q.minWords))
  const sentences = text.split(/[.!?]+\s|\n+/).filter((s) => words(s).length >= 3).length
  const structureSignals = [
    sentences >= 3,
    /for example|for instance|e\.g\.|such as/i.test(text),
    /however|whereas|on the other hand|trade-?off|\bbut\b|although/i.test(text),
    /(^|\n)\s*(\d+[.)]|[-•*])\s+|\bfirst(ly)?\b|\bsecond(ly)?\b|\bthen\b|\bfinally\b/i.test(text),
  ]
  const structure = structureSignals.filter(Boolean).length / structureSignals.length
  const angle = q.angle ? ANGLE_CUES[q.angle] : null
  const angleMet = angle ? angle.cues.test(text) : true

  // Relevance gates everything else: length, structure and the variant's angle
  // only earn full credit once the answer covers most of the key concepts, so a
  // fluent but off-topic answer cannot score well on presentation alone.
  const relevance = Math.min(1, coverage / 0.6)
  const quality = 0.15 * lengthScore + 0.12 * structure + 0.08 * (angleMet ? 1 : 0)
  let score = 100 * (0.65 * coverage + quality * relevance)
  // Density: an on-topic answer engages the key concepts throughout, not in a
  // single incidental sentence. Sparse matches scale the score down.
  const phrases = q.rubric.flatMap((p) => p.any).filter((ph) => !GENERIC_PHRASES.has(ph))
  const sentenceList = text.toLowerCase().split(/(?<=[.!?])\s+|\n+/).filter((s) => words(s).length >= 3)
  const density = sentenceList.length ? sentenceList.filter((s) => phrases.some((ph) => hasPhrase(s, ph))).length / sentenceList.length : 0
  score *= Math.min(1, 0.25 + density * 1.5)
  // Barely touches the question's key concepts.
  if (coverage <= 0.2) score = Math.min(score, 20)
  // Keyword stuffing: concepts listed without explanation.
  if (sentences < 2) score = Math.min(score, 40)
  if (w.length > q.maxWords * 1.5) score -= 5

  const strengths = matched.slice(0, 3).map((p) => p.label)
  const improvements = [
    ...missing.slice(0, 3).map((p) => `Cover: ${p.label.toLowerCase()}`),
    ...(lengthScore < 1 ? [`Develop the answer further (about ${q.minWords}+ words).`] : []),
    ...(angle && !angleMet ? [`The question asks for ${angle.label}.`] : []),
    ...(structure < 0.5 ? ['Structure it: short paragraphs or steps, with an example and a trade-off.'] : []),
  ].slice(0, 4)
  const pct = Math.round(coverage * 100)
  return {
    score: clamp(score),
    strengths,
    improvements,
    summary: `Covered ${matched.length} of ${q.rubric.length} key concepts (${pct}%). Rule-based rubric grading — connect the CalibiAI grader for semantic evaluation.`,
    engine: 'heuristic',
    coverage: Math.round(coverage * 100) / 100,
  }
}

const CONTRACT = `Respond ONLY with a JSON object:
{"score": <integer 0-100>, "strengths": ["<short bullet>", ...], "improvements": ["<short actionable bullet>", ...], "summary": "<one sentence>"}
You are a strict, honest interviewer grading a campus-hiring assessment. Do not inflate scores.
A vague or generic answer that does not address the specific question must score below 40.
An answer that is correct but misses several rubric concepts should score 50-70.
Reserve 85+ for precise, well-structured answers that cover the rubric with examples and trade-offs.`

export async function llmGrade(q: WrittenQuestion, answer: string): Promise<WrittenGrade | null> {
  if (!isLlmConfigured()) return null
  const rubric = q.rubric.map((p, i) => `${i + 1}. ${p.label}`).join('\n')
  const ai = await callLlmJson({
    label: 'company-grader',
    temperature: 0.1,
    timeoutMs: 12_000,
    messages: [
      { role: 'system', content: `${CONTRACT}` },
      {
        role: 'user',
        content:
          `Question (${q.topic}, ${q.difficulty}):\n${q.q}\n\n` +
          `Rubric — key concepts a strong answer covers:\n${rubric}\n\n` +
          `Expected length: ${q.minWords}-${q.maxWords} words.\n\n` +
          `Candidate answer:\n"""\n${String(answer).slice(0, MAX_WRITTEN_CHARS)}\n"""`,
      },
    ],
  })
  if (!ai || typeof ai.score !== 'number' || !Number.isFinite(ai.score)) return null
  return {
    score: clamp(ai.score),
    strengths: Array.isArray(ai.strengths) ? ai.strengths.slice(0, 4).map(String) : [],
    improvements: Array.isArray(ai.improvements) ? ai.improvements.slice(0, 4).map(String) : [],
    summary: String(ai.summary || 'Graded by the CalibiAI grader.'),
    engine: 'calibiai',
  }
}

/** Grade one written answer: guards → LLM (if configured) → heuristic fallback. */
export async function gradeWritten(q: WrittenQuestion, answer: string, opts: { useLlm?: boolean } = {}): Promise<WrittenGrade> {
  const guard = guardAnswer(q, answer)
  if (guard) return guard
  if (opts.useLlm !== false) {
    const ai = await llmGrade(q, answer)
    if (ai) return ai
  }
  return heuristicGrade(q, answer)
}
