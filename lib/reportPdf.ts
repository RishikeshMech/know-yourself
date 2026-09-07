/* ------------------------------------------------------------------ */
/* CalibiAI report -> PDF builder (client-side, jsPDF)                 */
/*                                                                    */
/* A clean, branded, multi-page A4 report:                            */
/*   1. Header band on every page: CalibiAI logo + wordmark, report   */
/*      title, candidate name, page number                            */
/*   2. Page 1 — hero score card (total / grade / percentile / tier), */
/*      candidate profile card, skills chips, module performance bars */
/*   3. Page 2+ — English sub-skills tiles, objective accuracy,       */
/*      behavioural traits, AI feedback & improvement areas           */
/*   4. Footer on every page with the CalibiAI logo                   */
/*                                                                    */
/* Used by the student dashboard, ReportModal pop-up, profile page    */
/* and the sample report, so every download looks identical.          */
/* The logo is fetched from /icon-512.png at generation time (the     */
/* brand mark also used in the navbar) and embedded into the PDF.     */
/* ------------------------------------------------------------------ */
'use client'

export type SectionDatum = {
  key: string
  label: string
  score: number
  max: number
  pct: number
  note?: string
}

/** Normalise one section of the score payload. */
export function num(v: any): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Readable name + English/behavioural note for every scored section. */
export function reportSections(scores: any): SectionDatum[] {
  const eng = scores?.english || {}
  const cog = scores?.cognitive || {}
  const detail = scores?.detail || {}
  const sections: Omit<SectionDatum, 'pct'>[] = [
    {
      key: 'english', label: 'English Communication', score: num(eng.total), max: 200,
      note: `Listening ${num(eng.listening)} · Speaking ${num(eng.speaking)} · Reading ${num(eng.reading)} · Writing ${num(eng.writing)} (each /50)`,
    },
    {
      key: 'problem_solving', label: 'Problem Solving', score: num(scores?.problem_solving), max: 200,
      note: num(detail.problemTotal) ? `${num(detail.problemCorrect)} / ${num(detail.problemTotal)} problems solved correctly` : '',
    },
    { key: 'ai_debugging', label: 'AI Debugging', score: num(scores?.ai_debugging), max: 150, note: '3 bug-fix tasks · hidden tests + AI rubric' },
    { key: 'ai_feature', label: 'AI Feature Development', score: num(scores?.ai_feature), max: 150, note: 'Build task · functionality + design quality' },
    { key: 'prompt_engineering', label: 'Prompt Engineering', score: num(scores?.prompt_engineering), max: 100, note: '3 prompts · AI-rubric scored' },
    {
      key: 'cognitive', label: 'Cognitive Assessment', score: num(cog.total), max: 200,
      note: `Grid ${num(cog.grid)}/30 · Logical reasoning ${num(cog.logical)} · Behavioural ${num(cog.behavioral_total)}`,
    },
  ]
  return sections.map(s => ({ ...s, pct: s.max ? Math.round((s.score / s.max) * 100) : 0 }))
}

/** AI task key -> friendly label. */
export function aiTaskLabel(key: string): string {
  const map: Record<string, string> = {
    WRITING: 'Writing Task', SP_speaking: 'Speaking Task',
    AD1: 'Debugging — Pagination', AD2: 'Debugging — Race condition', AD3: 'Debugging — List mutation',
    AF1: 'Feature — Rate limiter', AF2: 'Feature — Retry logic',
    PE1: 'Prompt — Summary', PE2: 'Prompt — CSV dedup', PE3: 'Prompt — Email critique',
  }
  return map[key] || String(key).replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export function tierFor(total: number): { label: string; color: [number, number, number] } {
  const t = num(total)
  if (t >= 800) return { label: 'Platinum', color: [15, 118, 110] }
  if (t >= 600) return { label: 'Gold', color: [180, 83, 9] }
  if (t >= 300) return { label: 'Silver', color: [71, 85, 105] }
  return { label: 'Bronze', color: [180, 83, 9] }
}

/** Colour for a percentage — red when weak, amber mid, green/indigo strong. */
export function pctColor(pct: number): [number, number, number] {
  if (pct >= 75) return [16, 185, 129]      // emerald
  if (pct >= 60) return [99, 102, 241]      // indigo
  if (pct >= 40) return [245, 158, 11]      // amber
  return [244, 63, 94]                       // rose
}

/** Brand colours used across the report (site palette). */
const GRADE_COLOR: Record<string, [number, number, number]> = {
  S: [16, 185, 129], A: [99, 102, 241], B: [139, 92, 246], C: [245, 158, 11], D: [244, 63, 94],
}

type RGB = [number, number, number]

const ML = 13
const MR = 13
const CW = 210 - ML - MR          // 184 mm content width
const HEADER_H = 21                // dark brand band at the top of every page
const BOTTOM_LIMIT = 280           // content must end above this

// Palette
const INK: RGB = [15, 23, 42]
const SLATE: RGB = [71, 85, 105]
const MUT: RGB = [148, 163, 184]
const INDIGO: RGB = [79, 70, 229]
const VIOLET: RGB = [124, 58, 237]
const NAVY: RGB = [30, 27, 75]
const LINE: RGB = [226, 232, 240]
const LIGHT: RGB = [241, 245, 249]
const WHITE: RGB = [255, 255, 255]
const INDIGO_LIGHT: RGB = [224, 231, 255]
const INDIGO_TXT: RGB = [199, 210, 254]   // light indigo text on dark bands

type PdfInput = {
  scores: any
  profile?: any
  user?: any
  sample?: boolean
  /** Optional pre-loaded logo data URL (tests / SSR). Falls back to /icon-512.png. */
  logoDataUrl?: string | null
}

/** Load the brand mark as a PNG data URL (best effort, never throws). */
async function loadLogoDataUrl(provided?: string | null): Promise<string | null> {
  if (provided) return provided
  if (typeof window === 'undefined') return null
  try {
    const res = await fetch('/calibiai-logo.png', { cache: 'force-cache' })
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise<string | null>(resolve => {
      const fr = new FileReader()
      fr.onload = () => resolve(typeof fr.result === 'string' ? fr.result : null)
      fr.onerror = () => resolve(null)
      fr.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

export async function generateReportPdf({ scores, profile = {}, user = {}, sample = false, logoDataUrl }: PdfInput) {
  // Resolve the jsPDF constructor across module systems: webpack returns the
  // class as `default`, while Node's ESM/CJS interop wraps it one level deeper
  // (`default.default`). Accepting both keeps tests and the browser build happy.
  const mod: any = await import('jspdf')
  let JsPDF: any = mod?.default
  if (JsPDF && typeof JsPDF !== 'function' && typeof JsPDF.default === 'function') JsPDF = JsPDF.default
  if (typeof JsPDF !== 'function') JsPDF = mod?.JsPDF || mod
  const doc: any = new JsPDF({ unit: 'mm', format: 'a4' })
  const logo = await loadLogoDataUrl(logoDataUrl)

  const fullName = String(profile?.full_name || user?.name || 'Student').trim() || 'Student'
  const email = String(profile?.email || user?.email || '').trim()
  doc.setProperties({ title: `CalibiAI Talent Report — ${fullName}` })

  const dateLine = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  const fmtPhone = (p: any) => {
    const d = String(p || '').replace(/\D/g, '').slice(-10)
    return d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : (p || '—')
  }
  const dobLine = (d: any) => {
    if (!d) return '—'
    const b = new Date(d)
    if (isNaN(b.getTime())) return String(d)
    const now = new Date()
    let age = now.getFullYear() - b.getFullYear()
    const m = now.getMonth() - b.getMonth()
    if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--
    return `${String(d).slice(0, 10)}${age >= 0 && age < 120 ? `  (${age} yrs)` : ''}`
  }

  const total = num(scores?.total)
  const grade = String(scores?.grade || '—').slice(0, 1)
  const percentile = num(scores?.percentile)
  const tier = tierFor(total)
  const sessionId = String(scores?.session_id || '—')
  const hash = String(scores?.verifiable_hash || '')
  const gradeColor = GRADE_COLOR[grade] || INDIGO

  /* ---------------------------- helpers ----------------------------- */
  let page = 1

  /** Brand band drawn at the top of every page. */
  function header() {
    doc.setFillColor(...NAVY)
    doc.rect(0, 0, 210, HEADER_H, 'F')
    doc.setFillColor(...INDIGO)
    doc.rect(0, HEADER_H - 0.9, 210, 0.9, 'F')
    // Logo chip (white rounded square with the brand mark inside).
    doc.setFillColor(...WHITE)
    doc.roundedRect(ML, 4.2, 12.4, 12.4, 2.6, 2.6, 'F')
    if (logo) {
      try { doc.addImage(logo, 'PNG', ML + 1.4, 5.6, 9.6, 9.6, 'calibiai_logo') } catch { /* decorative */ }
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12.5)
    doc.setTextColor(...WHITE)
    doc.text('CALIBIAI', ML + 15.5, 9.2)
    doc.setTextColor(...INDIGO_TXT)
    doc.text('SCORE', ML + 15.5 + doc.getTextWidth('CALIBIAI') + 1.5, 9.2)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.4)
    doc.setTextColor(148, 163, 184)
    doc.text('Verified Employability Assessment & Scoring', ML + 15.5, 13.8)
    // Right side: report label + candidate + page
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(...INDIGO_TXT)
    doc.text('TALENT REPORT', 210 - MR, 7.2, { align: 'right' })
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.4)
    doc.setTextColor(...WHITE)
    doc.text(fullName.slice(0, 42), 210 - MR, 11.6, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.6)
    doc.setTextColor(148, 163, 184)
    doc.text(`Page ${page}`, 210 - MR, 15.6, { align: 'right' })
  }

  /** Start a new page and re-draw the header. */
  function newPage(): number {
    page += 1
    doc.addPage()
    header()
    return HEADER_H + 8
  }

  /** Ensure `space` mm fits below y; page-break when it doesn't. */
  function fit(y: number, space: number): number {
    if (y + space <= BOTTOM_LIMIT) return y
    return newPage()
  }

  /** Section heading with an indigo accent tick. */
  function sectionTitle(text: string, y: number, sub?: string): number {
    doc.setFillColor(...INDIGO)
    doc.roundedRect(ML, y - 3, 1.8, 4.2, 0.9, 0.9, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10.5)
    doc.setTextColor(...INK)
    doc.text(text, ML + 4, y)
    if (sub) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.8)
      doc.setTextColor(...MUT)
      doc.text(sub, ML + 4 + doc.getTextWidth(text) + 4, y - 0.6)
    }
    doc.setDrawColor(...LINE)
    doc.setLineWidth(0.3)
    const endX = ML + 4 + (sub ? doc.getTextWidth(text) + 4 + doc.getTextWidth(sub) : doc.getTextWidth(text)) + 3
    doc.line(endX, y - 1.1, 210 - MR, y - 1.1)
    return y + 2.6
  }

  /** Rounded progress bar. */
  function bar(x: number, y: number, w: number, h: number, pct: number, color: RGB) {
    const p = Math.max(0, Math.min(100, num(pct)))
    doc.setFillColor(...LIGHT)
    doc.roundedRect(x, y, w, h, h / 2, h / 2, 'F')
    if (p > 0) {
      doc.setFillColor(...color)
      doc.roundedRect(x, y, Math.max(h, (w * p) / 100), h, h / 2, h / 2, 'F')
    }
  }

  /** Skill chip: light indigo rounded pill; returns its width. */
  function chip(x: number, y: number, text: string): number {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.2)
    const w = doc.getTextWidth(text) + 5
    doc.setFillColor(...INDIGO_LIGHT)
    doc.roundedRect(x, y, w, 4.8, 2.4, 2.4, 'F')
    doc.setTextColor(...INDIGO)
    doc.text(text, x + w / 2, y + 3.4, { align: 'center' })
    return w
  }

  function labelText(text: string, x: number, y: number, color: RGB = MUT, size = 6) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(size)
    doc.setTextColor(...color)
    doc.text(String(text).toUpperCase(), x, y)
  }
  function valueText(text: string, x: number, y: number, color: RGB = INK, size = 9, style: 'bold' | 'normal' = 'bold') {
    doc.setFont('helvetica', style)
    doc.setFontSize(size)
    doc.setTextColor(...color)
    doc.text(String(text), x, y)
  }

  header()

  /* ============================ PAGE 1 ============================== */
  let y = HEADER_H + 7

  /* ---- hero score card ---- */
  y = fit(y, 50)
  const heroY = y
  const heroH = 50
  doc.setFillColor(...NAVY)
  doc.roundedRect(ML, heroY, CW, heroH, 6, 6, 'F')
  doc.setFillColor(...INDIGO)
  doc.rect(ML, heroY, 2.6, heroH, 'F')
  // left — score
  labelText('Calibiai Talent Score', ML + 11, heroY + 11, INDIGO_TXT, 8)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(44)
  doc.setTextColor(...WHITE)
  doc.text(String(total), ML + 11, heroY + 31)
  doc.setFontSize(13)
  doc.setTextColor(...INDIGO_TXT)
  doc.text('/ 1000', ML + 11 + doc.getTextWidth(String(total)) + 3, heroY + 31)
  // candidate details under the score
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11.5)
  doc.setTextColor(...WHITE)
  doc.text(fullName.length > 44 ? fullName.slice(0, 44) + '…' : fullName, ML + 11, heroY + 41.5)
  const collegeTxt = String([profile?.college, profile?.degree].filter(Boolean).join(' · ') || '—').slice(0, 80)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.6)
  doc.setTextColor(165, 180, 252)
  doc.text(collegeTxt, ML + 11, heroY + 46.6)
  // right — grade badge + mini stats
  const rx = 210 - MR - 6
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.4)
  doc.setTextColor(...INDIGO_TXT)
  doc.text('GRADE', rx - 20, heroY + 6.6, { align: 'center' })
  doc.setFillColor(...gradeColor)
  doc.roundedRect(rx - 44, heroY + 9.6, 44, 15, 7.5, 7.5, 'F')
  doc.setFontSize(19)
  doc.setTextColor(...WHITE)
  doc.text(grade, rx - 22, heroY + 20.8, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.4)
  doc.setTextColor(...INDIGO_TXT)
  doc.text(`Percentile   ${Number.isFinite(percentile) ? percentile.toFixed(0) : '—'}th`, rx, heroY + 31, { align: 'right' })
  doc.text(`Tier         ${tier.label}`, rx, heroY + 36.4, { align: 'right' })
  doc.text(`Report       ${dateLine}`, rx, heroY + 41.8, { align: 'right' })
  if (sample) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.6)
    doc.setTextColor(253, 230, 138)
    doc.text('SAMPLE — PREVIEW ONLY', rx, heroY + 47, { align: 'right' })
  }
  y = heroY + heroH + 6

  /* ---- session / verification strip ---- */
  y = fit(y, 9)
  doc.setFillColor(...LIGHT)
  doc.roundedRect(ML, y, CW, 8, 2.4, 2.4, 'F')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.8)
  doc.setTextColor(...SLATE)
  doc.text(`Session: ${sessionId.slice(0, 28)}`, ML + 4, y + 5.3)
  const assessedOn = String(scores?.submitted_at || dateLine).slice(0, 10)
  doc.text(`Assessed on: ${assessedOn}`, ML + 66, y + 5.3)
  if (hash) {
    doc.setTextColor(...INDIGO)
    doc.setFont('helvetica', 'bold')
    doc.text(`Verifiable hash: ${hash.slice(0, 44)}`, 210 - MR - 4, y + 5.3, { align: 'right' })
  }
  y += 8 + 7

  /* ---- candidate profile card ---- */
  y = sectionTitle('Candidate Profile', y, 'personal & academic details')
  y = fit(y, 4)
  const cardY = y
  const profileRows: [string, any][] = [
    ['PRN', profile?.prn || '—'],
    ['Email', email || '—'],
    ['Mobile', fmtPhone(profile?.phone)],
    ['Date of birth', dobLine(profile?.dob)],
    ['Gender', profile?.gender || '—'],
    ['Degree', profile?.degree || '—'],
    ['College', profile?.college || '—'],
    ['Graduation year', profile?.graduation_year ? String(profile.graduation_year) : '—'],
    ['CGPA', profile?.cgpa ? `${profile.cgpa} / 10` : '—'],
    ['Registered', String(profile?.created_at || profile?.updated_at || '').slice(0, 10) || '—'],
  ]
  const halfW = (CW - 14) / 2
  const xL = ML + 7
  const xR = ML + 7 + halfW + 14
  // Cell height driven by the longest value (at most two wrapped lines).
  let maxLines = 1
  for (const [, value] of profileRows) {
    maxLines = Math.max(maxLines, doc.splitTextToSize(String(value), halfW - 2).length)
  }
  const cellH = Math.min(12, Math.max(6.4, 5.2 + (maxLines - 1) * 3.6))
  const cardH = 8 + Math.ceil(profileRows.length / 2) * cellH
  doc.setFillColor(250, 250, 252)
  doc.setDrawColor(...LINE)
  doc.setLineWidth(0.3)
  doc.roundedRect(ML, cardY, CW, cardH, 5, 5, 'FD')
  profileRows.forEach(([label, value], i) => {
    const col = i % 2
    const row = Math.floor(i / 2)
    const cy = cardY + 6.5 + row * cellH
    const cx = col === 0 ? xL : xR
    labelText(label, cx, cy)
    const lines = doc.splitTextToSize(String(value), halfW - 2).slice(0, 2)
    lines.forEach((line: string, li: number) => valueText(line, cx, cy + 3.4 + li * 3.6, INK, 8.6))
  })
  y = cardY + cardH + 8

  /* ---- skills chips ---- */
  const skillsTxt = String(profile?.skills || '').trim()
  if (skillsTxt) {
    const skills = skillsTxt.split(',').map(s => s.trim()).filter(Boolean).slice(0, 26)
    y = sectionTitle('Skills', y, 'self-reported on profile')
    y = fit(y, 8)
    y += 4.6
    let sx = ML
    let sy = y
    for (const skill of skills) {
      const w = chip(sx, sy, skill)
      sx += w + 2
      if (sx + 16 > 210 - MR) {
        sx = ML
        sy += 6.6
      }
    }
    y = sy + 5 + 6
  }

  /* ---- module performance ---- */
  y = sectionTitle('Section-wise Analysis', y, 'six modules on the 1000-point scale')
  y = fit(y, 4)
  y += 5
  const sections = reportSections(scores)
  for (const s of sections) {
    y = fit(y, 11.5)
    valueText(s.label, ML, y, INK, 9.2)
    const scoreTxt = `${s.score} / ${s.max}` + (s.max ? `    ·   ${s.pct}%` : '')
    valueText(scoreTxt, 210 - MR, y, s.max ? pctColor(s.pct) : SLATE, 8.4)
    bar(ML, y + 2.2, CW, 2.6, s.pct, s.max ? pctColor(s.pct) : INDIGO)
    if (s.note) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.4)
      doc.setTextColor(...MUT)
      doc.text(String(s.note).slice(0, 150), ML, y + 8)
    }
    y += s.note ? 11 : 8.4
  }
  y += 6

  /* ============================ PAGE 2+ ============================= */
  y = fit(y, 6)
  y = sectionTitle('Detailed Score Analysis', y, 'sub-skills · accuracy · traits')
  y += 6

  /* ---- English sub-skills tiles ---- */
  const eng = scores?.english || {}
  const engSubs: [string, any, any][] = [
    ['Listening', eng.listening, 50], ['Speaking', eng.speaking, 50],
    ['Reading', eng.reading, 50], ['Writing', eng.writing, 50],
  ]
  y = fit(y, 17)
  const boxW = (CW - 6) / 4
  engSubs.forEach(([label, v, m], i) => {
    const bx = ML + i * (boxW + 2)
    const pct = m ? (num(v) / num(m)) * 100 : 0
    doc.setFillColor(...LIGHT)
    doc.roundedRect(bx, y, boxW, 16, 3.5, 3.5, 'F')
    const big = String(num(v))
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(15)
    doc.setTextColor(...pctColor(pct))
    doc.text(big, bx + boxW / 2 - doc.getTextWidth(big) / 2 - 4, y + 8)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6)
    doc.setTextColor(...MUT)
    doc.text(`/ ${num(m)}`, bx + boxW / 2 + 2, y + 6.2)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.8)
    doc.setTextColor(...SLATE)
    doc.text(String(label), bx + boxW / 2, y + 12.8, { align: 'center' })
  })
  y += 16 + 8

  /* ---- objective accuracy ---- */
  const detail = scores?.detail || {}
  const accRaw: [string, number, number][] = [
    ['Listening accuracy', num(detail.listeningCorrect), num(detail.listeningTotal)],
    ['Reading accuracy', num(detail.readingCorrect), num(detail.readingTotal)],
    ['Problem solving', num(detail.problemCorrect), num(detail.problemTotal)],
    ['Logical reasoning', num(detail.logicalCorrect), num(detail.logicalTotal)],
  ]
  const acc = accRaw.filter(([, , t]) => t > 0)
  if (acc.length) {
    y = fit(y, 6)
    y = sectionTitle('Objective Accuracy', y, 'correct answers in MCQ sections')
    y += 6
    acc.forEach(([label, c, t]) => {
      y = fit(y, 7)
      const pct = Math.round((c / t) * 100)
      valueText(label, ML, y, SLATE, 8, 'normal')
      valueText(`${c}/${t} correct · ${pct}%`, ML + 64, y, pctColor(pct), 8)
      bar(ML + 92, y - 1.5, 210 - MR - (ML + 92), 2, pct, pctColor(pct))
      y += 8
    })
    y += 4
  }

  /* ---- behavioural traits ---- */
  const cog = scores?.cognitive || {}
  const traits = Object.entries(cog?.behavioral || {}) as [string, number][]
  if (traits.length) {
    y = fit(y, 6)
    y = sectionTitle('Behavioural Profile', y, 'six workplace traits · each /100')
    y += 6.5
    const tColW = (CW - 8) / 2
    const rows2 = Math.ceil(traits.length / 2)
    y = fit(y, rows2 * 8.6)
    traits.forEach(([k, v], i) => {
      const col = i % 2
      const row = Math.floor(i / 2)
      const tx = ML + col * (tColW + 8)
      const ty = y + row * 8.6
      const label = String(cog?.traitLabels?.[k] || String(k).replace(/_/g, ' ')).slice(0, 24)
      valueText(label, tx, ty, SLATE, 7.8, 'normal')
      valueText(String(num(v)), tx + tColW - 10, ty, pctColor(num(v)), 8)
      bar(tx + 32, ty - 1.5, tColW - 44, 1.8, num(v), pctColor(num(v)))
    })
    y += rows2 * 8.6 + 5
  }

  /* ---- AI feedback & improvement areas ---- */
  const aiEntries = Object.entries(scores?.ai_results || {}) as [string, any][]
  if (aiEntries.length) {
    y = fit(y, 6)
    y = sectionTitle('AI Feedback & Areas to Improve', y, 'generated per task by the AI evaluation engine')
    y += 7
    aiEntries.slice(0, 8).forEach(([key, r]) => {
      const label = aiTaskLabel(key)
      const score = num(r?.score)
      const note = String(r?.summary || '')
      const noteLines = note ? doc.splitTextToSize(note, CW - 14).slice(0, 3) : []
      const cardH = 10.5 + noteLines.length * 3.4 + (noteLines.length ? 2 : 0)
      y = fit(y, cardH)
      doc.setFillColor(...LIGHT)
      doc.roundedRect(ML, y, CW, cardH, 4, 4, 'F')
      doc.setFillColor(...INDIGO)
      doc.roundedRect(ML, y, 2.2, cardH, 4, 4, 'F')
      doc.rect(ML, y, 2.2, cardH - 4, 'F')
      valueText(label, ML + 7, y + 5, INK, 8.6)
      doc.setFillColor(...pctColor(score))
      doc.roundedRect(210 - MR - 24, y + 1.8, 24, 6, 3, 3, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(6.6)
      doc.setTextColor(...WHITE)
      doc.text(`${score}/100`, 210 - MR - 12, y + 6, { align: 'center' })
      let ny = y + 6.8
      noteLines.forEach((line: string) => {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(6.6)
        doc.setTextColor(...SLATE)
        doc.text(line, ML + 7, ny)
        ny += 3.4
      })
      y += cardH + 3.5
    })
    y += 3
    /* improvement bullets */
    const imps: string[] = []
    aiEntries.slice(0, 8).forEach(([, r]) => {
      if (Array.isArray(r?.improvements)) imps.push(...r.improvements.map(String))
    })
    const uniqImps = [...new Set(imps)].slice(0, 6)
    if (uniqImps.length) {
      y = fit(y, 6)
      valueText('Suggested improvements', ML, y + 2, INK, 9)
      y += 5
      uniqImps.forEach(imp => {
        const lines = doc.splitTextToSize(String(imp), CW - 10).slice(0, 2)
        lines.forEach((line: string) => {
          y = fit(y, 5)
          doc.setFillColor(...VIOLET)
          doc.circle(ML + 1.3, y - 1.2, 0.8, 'F')
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(7.4)
          doc.setTextColor(...SLATE)
          doc.text(String(line), ML + 4.5, y)
          y += 4.6
        })
      })
    }
  }

  /* ---- closing blurb ---- */
  y = fit(y, 18)
  doc.setDrawColor(...LINE)
  doc.setLineWidth(0.3)
  doc.line(ML, y, 210 - MR, y)
  y += 5.5
  valueText('What is the CalibiAI Score?', ML, y, INK, 8.4)
  y += 3.8
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...SLATE)
  const blurb = 'A 1000-point unified, verifiable measure of employability — English communication, problem solving, AI debugging, AI feature development, prompt engineering and cognitive/behavioural traits, assessed through a supervised 120-minute exam. Every report carries a tamper-evident verifiable hash.'
  const blurbLines = doc.splitTextToSize(blurb, CW)
  blurbLines.slice(0, 5).forEach((line: string) => {
    y = fit(y, 4.4)
    doc.text(line, ML, y)
    y += 4.3
  })

  /* ============================ footers ============================= */
  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setDrawColor(...LINE)
    doc.setLineWidth(0.25)
    doc.line(ML, 286.5, 210 - MR, 286.5)
    if (logo) {
      try { doc.addImage(logo, 'PNG', ML, 288.4, 5.2, 5.2, 'calibiai_logo') } catch { /* decorative */ }
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.4)
    doc.setTextColor(...SLATE)
    doc.text('CALIBIAI SCORE', ML + 7.5, 291.8)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6)
    doc.setTextColor(...MUT)
    doc.text('Verified Employability Assessment · calibiai.com', ML + 7.5, 295.2)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.4)
    doc.setTextColor(...MUT)
    doc.text(`Page ${i} of ${totalPages}`, 210 - MR, 291.8, { align: 'right' })
    if (sample) {
      doc.setTextColor(180, 83, 9)
      doc.setFont('helvetica', 'bold')
      doc.text('SAMPLE REPORT — FOR PREVIEW ONLY', 210 - MR, 295.2, { align: 'right' })
    }
  }
  doc.setPage(totalPages)

  return doc
}
