// Server-side resume analysis.
// Uses DeepSeek when DEEPSEEK_API_KEY is set; otherwise a deterministic
// rule-based engine so the flow always works. Text is extracted from the
// uploaded PDF/DOCX/TXT first so both engines analyse the REAL document —
// which is what enables name-mismatch and professionalism checks.

import mammoth from 'mammoth'
import { PDFParse } from 'pdf-parse'

export const MAX_RESUME_BYTES = 5 * 1024 * 1024

export interface ResumeFlag {
  level: 'error' | 'warn' | 'ok'
  text: string
}

export interface ResumeAnalysis {
  resume_score: number
  engine: 'deepseek' | 'heuristic'
  name_match: boolean
  detected_name: string
  flags: ResumeFlag[]
  professionalism: number
  summary: string
  experience: { years: number; entries: string[] }
  education: string[]
  skills: string[]
  contact: { email?: string; phone?: string; linkedin?: string; github?: string }
  feedback: { strengths: string[]; gaps: string[]; suggestions: string[] }
  parsed: { name: string; experience_years: number; projects: number; skills: string[] }
  word_count: number
}

export interface CandidateContext {
  full_name?: string
  email?: string
  degree?: string
  skills?: string
}

// ---------------------------------------------------------------------------
// Text extraction
// ---------------------------------------------------------------------------
export async function extractResumeText(buffer: Buffer, filename: string): Promise<string> {
  const name = filename.toLowerCase()
  if (name.endsWith('.pdf')) {
    const parser = new PDFParse({ data: new Uint8Array(buffer) })
    try {
      const result = await parser.getText()
      return ((result as any).pages || []).map((pg: any) => pg.text || '').join('\n').trim()
    } finally {
      await parser.destroy().catch(() => {})
    }
  }
  if (name.endsWith('.docx')) {
    const res = await mammoth.extractRawText({ buffer })
    return (res.value || '').trim()
  }
  if (name.endsWith('.txt') || name.endsWith('.md')) {
    return buffer.toString('utf8').trim()
  }
  throw new Error('Unsupported file type — upload a PDF, DOCX or TXT resume.')
}

// ---------------------------------------------------------------------------
// DeepSeek
// ---------------------------------------------------------------------------
const DEEPSEEK_BASE = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat'

const CONTRACT = `Respond ONLY with a JSON object of exactly this shape:
{
  "resume_score": <integer 0-100>,
  "professionalism": <integer 0-100>,
  "name_match": <true|false — does the resume belong to the candidate profile name provided?>,
  "detected_name": "<name as written on the resume, or '' if none>",
  "flags": [{"level": "error"|"warn"|"ok", "text": "<short reason>"}],
  "summary": "<3-5 sentence professional summary of this resume>",
  "experience": {"years": <number>, "entries": ["<role — company — period>", ...]},
  "education": ["<degree — institution>", ...],
  "skills": ["<skill>", ...],
  "contact": {"email": "", "phone": "", "linkedin": "", "github": ""},
  "strengths": ["<short bullet>", ...],
  "gaps": ["<short bullet>", ...],
  "suggestions": ["<actionable bullet>", ...]
}
Be a strict industry resume reviewer (ATS + recruiter lens). Flag name mismatches,
missing contact details, unprofessional language, vague bullets and missing
quantified impact. Do not inflate scores.`

async function callDeepSeek(text: string, ctx: CandidateContext): Promise<any | null> {
  const key = process.env.DEEPSEEK_API_KEY
  if (!key) return null
  try {
    const res = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: CONTRACT },
          {
            role: 'user',
            content: `Candidate profile (for name/skill cross-check):\n${JSON.stringify(ctx)}\n\nResume text:\n"""\n${text.slice(0, 9000)}\n"""`,
          },
        ],
      }),
    })
    if (!res.ok) {
      console.error('DeepSeek resume error', res.status, await res.text().catch(() => ''))
      return null
    }
    const data = await res.json()
    const content: string = data?.choices?.[0]?.message?.content
    return content ? JSON.parse(content) : null
  } catch (e) {
    console.error('DeepSeek resume call failed', e)
    return null
  }
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------
function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, Math.round(n)))
}

const SKILL_KEYWORDS = [
  'python', 'java', 'javascript', 'typescript', 'react', 'node', 'node.js', 'express',
  'sql', 'mysql', 'postgres', 'mongodb', 'docker', 'kubernetes', 'aws', 'git', 'github',
  'html', 'css', 'tailwind', 'next.js', 'nextjs', 'c++', 'c#', 'django', 'flask', 'spring',
  'machine learning', 'deep learning', 'data structures', 'algorithms', 'linux', 'excel',
  'figma', 'power bi', 'tableau', 'tensorflow', 'pandas', 'numpy', 'rest api', 'graphql',
]

const ACTION_VERBS = [
  'led', 'built', 'developed', 'designed', 'implemented', 'improved', 'created', 'launched',
  'optimized', 'optimised', 'automated', 'delivered', 'managed', 'reduced', 'increased',
  'achieved', 'scaled', 'migrated', 'deployed', 'trained',
]

function detectName(text: string): string {
  const labeled = text.match(/^(?:candidate\s+)?name\s*[:\-]\s*([A-Za-z][A-Za-z .'-]{2,40})/im)
  if (labeled) return labeled[1].trim()
  const firstLine = text.split(/\r?\n/).map((l) => l.trim()).find((l) =>
    l.length > 2 && l.length <= 48 &&
    !/[@\d]/.test(l) &&
    !/resume|curriculum|vitae|objective|summary|contact/i.test(l) &&
    /^[A-Z][a-zA-Z.'-]*(\s+[A-Z][a-zA-Z.'-]*){1,3}$/.test(l)
  )
  return firstLine || ''
}

export async function analyzeResumeText(rawText: string, ctx: CandidateContext): Promise<ResumeAnalysis> {
  const text = rawText.replace(/\s+\n/g, '\n')
  const lower = text.toLowerCase()
  const words = (text.match(/\S+/g) || []).length

  const ai = await callDeepSeek(text, ctx)
  if (ai) return normalizeAi(ai, text, words)

  // ---------------- heuristic engine ----------------
  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0]
  const phone = text.match(/(\+?\d[\d\s()-]{8,14}\d)/)?.[0]?.trim()
  const linkedin = text.match(/linkedin\.com\/(?:in|pub)\/[\w-]+/i)?.[0]
  const github = text.match(/github\.com\/[\w-]+/i)?.[0]

  const hasSection = (re: RegExp) => re.test(lower)
  const sections = {
    experience: hasSection(/experience|internship|employment/),
    education: hasSection(/education|academics/),
    skills: hasSection(/skills|technologies|stack/),
    projects: hasSection(/projects/),
  }

  const detected = detectName(text)
  const nameTokens = (ctx.full_name || '').toLowerCase().split(/[^a-z]+/).filter((t) => t.length >= 3)
  const matchedTokens = nameTokens.filter((t) => lower.includes(t))
  const name_match = nameTokens.length === 0 ? true : matchedTokens.length >= Math.max(1, Math.ceil(nameTokens.length / 2))

  const metrics = (text.match(/\d+(\.\d+)?\s*(%|percent|\bx\b|users|customers|ms|seconds?|minutes?|latency|revenue|requests|₹|\$|k\b)/gi) || []).length
  const verbs = ACTION_VERBS.filter((v) => new RegExp(`\\b${v}\\b`, 'i').test(text)).length
  const skills = SKILL_KEYWORDS.filter((s) => lower.includes(s))
  const slang = (text.match(/\b(u|ur|plz|thx|wanna|gonna|kinda|lol|omg|stuff like that)\b/gi) || []).length
  const capsWords = (text.match(/\b[A-Z]{4,}\b/g) || []).filter((w) => !/^[A-Z]{4,}$/.test(w) || true).length
  const years = Array.from(new Set((text.match(/20\d{2}/g) || []).map(Number))).sort((a, b) => a - b)
  const expSpan = years.length >= 2 ? Math.min(10, Math.max(0, years[years.length - 1] - years[0])) : 0
  const expEntries = (text.match(/20\d{2}\s*[-–—to]+\s*(20\d{2}|present|current)/gi) || []).length
  const projects = (text.match(/\bprojects?\b/gi) || []).length

  const flags: ResumeFlag[] = []
  if (nameTokens.length > 0 && !name_match) {
    flags.push({ level: 'error', text: `Name mismatch — resume appears to belong to “${detected || 'someone else'}”, but your profile says “${ctx.full_name}”. Upload your own resume.` })
  } else {
    flags.push({ level: 'ok', text: nameTokens.length ? `Name on the resume matches your profile (${ctx.full_name}).` : 'No profile name to cross-check against.' })
  }
  if (!email) flags.push({ level: 'warn', text: 'No email address found — recruiters cannot contact you.' })
  if (!phone) flags.push({ level: 'warn', text: 'No phone number found on the resume.' })
  if (!sections.experience) flags.push({ level: 'warn', text: 'No Experience/Internship section detected.' })
  if (!sections.skills) flags.push({ level: 'warn', text: 'No Skills section detected — ATS filters may skip you.' })
  if (words < 60) flags.push({ level: 'error', text: `Resume is far too short (${words} words) to be evaluated professionally.` })
  else if (words < 150) flags.push({ level: 'warn', text: `On the short side (${words} words) — expand with projects and impact.` })
  else if (words > 1200) flags.push({ level: 'warn', text: `Very long resume (${words} words) — aim for one page as a student.` })
  if (slang > 0) flags.push({ level: 'warn', text: 'Informal language detected (u, ur, plz, wanna…) — keep it professional.' })
  if (metrics === 0) flags.push({ level: 'warn', text: 'No quantified impact (%, numbers, metrics) found anywhere.' })
  if (flags.every((f) => f.level === 'ok')) flags.push({ level: 'ok', text: 'Contact details, sections and impact all present.' })

  const completeness = clamp(25 + Object.values(sections).filter(Boolean).length * 15 + (email ? 10 : 0) + (phone ? 5 : 0))
  const impact = clamp(20 + Math.min(40, metrics * 8) + Math.min(30, verbs * 5))
  const professionalism = clamp(
    90 - slang * 12 - (words < 60 ? 30 : 0) - (words > 1200 ? 10 : 0) - (capsWords > 12 ? 8 : 0) + (email && phone ? 5 : 0),
  )
  const presentation = clamp(40 + Math.min(30, skills.length * 3) + (sections.projects ? 15 : 0) + (linkedin || github ? 10 : 0))
  const nameScore = name_match ? 100 : 15
  const resume_score = clamp(completeness * 0.25 + impact * 0.25 + professionalism * 0.25 + presentation * 0.15 + nameScore * 0.1)

  const strengths: string[] = []
  if (sections.experience) strengths.push('Includes an experience/internship section')
  if (metrics > 0) strengths.push(`Uses quantified impact in ${metrics} place${metrics === 1 ? '' : 's'}`)
  if (skills.length >= 4) strengths.push(`Clear skills coverage (${skills.slice(0, 6).join(', ')}…)`)
  if (linkedin || github) strengths.push('Links a professional profile (LinkedIn/GitHub)')
  if (strengths.length === 0) strengths.push('A resume file was submitted for analysis')

  const gaps: string[] = []
  if (!name_match) gaps.push('Resume does not appear to belong to the candidate')
  if (!email || !phone) gaps.push('Missing contact details')
  if (!sections.experience) gaps.push('No experience or internship history visible')
  if (metrics === 0) gaps.push('No measurable results (numbers, %) in any bullet')
  if (verbs < 3) gaps.push('Bullets lack strong action verbs')
  if (!sections.projects) gaps.push('No projects section for a student profile')
  if (gaps.length === 0) gaps.push('Minor polish needed — see suggestions')

  const suggestions: string[] = []
  if (!name_match) suggestions.push('Replace this file with your own resume before proceeding.')
  suggestions.push('Start every bullet with a strong verb and end with a metric, e.g. “Reduced API latency by 30%”.')
  if (!sections.skills) suggestions.push('Add a dedicated Skills section with tools and languages.')
  if (!linkedin && !github) suggestions.push('Add LinkedIn and GitHub URLs so recruiters can verify your work.')
  suggestions.push('Keep it to one page with clear section headings (Experience, Education, Skills, Projects).')

  const summary =
    `${detected || 'The candidate'} presents a ${words}-word resume${sections.experience ? ' with an experience section' : ' lacking an experience section'}` +
    `${expSpan ? ` covering roughly ${expSpan} year(s)` : ''}${skills.length ? ` and a skill set including ${skills.slice(0, 4).join(', ')}` : ''}. ` +
    (name_match ? '' : `It does NOT match the profile name “${ctx.full_name}”, so it was flagged. `) +
    (metrics ? 'Quantified impact is present.' : 'Quantified impact is missing, which hurts ATS scoring.')

  return {
    resume_score,
    engine: 'heuristic',
    name_match,
    detected_name: detected,
    flags,
    professionalism,
    summary,
    experience: { years: expSpan, entries: text.match(/.{0,60}20\d{2}\s*[-–—to]+\s*(20\d{2}|present|current).{0,20}/gi)?.slice(0, 6) || [] },
    education: (ctx.degree ? [ctx.degree] : []).concat(text.match(/(?<![\w./])(?:B\.?Tech|M\.?Tech|B\.?Sc|M\.?Sc|B\.?Com|M\.?B\.?A|B\.?C\.?A|M\.?C\.?A)[^\n]{0,40}/gi)?.slice(0, 3) || []),
    skills,
    contact: { email, phone, linkedin, github },
    feedback: { strengths: strengths.slice(0, 5), gaps: gaps.slice(0, 5), suggestions: suggestions.slice(0, 5) },
    parsed: { name: detected || ctx.full_name || 'Candidate', experience_years: expSpan, projects, skills: skills.slice(0, 8) },
    word_count: words,
  }
}

function normalizeAi(ai: any, text: string, words: number): ResumeAnalysis {
  const flags: ResumeFlag[] = Array.isArray(ai?.flags)
    ? ai.flags.slice(0, 8).map((f: any) => ({
        level: f?.level === 'error' ? 'error' : f?.level === 'ok' ? 'ok' : 'warn',
        text: String(f?.text || ''),
      }))
    : []
  const skills = Array.isArray(ai?.skills) ? ai.skills.slice(0, 12).map(String) : []
  const exp = ai?.experience || {}
  return {
    resume_score: clamp(Number(ai?.resume_score ?? 50)),
    engine: 'deepseek',
    name_match: ai?.name_match !== false,
    detected_name: String(ai?.detected_name || detectName(text)),
    flags,
    professionalism: clamp(Number(ai?.professionalism ?? 60)),
    summary: String(ai?.summary || 'AI analysis complete.'),
    experience: { years: Number(exp?.years ?? 0), entries: Array.isArray(exp?.entries) ? exp.entries.slice(0, 6).map(String) : [] },
    education: Array.isArray(ai?.education) ? ai.education.slice(0, 4).map(String) : [],
    skills,
    contact: {
      email: ai?.contact?.email || undefined,
      phone: ai?.contact?.phone || undefined,
      linkedin: ai?.contact?.linkedin || undefined,
      github: ai?.contact?.github || undefined,
    },
    feedback: {
      strengths: Array.isArray(ai?.strengths) ? ai.strengths.slice(0, 5).map(String) : [],
      gaps: Array.isArray(ai?.gaps) ? ai.gaps.slice(0, 5).map(String) : [],
      suggestions: Array.isArray(ai?.suggestions) ? ai.suggestions.slice(0, 5).map(String) : [],
    },
    parsed: {
      name: String(ai?.detected_name || 'Candidate'),
      experience_years: Number(exp?.years ?? 0),
      projects: (text.match(/\bprojects?\b/gi) || []).length,
      skills: skills.slice(0, 8),
    },
    word_count: words,
  }
}
