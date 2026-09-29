// Admin CSV utilities — pure functions + the shared row type. This module has
// NO Node/server imports so it is safe to use from both API routes (server)
// and the admin dashboard page (browser bundle). The dashboard generates the
// CSV from the rows it already fetched, so a download always matches the
// filters on screen exactly.

export interface AdminFeedbackEntry {
  id: string
  student_id: string
  email: string
  rating: string
  message: string
  session_id: string
  source: string
  created_at: string
}

import type { ScoreEntry } from './calibiScore.ts'
import type { AdminCompanyAttempt } from './adminAssessments.ts'
import type { AssessmentSkillEvidence } from './assessmentSkills.ts'
import { rollupAssessmentSkills } from './assessmentSkills.ts'
import { COMPANIES, COMPANY_TAGS } from './company/catalog.ts'

export interface AdminStudentRow {
  student_id: string
  email: string
  name: string
  role: string
  // Profile
  prn: string
  phone: string
  dob: string
  gender: string
  degree: string
  college: string
  graduation_year: string
  cgpa: string
  skills: string
  resume_skills: string
  /** Skill names and score averages derived from completed assessment results. */
  assessment_skills?: string
  /** Structured safe evidence used for per-assessment admin exports. */
  assessment_skill_evidence?: AssessmentSkillEvidence[]
  all_skills: string
  linkedin_url: string
  github_url: string
  created_at: string
  // Resume
  resume_score: string
  // Assessment
  has_assessment: string
  score: string
  grade: string
  percentile: string
  english: string
  english_listening: string
  english_speaking: string
  english_reading: string
  english_writing: string
  problem_solving: string
  ai_debugging: string
  ai_feature: string
  prompt_engineering: string
  cognitive: string
  cognitive_grid: string
  cognitive_logical: string
  behavioral_total: string
  teamwork: string
  accountability: string
  adaptability: string
  responsible_ai: string
  decision_making: string
  learning_mindset: string
  listening_correct: string
  listening_total: string
  reading_correct: string
  reading_total: string
  problem_correct: string
  problem_total: string
  logical_correct: string
  logical_total: string
  verifiable_hash: string
  assessed_at: string
  // CalibiAI Score = average of EVERY completed assessment (lib/calibiScore.ts)
  calibi_score: string
  calibi_grade: string
  assessments_taken: string
  tests_taken: string
  // Assessment 2 — Capgemini 2027 mock
  a2_score: string
  a2_grade: string
  a2_percentile: string
  a2_english: string
  a2_technical: string
  a2_debugging: string
  a2_ai_coding: string
  a2_cognitive: string
  a2_at: string
  // Company mock assessments
  company_taken: string
  company_in_progress: string
  company_avg: string
  company_best: string
  company_list: string
  // Category averages (percent)
  cat_platform: string
  cat_it_services: string
  cat_big_tech: string
  cat_product_startups: string
  cat_saas: string
  cat_bfsi: string
  cat_engineering: string
  /** Company slug → score (/100) of every completed company mock (per-company CSV columns). */
  company_scores?: Record<string, number>
  /** Per-assessment breakdown behind the CalibiAI Score (UI + JSON export). */
  assessments?: ScoreEntry[]
  /** Every company-mock attempt, including in-progress ones. */
  company_attempts?: AdminCompanyAttempt[]
  // Feedback the candidate gave about the assessment (latest submission)
  feedback_rating: string
  feedback_message: string
  feedback_at: string
  feedback_count: string
  /** Every submission, newest first; the table fields above are the latest one. */
  feedback_history?: AdminFeedbackEntry[]
}

export const CSV_COLUMNS: { key: keyof AdminStudentRow; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'prn', label: 'PRN' },
  { key: 'phone', label: 'Mobile Number' },
  { key: 'dob', label: 'Date of Birth' },
  { key: 'gender', label: 'Gender' },
  { key: 'degree', label: 'Degree' },
  { key: 'college', label: 'College' },
  { key: 'graduation_year', label: 'Graduation Year' },
  { key: 'cgpa', label: 'CGPA' },
  { key: 'skills', label: 'Profile Skills' },
  { key: 'resume_skills', label: 'Resume Skills' },
  { key: 'assessment_skills', label: 'Assessment Skills (mapped score)' },
  { key: 'all_skills', label: 'All Skills' },
  { key: 'linkedin_url', label: 'LinkedIn URL' },
  { key: 'github_url', label: 'GitHub URL' },
  { key: 'resume_score', label: 'Resume Score (/100)' },
  { key: 'calibi_score', label: 'CalibiAI Score (average of all assessments, /1000)' },
  { key: 'calibi_grade', label: 'CalibiAI Grade' },
  { key: 'assessments_taken', label: 'Assessments Completed' },
  { key: 'tests_taken', label: 'Assessments Taken [Category]' },
  { key: 'score', label: 'CalibiAI Assessment Score (/1000)' },
  { key: 'grade', label: 'Grade' },
  { key: 'percentile', label: 'Percentile' },
  { key: 'english', label: 'English (/200)' },
  { key: 'english_listening', label: 'English - Listening (/50)' },
  { key: 'english_speaking', label: 'English - Speaking (/50)' },
  { key: 'english_reading', label: 'English - Reading (/50)' },
  { key: 'english_writing', label: 'English - Writing (/50)' },
  { key: 'problem_solving', label: 'Problem Solving (/200)' },
  { key: 'ai_debugging', label: 'AI Debugging (/150)' },
  { key: 'ai_feature', label: 'AI Feature Dev (/150)' },
  { key: 'prompt_engineering', label: 'Prompt Engineering (/100)' },
  { key: 'cognitive', label: 'Cognitive (/200)' },
  { key: 'cognitive_grid', label: 'Cognitive - Grid (/30)' },
  { key: 'cognitive_logical', label: 'Cognitive - Logical (/70)' },
  { key: 'behavioral_total', label: 'Behavioural (/100)' },
  { key: 'teamwork', label: 'Trait - Teamwork' },
  { key: 'accountability', label: 'Trait - Accountability' },
  { key: 'adaptability', label: 'Trait - Adaptability' },
  { key: 'responsible_ai', label: 'Trait - Responsible AI' },
  { key: 'decision_making', label: 'Trait - Decision Making' },
  { key: 'learning_mindset', label: 'Trait - Learning Mindset' },
  { key: 'listening_correct', label: 'Listening Correct' },
  { key: 'listening_total', label: 'Listening Total' },
  { key: 'reading_correct', label: 'Reading Correct' },
  { key: 'reading_total', label: 'Reading Total' },
  { key: 'problem_correct', label: 'Problem Solving Correct' },
  { key: 'problem_total', label: 'Problem Solving Total' },
  { key: 'logical_correct', label: 'Logical Correct' },
  { key: 'logical_total', label: 'Logical Total' },
  { key: 'a2_score', label: 'Capgemini 2027 Mock Score (/1000)' },
  { key: 'a2_grade', label: 'Capgemini Mock Grade' },
  { key: 'a2_percentile', label: 'Capgemini Mock Percentile' },
  { key: 'a2_english', label: 'Capgemini - English (/200)' },
  { key: 'a2_technical', label: 'Capgemini - Technical (/250)' },
  { key: 'a2_debugging', label: 'Capgemini - Debugging (/200)' },
  { key: 'a2_ai_coding', label: 'Capgemini - AI-assisted Coding (/200)' },
  { key: 'a2_cognitive', label: 'Capgemini - Cognitive (/150)' },
  { key: 'a2_at', label: 'Capgemini Mock Date' },
  { key: 'company_taken', label: 'Company Mocks Completed' },
  { key: 'company_in_progress', label: 'Company Mocks In Progress' },
  { key: 'company_avg', label: 'Company Mocks Average (/100)' },
  { key: 'company_best', label: 'Best Company Result' },
  { key: 'company_list', label: 'Company Results (score, verdict)' },
  { key: 'cat_platform', label: 'Category Avg - Platform Assessments (%)' },
  ...COMPANY_TAGS.map((t) => ({ key: `cat_${t.id.replace(/-/g, '_')}` as keyof AdminStudentRow, label: `Category Avg - ${t.label} (%)` })),
  { key: 'feedback_rating', label: 'Feedback Rating (1-5)' },
  { key: 'feedback_message', label: 'Feedback Comment' },
  { key: 'feedback_at', label: 'Feedback Date' },
  { key: 'feedback_count', label: 'Feedback Submissions' },
  { key: 'verifiable_hash', label: 'Verifiable Hash' },
  { key: 'assessed_at', label: 'Assessment Date' },
]

function escapeCell(value: string): string {
  let v = String(value ?? '')
  // Guard against CSV injection (=, +, -, @ at the start of a cell).
  if (/^[=+\-@]/.test(v)) v = `'${v}`
  if (/[",\n\r]/.test(v)) v = `"${v.replace(/"/g, '""')}"`
  return v
}

/** One "Company - <name> (/100)" column per company mock, in plan order. */
export const COMPANY_CSV_COLUMNS: { slug: string; label: string }[] = COMPANIES.map((c) => ({ slug: c.slug, label: `Company - ${c.name} (/100)` }))

/**
 * Students CSV. With `companies` (default) it appends one score column per
 * company mock so company-wise results can be filtered/pivoted in Excel.
 */
export function rowsToCsv(rows: AdminStudentRow[], opts: { companies?: boolean } = {}): string {
  const withCompanies = opts.companies !== false
  const header = [...CSV_COLUMNS.map(c => c.label), ...(withCompanies ? COMPANY_CSV_COLUMNS.map(c => c.label) : [])].map(escapeCell).join(',')
  const body = rows.map(r => [
    ...CSV_COLUMNS.map(c => escapeCell(String((r as any)[c.key] ?? ''))),
    ...(withCompanies ? COMPANY_CSV_COLUMNS.map(c => {
      const v = r.company_scores?.[c.slug]
      return escapeCell(v === undefined || v === null ? '' : String(v))
    }) : []),
  ].join(','))
  // BOM so Excel opens UTF-8 (✓, names, etc.) correctly; CRLF per RFC 4180.
  return '\uFEFF' + [header, ...body].join('\r\n')
}

/** Generic CSV from a header + rows (same escaping/BOM rules). */
export function tableToCsv(header: readonly string[], rows: string[][]): string {
  return '\uFEFF' + [header.map(escapeCell).join(','), ...rows.map(r => r.map(v => escapeCell(String(v ?? ''))).join(','))].join('\r\n')
}

export function downloadFilename(scope: string, kind = 'students', ext = 'csv'): string {
  const date = new Date().toISOString().slice(0, 10)
  return `calibiai_${kind}_${scope}_${date}.${ext}`
}

/** Trigger a browser download from a CSV string (client-side). */
export function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
