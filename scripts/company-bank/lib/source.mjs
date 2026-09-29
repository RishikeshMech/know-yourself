/**
 * Source parsing for the Ques/ master bank documents.
 *
 * The documents are generated Word files with a very regular shape:
 *
 *   Sections 1-3 (MCQ):
 *     "12. [Topic] Question text (Variant 12)"
 *     "A. option" … "D. option"
 *     "Difficulty: Easy|Medium|Hard"
 *
 *   Sections 4-11 (open-ended):
 *     "[Easy] Base prompt Angle sentence."
 *
 * The documents state "No answer key is included". By construction the author
 * always listed the intended answer as option A; every templated item whose
 * answer can be computed is re-derived here and must agree (see verifyKey),
 * and the conceptual items are reviewed in data/company/supplements/reviews.json.
 */
import mammoth from 'mammoth'

export async function docxParagraphs(file) {
  const { value } = await mammoth.extractRawText({ path: file })
  return value
    .split(/\n+/)
    .map((p) => p.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
}

const DIFF = { Easy: 'easy', Medium: 'medium', Hard: 'hard' }
const RANK = { easy: 0, medium: 1, hard: 2 }

/** Strip the generator's disambiguation suffixes. */
export function cleanStem(s) {
  return String(s)
    // "(Variant 12)", "(Practice variant 3)", "(Question 17)" at the end,
    // optionally followed by the sentence's own punctuation, which is kept:
    //   "meaning of 'abundant' (Question 1)."  → "meaning of 'abundant'."
    //   "What is the main idea? (Question 7)"  → "What is the main idea?"
    .replace(/\s*\((?:practice\s+)?variant\s+\d+\)\s*([.?!])?\s*$/i, (_, p) => p || '')
    .replace(/\s*\(question\s+\d+\)\s*([.?!])?\s*$/i, (_, p) => p || '')
    .trim()
}

/** Parse an MCQ section document into raw items (duplicates retained). */
export function parseMcqSection(paragraphs) {
  const items = []
  for (let i = 0; i < paragraphs.length; i++) {
    const m = paragraphs[i].match(/^(\d+)\.\s+\[([^\]]+)\]\s+(.+)$/)
    if (!m) continue
    const opts = []
    let j = i + 1
    while (j < paragraphs.length && opts.length < 4) {
      const o = paragraphs[j].match(/^([A-D])\.\s+(.*)$/)
      if (!o) break
      opts.push(o[2].trim())
      j++
    }
    const d = (paragraphs[j] || '').match(/^Difficulty:\s*(Easy|Medium|Hard)/)
    if (opts.length !== 4 || !d) {
      throw new Error(`Malformed MCQ near source #${m[1]}: ${paragraphs[i].slice(0, 80)}`)
    }
    items.push({
      n: Number(m[1]),
      topic: m[2].trim(),
      q: cleanStem(m[3]),
      options: opts,
      difficulty: DIFF[d[1]],
    })
    i = j
  }
  return items
}

export const ANGLES = [
  { id: 'example', text: 'Provide a concrete example and mention important edge cases.' },
  { id: 'complexity', text: 'Include complexity, risks, and how you would test the solution.' },
  { id: 'compare', text: 'Explain your assumptions and compare at least two approaches.' },
  { id: 'practical', text: 'Answer as if this were a practical interview task.' },
  { id: 'mistakes', text: 'Include common mistakes and how to avoid them.' },
]

/** Normalise a base prompt so "…role?" and "…role." collapse together. */
export function normBase(s) {
  return String(s)
    .trim()
    .replace(/[’‘]/g, "'")
    .replace(/[.?!]+$/, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

/** Parse an open-ended section into raw items (duplicates retained). */
export function parseWrittenSection(paragraphs) {
  const items = []
  let n = 0
  for (const p of paragraphs) {
    const m = p.match(/^\[(Easy|Medium|Hard)\]\s+(.+)$/)
    if (!m) continue
    n++
    let text = m[2].trim()
    let angle = null
    for (const a of ANGLES) {
      if (text.endsWith(' ' + a.text)) {
        angle = a.id
        text = text.slice(0, -a.text.length - 1).trim()
        break
      }
    }
    // The generator appended angles without a full stop ("…a thread Provide a …").
    if (!/[.?!]$/.test(text)) text += '.'
    items.push({ n, difficulty: DIFF[m[1]], base: text, angle })
  }
  return items
}

/** Most frequent label; ties resolve to the harder label. */
export function modeDifficulty(labels) {
  const count = { easy: 0, medium: 0, hard: 0 }
  for (const l of labels) count[l]++
  return Object.keys(count).sort((a, b) => count[b] - count[a] || RANK[b] - RANK[a])[0]
}

/* ------------------------------------------------------------------ */
/* Answer-key verification for templated Section-1 items                */
/* ------------------------------------------------------------------ */

const num = (s) => Number(String(s).replace(/[₹,%\s]|km/g, ''))
const close = (a, b) => Math.abs(a - b) < 0.011

/**
 * Re-derive the correct answer for computable items. Returns
 *   { ok: true }            — option A is verified correct
 *   { ok: false, reason }   — option A is wrong (the build fails)
 *   null                    — not a computable template (reviewed manually)
 */
export function verifyKey(item) {
  const { topic, q, options } = item
  const a = options[0]
  let m
  switch (topic) {
    case 'Percentages':
      if ((m = q.match(/increases from (\d+) to (\d+)/))) {
        const want = ((Number(m[2]) - Number(m[1])) / Number(m[1])) * 100
        return close(num(a), Math.round(want * 100) / 100) ? { ok: true } : { ok: false, reason: `want ${want}` }
      }
      break
    case 'Profit and Loss':
      if ((m = q.match(/costs ₹(\d+) and is sold at a profit of (\d+)%/))) {
        const want = Number(m[1]) * (1 + Number(m[2]) / 100)
        return close(num(a), want) ? { ok: true } : { ok: false, reason: `want ${want}` }
      }
      break
    case 'Simple Interest':
      if ((m = q.match(/on ₹(\d+) at (\d+)% per annum for (\d+) years/))) {
        const want = (Number(m[1]) * Number(m[2]) * Number(m[3])) / 100
        return close(num(a), want) ? { ok: true } : { ok: false, reason: `want ${want}` }
      }
      break
    case 'Ratio and Proportion':
      if ((m = q.match(/ratio (\d+):(\d+)\. If their total is (\d+)/))) {
        const x = Number(m[1]), y = Number(m[2]), t = Number(m[3])
        const want = (t * Math.min(x, y)) / (x + y)
        return close(num(a), want) ? { ok: true } : { ok: false, reason: `want ${want}` }
      }
      break
    case 'Averages':
      if ((m = q.match(/average of ([\d, ]+) is increased .* new average ([\d.]+)/))) {
        const vals = m[1].split(',').map((v) => Number(v.trim()))
        const want = Number(m[2]) * (vals.length + 1) - vals.reduce((s, v) => s + v, 0)
        return close(num(a), want) ? { ok: true } : { ok: false, reason: `want ${want}` }
      }
      break
    case 'Time, Speed and Distance':
      if ((m = q.match(/at (\d+) km\/h for (\d+) hours/))) {
        const want = Number(m[1]) * Number(m[2])
        return close(num(a), want) ? { ok: true } : { ok: false, reason: `want ${want}` }
      }
      break
    case 'Number Series':
      if ((m = q.match(/next number: ([\d, ]+), \?/))) {
        const v = m[1].split(',').map((x) => Number(x.trim()))
        const d = v[1] - v[0]
        const isAp = v.every((x, i) => i === 0 || x - v[i - 1] === d)
        if (!isAp) return { ok: false, reason: 'not an arithmetic series' }
        return close(num(a), v[v.length - 1] + d) ? { ok: true } : { ok: false, reason: 'series mismatch' }
      }
      break
    case 'Letter Series':
      if ((m = q.match(/forward jump of (\d+), what comes after ([A-Z])\?/))) {
        const code = ((m[2].charCodeAt(0) - 65 + Number(m[1])) % 26) + 65
        return a === String.fromCharCode(code) ? { ok: true } : { ok: false, reason: `want ${String.fromCharCode(code)}` }
      }
      break
    case 'Coding-Decoding':
      if ((m = q.match(/replaced by the next letter in the alphabet\. How is the word '([A-Z]+)' coded\?/))) {
        const want = [...m[1]].map((c) => String.fromCharCode(((c.charCodeAt(0) - 65 + 1) % 26) + 65)).join('')
        return a === want ? { ok: true } : { ok: false, reason: `want ${want}` }
      }
      break
    case 'Direction Sense':
      if (/walks 5 km north, turns right and walks 3 km, then turns right and walks 5 km/.test(q)) {
        // N 5 → E 3 → S 5 ⇒ 3 km due east of the start.
        return a === 'East' ? { ok: true } : { ok: false, reason: 'want East' }
      }
      break
  }
  return null
}
