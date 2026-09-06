/* ------------------------------------------------------------------ */
/* Shared CalibiAI report -> PDF builder (client-side, jsPDF)          */
/* Produces a well-formatted, ~2-page A4 report containing:            */
/*   1. Overall score summary (total / grade / percentile / tier)      */
/*   2. Full candidate profile (name, email, mobile, DOB, education,   */
/*      skills, links, session & verification details)                 */
/*   3. Section-wise score analysis with progress bars                 */
/*   4. English sub-skills, objective accuracy, behavioural traits     */
/*   5. AI feedback & "where you are lacking" improvement areas        */
/* Used by the result page, the student dashboard and the profile page */
/* (via the ReportModal pop-up) so every download looks identical.     */
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

type PdfInput = {
  scores: any
  profile?: any
  user?: any
  sample?: boolean
}

export async function generateReportPdf({ scores, profile = {}, user = {}, sample = false }: PdfInput) {
  const { default: JsPDF } = await import('jspdf')
  const doc = new JsPDF({ unit: 'mm', format: 'a4' })

  /* ------------------------------ palette ------------------------------ */
  const INK: [number, number, number] = [15, 23, 42]
  const SLATE: [number, number, number] = [71, 85, 105]
  const MUT: [number, number, number] = [148, 163, 184]
  const INDIGO: [number, number, number] = [79, 70, 229]
  const VIOLET: [number, number, number] = [139, 92, 246]
  const LINE: [number, number, number] = [226, 232, 240]
  const LIGHT: [number, number, number] = [241, 245, 249]
  const WHITE: [number, number, number] = [255, 255, 255]
  const AMBER: [number, number, number] = [245, 158, 11]
  const PAGE_W = 210
  const PAGE_H = 297
  const ML = 12                       // left margin
  const CW = PAGE_W - ML * 2          // content width = 186
  const BOTTOM = 280

  let page = 1

  /* --------------------------- helpers -------------------------------- */
  function band(doc: any) {
    doc.setFillColor(15, 23, 42)
    doc.rect(0, 0, PAGE_W, 20, 'F')
    doc.setFillColor(99, 102, 241)
    doc.rect(0, 19.2, PAGE_W, 0.8, 'F')
    doc.setTextColor(...WHITE)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.text('CALIBIAI', ML, 10.5)
    doc.setTextColor(165, 180, 252)
    doc.text('SCORE', ML + 23, 10.5)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...MUT)
    doc.text('Verified Talent Assessment · Global Employability Standard', ML + 36, 10.5)
    doc.text(`Page ${page}`, PAGE_W - ML, 10.5, { align: 'right' })
  }

  /** Ensure `space` mm is free below y — else start a new page. */
  function fit(doc: any, y: number, space: number): number {
    if (y + space <= BOTTOM) return y
    page += 1
    doc.addPage()
    band(doc)
    return 28
  }

  function heading(doc: any, text: string, y: number): number {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...INDIGO)
    doc.text(text.toUpperCase(), ML, y)
    doc.setDrawColor(...INDIGO)
    doc.setLineWidth(0.3)
    doc.line(ML + doc.getTextWidth(text.toUpperCase()) + 3, y - 1.2, PAGE_W - ML, y - 1.2)
    return y
  }

  function bar(doc: any, x: number, y: number, w: number, h: number, pct: number, color: [number, number, number]) {
    const p = Math.max(0, Math.min(100, num(pct)))
    doc.setFillColor(...LIGHT)
    doc.roundedRect(x, y, w, h, h / 2, h / 2, 'F')
    if (p > 0) {
      doc.setFillColor(...color)
      doc.roundedRect(x, y, Math.max(h, (w * p) / 100), h, h / 2, h / 2, 'F')
    }
  }

  /* ------------------------- header / metadata ------------------------ */
  doc.setProperties({ title: `CalibiAI Talent Report — ${profile?.full_name || user?.name || 'Student'}` })
  band(doc)

  const fullName = (profile?.full_name || user?.name || '—').trim()
  const email = (profile?.email || user?.email || '—').trim()
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
    return `${d}${age >= 0 && age < 120 ? `  (${age} yrs)` : ''}`
  }

  const total = num(scores?.total)
  const grade = scores?.grade || '—'
  const percentile = num(scores?.percentile)
  const tier = tierFor(total)
  const sessionId = scores?.session_id || '—'
  const hash = scores?.verifiable_hash || ''
  const dateLine = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

  /* ============================ PAGE 1 ================================ */
  let y = 30

  /* ---- hero score band ---- */
  doc.setFillColor(30, 27, 75)
  doc.roundedRect(ML, y, CW, 32, 4, 4, 'F')
  doc.setFillColor(99, 102, 241)
  doc.rect(ML, y, 2.4, 32, 'F')
  doc.setTextColor(...WHITE)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('CALIBIAI TALENT SCORE', ML + 8, y + 8)
  doc.setFontSize(26)
  doc.text(String(total), ML + 8, y + 24)
  doc.setFontSize(11)
  doc.setTextColor(165, 180, 252)
  doc.text('/ 1000', ML + 8 + doc.getTextWidth(String(total)) + 2, y + 24)
  // grade pill
  const gradeTxt = `GRADE ${grade}`
  doc.setFillColor(99, 102, 241)
  doc.roundedRect(120, y + 7, 26, 8, 4, 4, 'F')
  doc.setTextColor(...WHITE)
  doc.setFontSize(11)
  doc.text(gradeTxt, 133, y + 13.4, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...MUT)
  doc.text(`${percentile}th percentile`, 120, y + 21)
  doc.text(`Tier: ${tier.label}`, 120, y + 25.5)
  doc.setFontSize(7.5)
  doc.setTextColor(148, 163, 184)
  doc.text(`Report generated: ${dateLine}`, PAGE_W - ML - 8, y + 21, { align: 'right' })
  if (hash) doc.text(`Hash: ${String(hash).slice(0, 30)}`, PAGE_W - ML - 8, y + 25.5, { align: 'right' })
  y += 32 + 8

  /* ---- candidate profile ---- */
  y = heading(doc, 'Candidate Profile', y + 3)
  y += 3
  doc.setFont('helvetica', 'normal')
  const rows: [string, string][] = [
    ['Full name', fullName],
    ['Email', email],
    ['Mobile', fmtPhone(profile?.phone)],
    ['Date of birth', dobLine(profile?.dob)],
    ['Gender', (profile?.gender || '—') as string],
    ['Degree', (profile?.degree || '—') as string],
    ['College', (profile?.college || '—') as string],
    ['Class of', profile?.graduation_year ? String(profile.graduation_year) : '—'],
    ['CGPA', profile?.cgpa ? `${profile.cgpa} / 10` : '—'],
  ]
  const colW = (CW - 6) / 2
  const colX = [ML, ML + colW + 6]
  let cellY = y
  rows.forEach(([label, value], i) => {
    const cx = colX[i % 2]
    if (i % 2 === 0) {
      cellY = fit(doc, cellY, 10)
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.2)
    doc.setTextColor(...MUT)
    doc.text(label.toUpperCase(), cx, cellY)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.8)
    doc.setTextColor(...INK)
    doc.text(String(value), cx, cellY + 4.2)
    if (i % 2 === 1) cellY += 9
  })
  y = cellY + 4

  // skills / links full width
  const skillsTxt = String(profile?.skills || '').trim()
  if (skillsTxt) {
    y = fit(doc, y, 12)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.2)
    doc.setTextColor(...MUT)
    doc.text('SKILLS', ML, y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(...SLATE)
    const sk = doc.splitTextToSize(skillsTxt, CW)
    y += 3.6
    sk.slice(0, 2).forEach((line: string) => {
      y = fit(doc, y, 5)
      doc.text(line, ML, y + 3)
      y += 4.6
    })
    y += 2
  }
  const links = [profile?.linkedin_url ? `LinkedIn: ${profile.linkedin_url}` : '', profile?.github_url ? `GitHub: ${profile.github_url}` : ''].filter(Boolean)
  if (links.length) {
    y = fit(doc, y, 10)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.2)
    doc.setTextColor(...MUT)
    doc.text('LINKS', ML, y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(...INDIGO)
    y += 4
    links.slice(0, 2).forEach((l: string) => {
      y = fit(doc, y, 5)
      doc.textWithLink(String(l), ML, y, { url: String(l).replace(/^LinkedIn: |^GitHub: /, '') })
      y += 5
    })
    y += 2
  }
  // session meta strip
  y = fit(doc, y, 9)
  doc.setFillColor(...LIGHT)
  doc.roundedRect(ML, y, CW, 7.5, 2, 2, 'F')
  doc.setFontSize(7)
  doc.setTextColor(...SLATE)
  doc.text(`Session: ${sessionId}`, ML + 3, y + 5)
  doc.text(`Report: CalibiAI_Report_${sessionId}.pdf`, PAGE_W - ML - 3, y + 5, { align: 'right' })
  y += 12

  /* ---- section-wise breakdown ---- */
  y = heading(doc, 'Assessment Score · Section-wise Analysis', y + 2)
  y += 5
  const sections = reportSections(scores)
  sections.forEach(s => {
    const h = s.note ? 11 : 8.5
    y = fit(doc, y, h)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...INK)
    doc.text(s.label, ML, y)
    const right = `${s.score} / ${s.max}` + (s.max ? `   ·   ${s.pct}%` : '')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(...(s.max ? pctColor(s.pct) : SLATE))
    doc.text(right, PAGE_W - ML, y, { align: 'right' })
    bar(doc, ML, y + 1.6, CW, 1.8, s.pct, s.max ? pctColor(s.pct) : LINE)
    if (s.note) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.6)
      doc.setTextColor(...MUT)
      doc.text(s.note, ML, y + 5.2)
    }
    y += h
  })
  y += 4

  /* ============================ PAGE 2 ================================ */
  y = fit(doc, y, 30)
  if (page === 1) { page += 1; doc.addPage(); band(doc); y = 28 }
  y = heading(doc, 'Detailed Score Analysis', y + 3)
  y += 4

  /* --- English sub-skills --- */
  const eng = scores?.english || {}
  const engSubs = [
    ['Listening', eng.listening, 50], ['Speaking', eng.speaking, 50],
    ['Reading', eng.reading, 50], ['Writing', eng.writing, 50],
  ]
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...INK)
  doc.text('English sub-skills', ML, y)
  y += 2.5
  const boxW = (CW - 6) / 4
  engSubs.forEach(([label, v, m], i) => {
    const bx = ML + i * (boxW + 2)
    const pct = (num(v) / num(m)) * 100
    doc.setFillColor(...LIGHT)
    doc.roundedRect(bx, y, boxW, 13, 2.5, 2.5, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(...pctColor(pct))
    doc.text(String(num(v)), bx + boxW / 2, y + 6, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.4)
    doc.setTextColor(...SLATE)
    doc.text(String(label), bx + boxW / 2, y + 10.4, { align: 'center' })
  })
  y += 15

  /* --- objective accuracy --- */
  const detail = scores?.detail || {}
  const accRaw: [string, number, number][] = [
    ['Listening accuracy', num(detail.listeningCorrect), num(detail.listeningTotal)],
    ['Reading accuracy', num(detail.readingCorrect), num(detail.readingTotal)],
    ['Problem solving', num(detail.problemCorrect), num(detail.problemTotal)],
    ['Logical reasoning', num(detail.logicalCorrect), num(detail.logicalTotal)],
  ]
  const acc = accRaw.filter(([, , t]) => t > 0)
  if (acc.length) {
    y = fit(doc, y, 8)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...INK)
    doc.text('Objective accuracy', ML, y)
    y += 3
    acc.forEach(([label, c, t]) => {
      y = fit(doc, y, 7.2)
      const pct = Math.round((c / t) * 100)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(...SLATE)
      doc.text(label, ML, y)
      doc.text(`${c}/${t} · ${pct}%`, 118, y, { align: 'left' })
      bar(doc, 132, y - 1.4, 66, 1.6, pct, pctColor(pct))
      y += 7.2
    })
    y += 3
  }

  /* --- behavioural traits --- */
  const cog = scores?.cognitive || {}
  const traits = Object.entries(cog?.behavioral || {}) as [string, number][]
  if (traits.length) {
    y = fit(doc, y, 10)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...INK)
    doc.text('Behavioural profile', ML, y)
    y += 3.6
    const tColW = CW / 2
    traits.forEach(([k, v], i) => {
      const col = i % 2
      const row = Math.floor(i / 2)
      const tx = ML + col * tColW + (col ? 6 : 0)
      const ty = y + row * 7.2
      ty < BOTTOM ? null : (y = fit(doc, y, 7.2 * 3))
      const label = cog?.traitLabels?.[k] || String(k).replace(/_/g, ' ')
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.8)
      doc.setTextColor(...SLATE)
      doc.text(label, tx, ty)
      doc.text(String(num(v)), tx + tColW - 22, ty, { align: 'right' })
      bar(doc, tx + doc.getTextWidth(label) + 2, ty - 1.3, tColW - 30 - doc.getTextWidth(label), 1.5, num(v), pctColor(num(v)))
    })
    y += Math.ceil(traits.length / 2) * 7.2 + 2
  }

  /* --- AI feedback & improvement areas (where the candidate is lacking) --- */
  const aiEntries = Object.entries(scores?.ai_results || {}) as [string, any][]
  y = fit(doc, y, 12)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...INK)
  doc.text('AI feedback & areas to improve', ML, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.6)
  doc.setTextColor(...MUT)
  doc.text('Generated per task by the AI evaluation engine.', PAGE_W - ML, y, { align: 'right' })
  y += 3.4

  if (!aiEntries.length) {
    doc.setFontSize(8)
    doc.setTextColor(...SLATE)
    doc.text('No per-task AI feedback recorded for this attempt.', ML, y)
    y += 6
  }
  aiEntries.slice(0, 8).forEach(([key, r]) => {
    const label = aiTaskLabel(key)
    const score = num(r?.score)
    const note = String(r?.summary || '')
    const imps = Array.isArray(r?.improvements) ? r.improvements.slice(0, 2) : []
    // estimate needed height
    const estLines = imps.reduce((a: number, imp: string) => a + doc.splitTextToSize(String(imp), CW - 8).length, 0)
    y = fit(doc, y, 16 + estLines * 3.6)
    doc.setFillColor(...LIGHT)
    doc.roundedRect(ML, y - 4.4, CW, 1, 0.5, 0.5, 'F') // separator tick above
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.2)
    doc.setTextColor(...INK)
    doc.text(label, ML, y)
    doc.setFillColor(...pctColor(score))
    doc.roundedRect(150, y - 3.6, 48, 5, 2.5, 2.5, 'F')
    doc.setTextColor(...WHITE)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.text(`${score}/100`, 174, y - 0.1, { align: 'center' })
    y += 4.2
    if (note) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.3)
      doc.setTextColor(...SLATE)
      const wrapped = doc.splitTextToSize(note, CW - 54)
      wrapped.slice(0, 3).forEach((line: string) => {
        y = fit(doc, y, 4)
        doc.text(line, ML, y)
        y += 3.6
      })
    }
    imps.forEach((imp: string) => {
      doc.setTextColor(190, 18, 60)
      doc.setFontSize(7.3)
      const wrapped = doc.splitTextToSize(String(imp), CW - 8)
      wrapped.forEach((line: string, i2: number) => {
        y = fit(doc, y, 4)
        doc.text(i2 === 0 ? '•' : '', ML, y)
        doc.text(line, ML + 3, y)
        y += 3.6
      })
    })
    y += 2.2
  })

  /* --- footer --- */
  y = fit(doc, y, 14)
  doc.setDrawColor(...LINE)
  doc.setLineWidth(0.2)
  doc.line(ML, Math.min(y, BOTTOM - 10), PAGE_W - ML, Math.min(y, BOTTOM - 10))
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.6)
  doc.setTextColor(...MUT)
  doc.text('Verifiable CalibiAI credential · Shareable scorecard · Data encrypted at rest & in transit', ML, Math.min(y, BOTTOM - 10) + 4)
  doc.text('CALIBIAI SCORE — Global Employability Standard', PAGE_W - ML, Math.min(y, BOTTOM - 10) + 4, { align: 'right' })
  if (sample) {
    doc.setTextColor(...AMBER)
    doc.setFont('helvetica', 'bold')
    doc.text('SAMPLE REPORT — for preview purposes only', ML, Math.min(y, BOTTOM - 10) + 8.5)
  }

  return doc
}
