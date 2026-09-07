import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { generateReportPdf, reportSections, aiTaskLabel, tierFor, num } from '../reportPdf.ts'

const logoDataUrl =
  'data:image/png;base64,' + readFileSync(join(process.cwd(), 'public', 'calibiai-logo.png')).toString('base64')

const richScores = {
  session_id: 'sess_demo123',
  total: 842, grade: 'A', percentile: 88.4, verifiable_hash: 'sha256:abcdef',
  submitted_at: '2026-09-06T10:11:55.315Z',
  english: { total: 168, listening: 45, speaking: 40, reading: 43, writing: 40, max: 200 },
  problem_solving: 170, ai_debugging: 120, ai_feature: 130, prompt_engineering: 84,
  cognitive: {
    total: 170, grid: 24, logical: 61, behavioral_total: 85, max: 200,
    behavioral: { teamwork: 80, accountability: 90, adaptability: 70, responsible_ai: 95, decision_making: 85, learning_mindset: 90 },
    traitLabels: { teamwork: 'Teamwork', accountability: 'Accountability', adaptability: 'Adaptability', responsible_ai: 'Responsible AI', decision_making: 'Decision Making', learning_mindset: 'Learning Mindset' },
  },
  detail: { listeningCorrect: 7, listeningTotal: 8, readingCorrect: 5, readingTotal: 6, problemCorrect: 9, problemTotal: 10, logicalCorrect: 6, logicalTotal: 7 },
  ai_results: {
    WRITING: { score: 82, summary: 'Well-structured essay.', improvements: ['Add real-world examples'] },
    AD1: { score: 60, summary: 'Found the pagination bug.', improvements: ['Check boundary inputs'] },
  },
}

const profile = {
  full_name: 'Priya Sharma', email: 'priya.sharma@college.edu.in', prn: '21CS1042',
  phone: '+91 98765 43210', dob: '2003-04-11', gender: 'Female',
  degree: 'B.Tech CSE', college: 'College of Engineering Pune', graduation_year: 2026, cgpa: 8.7,
  skills: 'Python, React, SQL, Docker',
  created_at: '2025-08-01T10:00:00.000Z',
}

test('generateReportPdf produces a multi-page branded PDF with the logo embedded', async () => {
  const doc = await generateReportPdf({ scores: richScores, profile, sample: false, logoDataUrl })
  const pages = doc.getNumberOfPages()
  assert.ok(pages >= 1, 'should have at least one page')
  assert.ok(pages <= 4, 'should stay within a few pages')
  const out = join(tmpdir(), `calibiai_test_${Date.now()}.pdf`)
  doc.save(out)
  const bytes = readFileSync(out)
  assert.ok(bytes.length > 50_000, 'should embed the logo image (not a text-only pdf)')
  assert.ok(bytes.subarray(0, 5).toString() === '%PDF-', 'should be a valid PDF')
})

test('generateReportPdf tolerates a minimal/partial payload', async () => {
  const doc = await generateReportPdf({
    scores: { total: 0, grade: 'D', percentile: 1, english: {}, cognitive: {} },
    profile: { full_name: 'New Student' },
    sample: false,
    logoDataUrl,
  })
  assert.ok(doc.getNumberOfPages() >= 1)
})

test('helpers stay stable for ReportModal', () => {
  assert.equal(num('12'), 12)
  assert.equal(reportSections(richScores).length, 6)
  assert.equal(aiTaskLabel('WRITING'), 'Writing Task')
  assert.equal(tierFor(842).label, 'Platinum')
  assert.equal(reportSections({ english: { total: 200 }, cognitive: { total: 200 } })[0].pct, 100)
})
