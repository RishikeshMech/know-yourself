import test from 'node:test'
import assert from 'node:assert/strict'

import {
  resolveInstructionsRedirect,
  SCORES_KEY,
  SESSION_KEY,
} from '../attemptAccess.ts'
import { AFTER_ASSESSMENT_ROUTE } from '../nextStep.ts'

/** localStorage stand-in — `resolveInstructionsRedirect` only needs getItem. */
function store(entries: Record<string, string>) {
  return (key: string) => (key in entries ? entries[key] : null)
}

const session = (status: string) =>
  JSON.stringify({ id: 'sess_1', status, expires_at: new Date(Date.now() + 3600_000).toISOString() })

test('a first-time visitor stays on /instructions', () => {
  assert.equal(resolveInstructionsRedirect(store({})), null)
})

test('an existing local score sends the visitor to the student dashboard', () => {
  assert.equal(resolveInstructionsRedirect(store({ [SCORES_KEY]: '{"total":812}' })), AFTER_ASSESSMENT_ROUTE)
  assert.equal(resolveInstructionsRedirect(store({ [SCORES_KEY]: '{"total":812}' })), '/dashboard/student')
})

test('a submitted or expired session sends the visitor to the student dashboard', () => {
  assert.equal(resolveInstructionsRedirect(store({ [SESSION_KEY]: session('submitted') })), AFTER_ASSESSMENT_ROUTE)
  assert.equal(resolveInstructionsRedirect(store({ [SESSION_KEY]: session('expired') })), AFTER_ASSESSMENT_ROUTE)
})

test('a session in progress returns the visitor to the running timer', () => {
  assert.equal(resolveInstructionsRedirect(store({ [SESSION_KEY]: session('in_progress') })), '/assessment')
})

test('a stored score wins over an in-progress session', () => {
  assert.equal(
    resolveInstructionsRedirect(
      store({ [SCORES_KEY]: '{"total":700}', [SESSION_KEY]: session('in_progress') }),
    ),
    AFTER_ASSESSMENT_ROUTE,
  )
})

test('a corrupt session value is ignored instead of throwing', () => {
  assert.equal(resolveInstructionsRedirect(store({ [SESSION_KEY]: '{not json' })), null)
})

test('a throwing reader degrades to "stay put" rather than crashing the page', () => {
  const boom = () => {
    throw new Error('storage disabled')
  }
  assert.equal(resolveInstructionsRedirect(boom), null)
})
