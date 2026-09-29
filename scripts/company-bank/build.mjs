#!/usr/bin/env node
/**
 * Builds the company-assessment question bank from the Ques/ master documents.
 *
 *   npm run build:company-bank
 *
 * Inputs
 *   Ques/Section_*.docx                         the 11 master-bank sections
 *   Ques/50 Companies Steps Assessment Research.docx
 *   data/company/supplements/*.json             reviewed supplementary items,
 *                                               rubrics and coding problems
 *   scripts/company-bank/lib/quant.mjs          computed quant generators
 *
 * Outputs
 *   data/company/bank.json                      SERVER-ONLY (contains answer keys)
 *   data/company/bank-report.json               stats + every fix applied
 *   lib/company/generated/researchSteps.ts      company hiring steps (client-safe)
 *
 * The build is deterministic: the same inputs always yield byte-identical ids,
 * so in-flight attempts keep resolving their questions across rebuilds.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import {
  docxParagraphs, parseMcqSection, parseWrittenSection, verifyKey, normBase, ANGLES,
} from './lib/source.mjs'
import { generateQuant } from './lib/quant.mjs'
import { parseResearch } from './lib/research.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const QUES = path.join(ROOT, 'Ques')
const SUPP = path.join(ROOT, 'data/company/supplements')
const OUT_BANK = path.join(ROOT, 'data/company/bank.json')
const OUT_REPORT = path.join(ROOT, 'data/company/bank-report.json')
const OUT_STEPS = path.join(ROOT, 'lib/company/generated/researchSteps.ts')

const SECTION_FILES = {
  s1: 'Section_1_Aptitude_and_Cognitive_Ability_450_Questions.docx',
  s2: 'Section_2_Programming_Fundamentals_250_Questions.docx',
  s3: 'Section_3_Data_Structures_and_Algorithms_700_Questions.docx',
  s4: 'Section_4_-_Computer_Science_Fundamentals.docx',
  s5: 'Section_5_-_SQL_and_Databases.docx',
  s6: 'Section_6_-_AI-Assisted_Coding_and_Debugging.docx',
  s7: 'Section_7_-_Web_Development_and_APIs.docx',
  s8: 'Section_8_-_LLD_and_OOP_Design.docx',
  s9: 'Section_9_-_System_Design_and_HLD.docx',
  s10: 'Section_10_-_Software_Engineering,_Testing_and_DevOps.docx',
  s11: 'Section_11_-_Technical_and_Behavioral_Interviews.docx',
}
const MCQ_SECTIONS = new Set(['s1', 's2', 's3'])
const CLAIMED = { s1: 450, s2: 250, s3: 700, s4: 350, s5: 200, s6: 200, s7: 200, s8: 150, s9: 150, s10: 150, s11: 200 }
const LEVELS = ['easy', 'medium', 'hard']

/* ------------------------------------------------------------------ */
/* Source calibration + explicit fixes                                  */
/* ------------------------------------------------------------------ */

// Section-1 topic → area, and content-based difficulty for the templated
// items (the document labels them by position: items 1-9 "Easy", 10-18
// "Medium", 19-30 "Hard" within every topic, whatever the content).
const S1_TOPICS = {
  'Percentages': ['quant', 'medium'],
  'Profit and Loss': ['quant', 'easy'],
  'Simple Interest': ['quant', 'easy'],
  'Ratio and Proportion': ['quant', 'easy'],
  'Averages': ['quant', 'medium'],
  'Time, Speed and Distance': ['quant', 'easy'],
  'Number Series': ['reasoning', 'easy'],
  'Letter Series': ['reasoning', 'easy'],
  'Coding-Decoding': ['reasoning', 'easy'],
  'Direction Sense': ['reasoning', 'easy'],
  'Syllogism': ['reasoning', 'medium'],
  'Synonyms': ['verbal', 'easy'],
  'Antonyms': ['verbal', 'easy'],
  'Grammar': ['verbal', 'easy'],
  'Reading Comprehension': ['verbal', 'easy'],
}
// Source S2/S3 items cycle identical text through all three bands; they are
// fundamentals, so they calibrate to "easy" except these conceptual ones.
const S23_MEDIUM = [
  /memory leak/i, /stack overflow/i, /immutable-string/i, /overriding/i, /overloading/i,
  /garbage collection/i, /topological/i, /dynamic programming/i, /backtracking/i,
  /greedy/i, /hash collision/i, /single responsibility/i, /abstraction\?/i,
]

const fixes = []

function applySourceFixes(sec, item) {
  if (sec !== 's1') return item
  let m
  // Wrong implied key: the stem asks for the SMALLER share but option A is the larger.
  if (item.topic === 'Ratio and Proportion' && (m = item.q.match(/ratio (\d+):(\d+)\. If their total is (\d+)/))) {
    const x = Number(m[1]), y = Number(m[2]), t = Number(m[3])
    if (x === y) {
      // Ill-posed: equal parts have no "smaller" quantity. Re-ask for each part.
      const each = t / 2
      const q = item.q.replace('what is the smaller quantity?', 'what is the value of each quantity?')
      const options = [String(each), String(t), String(t / 4), String(each + x)]
      fixes.push({ refs: item.refs, section: sec, kind: 'ill-posed-rephrased', before: item.q, after: q })
      return { ...item, q, options, answer: String(each) }
    }
    const smaller = String((t * Math.min(x, y)) / (x + y))
    if (item.options[0] !== smaller) {
      fixes.push({ refs: item.refs, section: sec, kind: 'wrong-implied-key', q: item.q, implied: item.options[0], correct: smaller })
      return { ...item, answer: smaller }
    }
  }
  // Duplicate distractors (P·T/100 coincides with P·R/100 when R = T).
  if (item.topic === 'Simple Interest' && new Set(item.options).size < 4) {
    const seen = new Set()
    const si = Number(item.options[0].replace(/[₹,]/g, ''))
    const options = item.options.map((o) => {
      if (!seen.has(o)) { seen.add(o); return o }
      return `₹${(si * 2).toFixed(2)}`
    })
    fixes.push({ refs: item.refs, section: sec, kind: 'duplicate-distractor', before: item.options, after: options })
    return { ...item, options }
  }
  // The keyed option merely restated a premise; key a genuine inference instead.
  if (item.topic === 'Syllogism' && item.options[0] === 'All analysts are readers') {
    const options = ['Some readers are analysts', ...item.options.slice(1)]
    fixes.push({ refs: item.refs, section: sec, kind: 'restated-premise-key', before: item.options[0], after: options[0] })
    return { ...item, options, answer: options[0] }
  }
  return item
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

const sha = (s) => crypto.createHash('sha1').update(s).digest('hex')
const norm = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim()
const bump = (d) => LEVELS[Math.min(2, LEVELS.indexOf(d) + 1)]
const easiest = (labels) => LEVELS.find((l) => labels.includes(l))

function mcqId(sec, q, answer, code = '') {
  return `${sec}-m${sha(`${sec}|${norm(q)}|${norm(code)}|${norm(answer)}`).slice(0, 10)}`
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function fail(msg) {
  console.error(`\n✖ ${msg}\n`)
  process.exit(1)
}

/* ------------------------------------------------------------------ */
/* Build                                                                */
/* ------------------------------------------------------------------ */

async function main() {
  const questions = []
  const report = { sections: {}, fixes, supplements: {}, generated: 0 }
  const rubricFile = path.join(SUPP, 'rubrics.json')
  const rubrics = fs.existsSync(rubricFile) ? readJson(rubricFile) : {}
  const missingRubrics = []

  for (const [sec, file] of Object.entries(SECTION_FILES)) {
    const paragraphs = await docxParagraphs(path.join(QUES, file))
    const stat = { file, claimed: CLAIMED[sec], parsed: 0, unique: 0, verifiedKeys: 0, reviewedKeys: 0 }

    if (MCQ_SECTIONS.has(sec)) {
      const raw = parseMcqSection(paragraphs)
      stat.parsed = raw.length
      const groups = new Map()
      for (const it of raw) {
        const key = `${norm(it.q)}||${it.options.map(norm).join('|')}`
        if (!groups.has(key)) groups.set(key, { ...it, refs: [], labels: [] })
        const g = groups.get(key)
        g.refs.push(it.n)
        g.labels.push(it.difficulty)
      }
      stat.unique = groups.size
      for (const g0 of groups.values()) {
        const verdict = verifyKey(g0)
        let g = { ...g0, answer: g0.options[0] }
        g = applySourceFixes(sec, g)
        if (verdict && !verdict.ok) {
          // Only acceptable if a documented fix re-keyed this item.
          const fixed = fixes.find((f) => f.refs === g0.refs && f.kind === 'wrong-implied-key')
          if (!fixed) fail(`Unverified key for ${sec} #${g0.refs[0]}: ${g0.q} (${verdict.reason})`)
        }
        if (verdict) stat.verifiedKeys++
        else stat.reviewedKeys++
        const labels = [...new Set(g.labels)]
        let area = 'concepts'
        let difficulty = easiest(labels)
        if (sec === 's1') {
          const t = S1_TOPICS[g.topic]
          if (!t) fail(`Unmapped Section-1 topic: ${g.topic}`)
          ;[area, difficulty] = t
        } else {
          difficulty = S23_MEDIUM.some((re) => re.test(g.q)) ? 'medium' : 'easy'
        }
        const sourceDifficulty = labels.length === 1 ? labels[0] : labels
        questions.push({
          id: mcqId(sec, g.q, g.answer),
          kind: 'mcq',
          section: sec,
          topic: g.topic,
          area,
          difficulty,
          // Templated Section-1 items differ only in their numbers, so a
          // template contributes at most one item to any single paper.
          group: sec === 's1' ? `s1:${g.topic}` : undefined,
          origin: 'ques',
          sourceRefs: g.refs,
          ...(JSON.stringify(sourceDifficulty) !== JSON.stringify(difficulty) ? { sourceDifficulty } : {}),
          q: g.q,
          options: g.options,
          answer: g.answer,
        })
      }
    } else {
      const raw = parseWrittenSection(paragraphs)
      stat.parsed = raw.length
      const groups = new Map()
      for (const it of raw) {
        const key = `${normBase(it.base)}||${it.angle || ''}`
        if (!groups.has(key)) groups.set(key, { ...it, refs: [], labels: [] })
        const g = groups.get(key)
        g.refs.push(it.n)
        g.labels.push(it.difficulty)
      }
      stat.unique = groups.size
      const secRubrics = rubrics[sec] || []
      for (const g of groups.values()) {
        const r = secRubrics.find((x) => normBase(x.base) === normBase(g.base))
        if (!r) { missingRubrics.push(`${sec}: ${g.base}`); continue }
        const angle = ANGLES.find((a) => a.id === g.angle)
        const base = r.base.trim()
        const q = angle ? `${base} ${angle.text}` : base
        const difficulty = angle ? bump(r.difficulty) : r.difficulty
        const labels = [...new Set(g.labels)]
        const sourceDifficulty = labels.length === 1 ? labels[0] : labels
        questions.push({
          id: `${sec}-w${sha(`${sec}|${normBase(base)}|${g.angle || ''}`).slice(0, 10)}`,
          kind: 'written',
          section: sec,
          topic: r.topic,
          area: r.area,
          difficulty,
          group: `${sec}:${sha(normBase(base)).slice(0, 8)}`,
          origin: 'ques',
          sourceRefs: g.refs,
          ...(JSON.stringify(sourceDifficulty) !== JSON.stringify(difficulty) ? { sourceDifficulty } : {}),
          q,
          base,
          ...(g.angle ? { angle: g.angle } : {}),
          minWords: r.minWords || (sec === 's11' ? 90 : 80),
          maxWords: r.maxWords || 450,
          rubric: r.rubric,
        })
      }
      stat.verifiedKeys = 0
    }
    report.sections[sec] = stat
  }
  if (missingRubrics.length) {
    fail(`Missing rubrics for ${missingRubrics.length} open-ended prompts:\n  ${missingRubrics.join('\n  ')}`)
  }

  /* ---------------- generated quant ---------------- */
  for (const g of generateQuant()) {
    questions.push({
      id: mcqId('s1', g.q, g.answer),
      kind: 'mcq', section: 's1', topic: g.topic, area: g.area, difficulty: g.difficulty,
      group: g.group, origin: 'generated', q: g.q, options: g.options, answer: g.answer,
      explanation: g.explanation,
    })
    report.generated++
  }

  /* ---------------- supplements ---------------- */
  const suppFiles = fs.existsSync(SUPP)
    ? fs.readdirSync(SUPP).filter((f) => /^s\d+.*\.json$/.test(f)).sort()
    : []
  for (const f of suppFiles) {
    const data = readJson(path.join(SUPP, f))
    const sec = data.section
    if (!SECTION_FILES[sec]) fail(`${f}: unknown section ${sec}`)
    let n = 0
    for (const it of data.mcq || []) {
      const code = it.code || ''
      questions.push({
        id: mcqId(sec, it.q, it.answer, code),
        kind: 'mcq', section: sec, topic: it.topic, area: it.area, difficulty: it.difficulty,
        group: it.group ? `${sec}:${it.group}` : undefined, origin: 'supplement',
        q: it.q, ...(code ? { code } : {}), options: it.options, answer: it.answer,
        ...(it.explanation ? { explanation: it.explanation } : {}),
      })
      n++
    }
    for (const it of data.written || []) {
      questions.push({
        id: `${sec}-w${sha(`${sec}|${normBase(it.q)}|supp`).slice(0, 10)}`,
        kind: 'written', section: sec, topic: it.topic, area: it.area, difficulty: it.difficulty,
        group: `${sec}:${it.group || sha(normBase(it.q)).slice(0, 8)}`, origin: 'supplement',
        q: it.q, base: it.q, minWords: it.minWords || 100, maxWords: it.maxWords || 400, rubric: it.rubric,
      })
      n++
    }
    for (const it of data.coding || []) {
      questions.push({
        id: `${sec}-c-${it.slug}`,
        kind: 'coding', section: sec, topic: it.topic, area: 'coding', difficulty: it.difficulty,
        group: `${sec}:code:${it.slug}`, origin: 'supplement',
        title: it.title, statement: it.statement, examples: it.examples, constraints: it.constraints,
        fn: it.fn, starter: it.starter, compare: it.compare || 'exact', tests: it.tests,
      })
      n++
    }
    report.supplements[f] = n
  }

  /* ---------------- validation ---------------- */
  const errors = []
  const ids = new Set()
  const stems = new Map()
  for (const q of questions) {
    if (!q.group) q.group = q.id
    if (ids.has(q.id)) errors.push(`duplicate id ${q.id} (${q.q || q.title})`)
    ids.add(q.id)
    if (!LEVELS.includes(q.difficulty)) errors.push(`${q.id}: bad difficulty ${q.difficulty}`)
    if (!q.topic || !q.area) errors.push(`${q.id}: missing topic/area`)
    if (q.kind === 'mcq') {
      if (!Array.isArray(q.options) || q.options.length !== 4) errors.push(`${q.id}: needs exactly 4 options`)
      else if (new Set(q.options.map(norm)).size !== 4) errors.push(`${q.id}: options are not distinct: ${q.options.join(' | ')}`)
      if (!q.options?.includes(q.answer)) errors.push(`${q.id}: answer "${q.answer}" is not an option`)
      if (/\((?:practice\s+)?variant\s+\d+\)|\(question\s+\d+\)/i.test(q.q)) errors.push(`${q.id}: generator artefact left in stem`)
      const key = `${q.section}|${norm(q.q)}|${norm(q.code || '')}`
      if (stems.has(key)) errors.push(`${q.id}: duplicate stem of ${stems.get(key)}: ${q.q}`)
      stems.set(key, q.id)
    }
    if (q.kind === 'written') {
      if (!Array.isArray(q.rubric) || q.rubric.length < 3) errors.push(`${q.id}: rubric needs ≥ 3 points`)
      for (const p of q.rubric || []) {
        if (!p.label || !Array.isArray(p.any) || !p.any.length) errors.push(`${q.id}: malformed rubric point`)
        if (p.any?.some((a) => a !== a.toLowerCase())) errors.push(`${q.id}: rubric phrases must be lower-case (${p.label})`)
      }
    }
    if (q.kind === 'coding') {
      if (!q.fn?.python || !q.fn?.javascript) errors.push(`${q.id}: missing function names`)
      if (!Array.isArray(q.tests) || q.tests.length < 4) errors.push(`${q.id}: needs ≥ 4 hidden tests`)
    }
  }
  if (errors.length) fail(`Bank validation failed (${errors.length}):\n  ${errors.slice(0, 60).join('\n  ')}`)

  /* ---------------- stats + output ---------------- */
  const bySection = {}
  for (const q of questions) {
    const s = (bySection[q.section] ||= { total: 0, mcq: 0, written: 0, coding: 0, ques: 0, supplement: 0, generated: 0, easy: 0, medium: 0, hard: 0, areas: {} })
    s.total++
    s[q.kind]++
    s[q.origin]++
    s[q.difficulty]++
    s.areas[q.area] = (s.areas[q.area] || 0) + 1
  }
  report.bank = bySection
  report.total = questions.length

  const payload = questions
    .slice()
    .sort((a, b) => a.section.localeCompare(b.section, 'en', { numeric: true }) || a.id.localeCompare(b.id))
  const version = sha(JSON.stringify(payload)).slice(0, 12)
  const bank = { version, generatedAt: 'deterministic', questions: payload }

  fs.mkdirSync(path.dirname(OUT_BANK), { recursive: true })
  fs.writeFileSync(OUT_BANK, JSON.stringify(bank) + '\n')
  report.version = version
  fs.writeFileSync(OUT_REPORT, JSON.stringify(report, null, 2) + '\n')

  /* ---------------- research steps ---------------- */
  const research = parseResearch(await docxParagraphs(path.join(QUES, '50 Companies Steps Assessment Research.docx')))
  fs.mkdirSync(path.dirname(OUT_STEPS), { recursive: true })
  fs.writeFileSync(
    OUT_STEPS,
    `// AUTO-GENERATED by scripts/company-bank/build.mjs from\n` +
      `// Ques/50 Companies Steps Assessment Research.docx — do not edit by hand.\n` +
      `/* eslint-disable */\n` +
      `import type { HiringStep, Priority } from '../types.ts'\n\n` +
      `/** The prioritised target list at the top of the research document. */\n` +
      `export const RESEARCH_TARGETS: Array<{ name: string; priority: Priority }> = ${JSON.stringify(research.targets, null, 2)}\n\n` +
      `/** Per-company hiring steps from the document's numbered company sections. */\n` +
      `export const RESEARCH_STEPS: Record<string, { no: number; subtitle: string | null; priority: Priority | null; steps: HiringStep[] }> = ${JSON.stringify(research.companies, null, 2)}\n`,
  )

  const line = (s, v) => console.log(`  ${s.padEnd(5)} ${v}`)
  console.log(`\n✔ Company bank ${version}: ${questions.length} questions`)
  for (const [sec, st] of Object.entries(report.sections)) {
    const b = bySection[sec]
    line(sec, `source claimed ${st.claimed} → parsed ${st.parsed} → unique ${st.unique} | bank ${b.total} (mcq ${b.mcq}, written ${b.written}, coding ${b.coding}; E/M/H ${b.easy}/${b.medium}/${b.hard})`)
  }
  console.log(`  fixes applied to source items: ${fixes.length}`)
  console.log(`  research: ${research.targets.length} targets, ${Object.keys(research.companies).length} documented companies\n`)
}

main().catch((e) => fail(e?.stack || String(e)))
