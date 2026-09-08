import test from 'node:test'
import assert from 'node:assert/strict'

import { flattenAssessmentResult } from '../resultShape.ts'

test('flattens a stored result row into the computeScores UI/PDF shape', () => {
  const row = {
    session_id: 'sess_abc',
    scores: {
      english: { listening: 19, speaking: 0, reading: 17, writing: 0, total: 36, max: 200 },
      problem_solving: 20,
      ai_debugging: 43,
      ai_feature: 132,
      prompt_engineering: 0,
      cognitive: { total: 101, max: 200 },
      detail: { listeningCorrect: 3, listeningTotal: 8 },
      ai_results: { AD1: { score: 85 } },
      // A stale/misleading `total` nested under scores must NOT win.
      total: 1000,
    },
    total: 332,
    grade: 'D',
    percentile: 55,
    verifiable_hash: 'sha256:abc',
    ai_feedback: { WRITING: { score: 88 } },
  }

  const flat = flattenAssessmentResult(row)

  // The top-level column is authoritative — the dashboard and the PDF both read
  // this, so they can never disagree.
  assert.equal(flat.total, 332)
  assert.equal(flat.grade, 'D')
  assert.equal(flat.percentile, 55)
  assert.equal(flat.verifiable_hash, 'sha256:abc')
  assert.equal(flat.session_id, 'sess_abc')
  // Sections come from the nested scores…
  assert.equal(flat.english.total, 36)
  assert.equal(flat.cognitive.total, 101)
  assert.equal(flat.detail.listeningTotal, 8)
  // …and AI feedback comes from the top-level ai_feedback column.
  assert.equal(flat.ai_results.WRITING.score, 88)
})

test('returns null for an absent result so callers clear stale cached scores', () => {
  assert.equal(flattenAssessmentResult(null), null)
  assert.equal(flattenAssessmentResult(undefined), null)
  assert.equal(flattenAssessmentResult({}), null)
})

test('tolerates a non-object scores column', () => {
  const flat = flattenAssessmentResult({
    session_id: 'sess_abc',
    scores: 'not-an-object',
    total: 40,
    grade: 'D',
    percentile: 37,
    verifiable_hash: '',
    ai_feedback: { WRITING: { score: 12 } },
  })
  assert.equal(flat.total, 40)
  assert.equal(flat.grade, 'D')
  // Missing sections flatten to `undefined` so `num()`/`reportSections()` render 0.
  assert.equal(flat.english, undefined)
  // AI feedback still comes from the top-level column.
  assert.equal(flat.ai_results.WRITING.score, 12)
})
