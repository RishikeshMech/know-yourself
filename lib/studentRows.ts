// Pure row mapping for the admin export — no Node/server imports so unit
// tests can load it directly and the browser could too if ever needed.
import type { AdminStudentRow } from './csv'

const num = (v: any): string => {
  if (v === null || v === undefined || v === '') return ''
  const n = Number(v)
  return Number.isFinite(n) ? String(n) : String(v)
}

const txt = (v: any): string => (v === null || v === undefined ? '' : String(v).trim())

/** Merge profile skills string + resume-parsed skills array, deduped (CSV "all skills"). */
export function mergeSkills(profileSkills: any, resumeParsed: any): { skills: string; resume_skills: string; all_skills: string } {
  const base = txt(profileSkills)
  let resume: string[] = []
  if (Array.isArray(resumeParsed?.skills)) {
    resume = resumeParsed.skills.map((s: any) => txt(s)).filter(Boolean)
  } else if (typeof resumeParsed === 'string') {
    resume = resumeParsed.split(',').map((s: any) => txt(s)).filter(Boolean)
  }
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of [...base.split(','), ...resume]) {
    const clean = txt(s)
    if (!clean) continue
    const key = clean.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(clean)
  }
  return { skills: base, resume_skills: resume.join(', '), all_skills: out.join(', ') }
}

/** Build a flat CSV row from profile fields + a `scores` object (assessment result). */
export function buildRow(input: {
  student_id: string
  email?: string
  role?: string
  profile: any
  scores?: any
  resume_score?: any
  resume_parsed?: any
  verifiable_hash?: any
  assessed_at?: any
  created_at?: any
}): AdminStudentRow {
  const p = input.profile || {}
  const s = input.scores
  const scoreObj = s?.scores && typeof s.scores === 'object' && typeof s.scores.total === 'number' ? s.scores : s
  const cognitive = scoreObj?.cognitive && typeof scoreObj.cognitive === 'object' ? scoreObj.cognitive : {}
  const behavioral = cognitive.behavioral || {}
  const detail = scoreObj?.detail || {}
  const eng = scoreObj?.english && typeof scoreObj.english === 'object' ? scoreObj.english : {}
  const sk = mergeSkills(p.skills ?? p.profile_skills, input.resume_parsed ?? p.resume_parsed)
  return {
    student_id: txt(input.student_id),
    email: txt(input.email ?? p.email),
    name: txt(p.full_name ?? p.name ?? input.email?.split('@')[0]),
    role: txt(input.role ?? p.role ?? 'student'),
    prn: txt(p.prn),
    phone: txt(p.phone ?? p.mobile),
    dob: txt(p.dob),
    gender: txt(p.gender),
    degree: txt(p.degree),
    college: txt(p.college),
    graduation_year: num(p.graduation_year),
    cgpa: num(p.cgpa),
    skills: sk.skills,
    resume_skills: sk.resume_skills,
    all_skills: sk.all_skills,
    linkedin_url: txt(p.linkedin_url),
    github_url: txt(p.github_url),
    created_at: txt(input.created_at ?? p.created_at ?? p.updated_at),
    resume_score: num(input.resume_score ?? p.resume_score),
    has_assessment: s ? 'Yes' : 'No',
    score: s ? num(scoreObj?.total ?? s.total) : '',
    grade: s ? txt(scoreObj?.grade ?? s.grade) : '',
    percentile: s ? num(scoreObj?.percentile ?? s.percentile) : '',
    english: eng ? num(eng.total) : '',
    english_listening: eng ? num(eng.listening) : '',
    english_speaking: eng ? num(eng.speaking) : '',
    english_reading: eng ? num(eng.reading) : '',
    english_writing: eng ? num(eng.writing) : '',
    problem_solving: num(scoreObj?.problem_solving),
    ai_debugging: num(scoreObj?.ai_debugging),
    ai_feature: num(scoreObj?.ai_feature),
    prompt_engineering: num(scoreObj?.prompt_engineering),
    cognitive: cognitive.total !== undefined ? num(cognitive.total) : '',
    cognitive_grid: cognitive.grid !== undefined ? num(cognitive.grid) : '',
    cognitive_logical: cognitive.logical !== undefined ? num(cognitive.logical) : '',
    behavioral_total: cognitive.behavioral_total !== undefined ? num(cognitive.behavioral_total) : '',
    teamwork: num(behavioral.teamwork),
    accountability: num(behavioral.accountability),
    adaptability: num(behavioral.adaptability),
    responsible_ai: num(behavioral.responsible_ai),
    decision_making: num(behavioral.decision_making),
    learning_mindset: num(behavioral.learning_mindset),
    listening_correct: num(detail.listeningCorrect),
    listening_total: num(detail.listeningTotal),
    reading_correct: num(detail.readingCorrect),
    reading_total: num(detail.readingTotal),
    problem_correct: num(detail.problemCorrect),
    problem_total: num(detail.problemTotal),
    logical_correct: num(detail.logicalCorrect),
    logical_total: num(detail.logicalTotal),
    verifiable_hash: txt(input.verifiable_hash ?? scoreObj?.verifiable_hash),
    assessed_at: txt(input.assessed_at ?? scoreObj?.submitted_at ?? s?.created_at),
  }
}

/** Sort newest-result first, then name. */
export function sortRows(rows: AdminStudentRow[]): AdminStudentRow[] {
  return [...rows].sort((a, b) => {
    const t = (b.assessed_at || '').localeCompare(a.assessed_at || '')
    if (t !== 0) return t
    return (a.name || '').localeCompare(b.name || '')
  })
}
