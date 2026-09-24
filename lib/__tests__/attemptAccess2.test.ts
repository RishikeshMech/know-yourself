import test from 'node:test'
import assert from 'node:assert/strict'

import {
  resolveInstructions2Redirect,
  hasCompletedAssessment1,
  hasCompletedAssessment2,
  SCORES_KEY,
  SESSION_KEY,
  SCORES2_KEY,
  SESSION2_KEY,
} from '../attemptAccess2.ts'
import { AFTER_ASSESSMENT_ROUTE } from '../nextStep.ts'

/** localStorage stand-in — the resolver only needs getItem. */
function store(entries: Record<string, string>) {
  return (key: string) => (key in entries ? entries[key] : null)
}

const session = (status: string) =>
  JSON.stringify({ id: 'sess_1', status, expires_at: new Date(Date.now() + 3600_000).toISOString() })

test('a first-time user is sent to assessment 1 instead of the second test', () => {
  assert.equal(resolveInstructions2Redirect(store({})), '/instructions')
})

test('assessment 2 stays locked while assessment 1 is only in progress', () => {
  assert.equal(
    resolveInstructions2Redirect(store({ [SESSION_KEY]: session('in_progress') })),
    '/instructions',
  )
})

test('finishing assessment 1 unlocks the assessment-2 instructions', () => {
  assert.equal(resolveInstructions2Redirect(store({ [SCORES_KEY]: '{"total":812}' })), null)
  assert.equal(resolveInstructions2Redirect(store({ [SESSION_KEY]: session('submitted') })), null)
  // An auto-submitted (expired) first attempt also counts as completed.
  assert.equal(resolveInstructions2Redirect(store({ [SESSION_KEY]: session('expired') })), null)
})

test('an existing assessment-2 score sends the visitor to the dashboard', () => {
  assert.equal(
    resolveInstructions2Redirect(store({ [SCORES_KEY]: '{"total":812}', [SCORES2_KEY]: '{"total":700}' })),
    AFTER_ASSESSMENT_ROUTE,
  )
})

test('a submitted assessment-2 session also blocks a second attempt', () => {
  assert.equal(
    resolveInstructions2Redirect(store({ [SCORES_KEY]: '{"total":812}', [SESSION2_KEY]: session('submitted') })),
    AFTER_ASSESSMENT_ROUTE,
  )
})

test('an in-progress assessment-2 session returns the candidate to the running timer', () => {
  assert.equal(
    resolveInstructions2Redirect(store({ [SCORES_KEY]: '{"total":812}', [SESSION2_KEY]: session('in_progress') })),
    '/assessment2',
  )
})

test('an assessment-2 score wins over an in-progress assessment-2 session', () => {
  assert.equal(
    resolveInstructions2Redirect(
      store({ [SCORES_KEY]: '{"total":812}', [SCORES2_KEY]: '{"total":640}', [SESSION2_KEY]: session('in_progress') }),
    ),
    AFTER_ASSESSMENT_ROUTE,
  )
})

test('corrupt session values are ignored rather than throwing', () => {
  assert.equal(resolveInstructions2Redirect(store({ [SESSION_KEY]: '{not json' })), '/instructions')
  assert.equal(
    resolveInstructions2Redirect(store({ [SCORES_KEY]: '{"total":1}', [SESSION2_KEY]: '{not json' })),
    null,
  )
})

test('a throwing reader degrades to "stay put" rather than crashing the page', () => {
  const boom = () => { throw new Error('storage disabled') }
  assert.equal(resolveInstructions2Redirect(boom), null)
})

test('completion helpers read both the score and the session status', () => {
  assert.equal(hasCompletedAssessment1(store({})), false)
  assert.equal(hasCompletedAssessment1(store({ [SCORES_KEY]: '{}' })), true)
  assert.equal(hasCompletedAssessment1(store({ [SESSION_KEY]: session('in_progress') })), false)
  assert.equal(hasCompletedAssessment1(store({ [SESSION_KEY]: session('submitted') })), true)

  assert.equal(hasCompletedAssessment2(store({})), false)
  assert.equal(hasCompletedAssessment2(store({ [SCORES2_KEY]: '{}' })), true)
  assert.equal(hasCompletedAssessment2(store({ [SESSION2_KEY]: session('expired') })), true)
})
