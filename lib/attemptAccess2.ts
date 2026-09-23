/**
 * Access rules for Assessment 2 (the Capgemini 2027 mock test).
 *
 * The product rule is: a FIRST-TIME user must take assessment 1. Only once
 * that attempt is finished does assessment 2 appear on the student dashboard
 * and become startable. Like assessment 1 it is a single attempt.
 *
 * Mirrors lib/attemptAccess.ts: the decision is a pure function over a storage
 * reader so the page can resolve it during the first client render (no
 * paint-then-redirect flicker) and so it is unit-testable without a browser.
 */
import { AFTER_ASSESSMENT_ROUTE } from './nextStep.ts'

export const SCORES_KEY = 'calibiai_scores'
export const SESSION_KEY = 'calibiai_session'
export const SCORES2_KEY = 'calibiai2_scores'
export const SESSION2_KEY = 'calibiai2_session'

export type AttemptRead = (key: string) => string | null

/** localStorage reader that never throws (private mode / SSR / disabled storage). */
export function safeRead(key: string): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function parse(raw: string | null): any {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** Has assessment 1 been completed (locally)? */
export function hasCompletedAssessment1(read: AttemptRead = safeRead): boolean {
  try {
    if (read(SCORES_KEY)) return true
    const s = parse(read(SESSION_KEY))
    return s?.status === 'submitted' || s?.status === 'expired'
  } catch {
    return false
  }
}

/** Has assessment 2 been completed (locally)? */
export function hasCompletedAssessment2(read: AttemptRead = safeRead): boolean {
  try {
    if (read(SCORES2_KEY)) return true
    const s = parse(read(SESSION2_KEY))
    return s?.status === 'submitted' || s?.status === 'expired'
  } catch {
    return false
  }
}

/**
 * Where a visitor of `/instructions2` belongs, or `null` when they may stay and
 * start the Capgemini mock.
 *
 *   already scored on assessment 2  → the dashboard (single attempt)
 *   mid-attempt on assessment 2     → straight back to the running timer
 *   assessment 1 not finished yet   → `/instructions` (take the first test)
 */
export function resolveInstructions2Redirect(read: AttemptRead = safeRead): string | null {
  let scores2: string | null = null
  let session2: any = null
  try {
    scores2 = read(SCORES2_KEY)
    session2 = parse(read(SESSION2_KEY))
  } catch {
    return null
  }

  if (scores2) return AFTER_ASSESSMENT_ROUTE
  if (session2?.status === 'submitted' || session2?.status === 'expired') return AFTER_ASSESSMENT_ROUTE
  // Mid-attempt → back to the running timer; restarting here would reset it.
  if (session2?.status === 'in_progress') return '/assessment2'

  // The gate itself: assessment 2 is unlocked only after assessment 1.
  if (!hasCompletedAssessment1(read)) return '/instructions'

  return null
}
