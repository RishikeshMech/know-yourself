/**
 * Where a visitor who lands on `/instructions` actually belongs.
 *
 * The assessment is a one-time attempt, so `/instructions` has to bounce people
 * who already have a result (→ the student dashboard) or who are mid-attempt
 * (→ `/assessment`) instead of letting them start a second timer.
 *
 * This used to live inline in a `useEffect` on the page, which meant the whole
 * instructions page was painted first and only then discarded by
 * `window.location.replace()` — the visible flicker. Keeping the decision in a
 * pure function lets the page resolve it during the first client render (before
 * anything is painted) and makes it unit-testable without a browser.
 *
 * `read` is injected so the same logic runs against `localStorage` in the
 * browser and against a plain object in tests / on the server (where
 * `localStorage` does not exist).
 */
// Explicit .ts extension so this module can also be exercised directly by
// `npm test` (Node's type-stripping loader requires full specifiers).
import { AFTER_ASSESSMENT_ROUTE } from './nextStep.ts'

export type AttemptRedirect = typeof AFTER_ASSESSMENT_ROUTE | '/assessment' | null

export type AttemptRead = (key: string) => string | null

export const SCORES_KEY = 'calibiai_scores'
export const SESSION_KEY = 'calibiai_session'

/** localStorage reader that never throws (private mode / SSR / disabled storage). */
export function safeRead(key: string): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

/**
 * Returns the route this visitor must be sent to, or `null` when they are
 * allowed to stay on `/instructions`.
 */
export function resolveInstructionsRedirect(read: AttemptRead = safeRead): AttemptRedirect {
  let scores: string | null = null
  let session: string | null = null
  try {
    scores = read(SCORES_KEY)
    session = read(SESSION_KEY)
  } catch {
    return null
  }

  // Already scored → the dashboard holds the score and the report; no second
  // attempt is allowed.
  if (scores) return AFTER_ASSESSMENT_ROUTE

  if (!session) return null
  try {
    const s = JSON.parse(session)
    const status = s?.status
    if (status === 'submitted' || status === 'expired') return AFTER_ASSESSMENT_ROUTE
    // Mid-attempt → straight back to the running 120-minute timer. Restarting
    // from the instructions page would reset it.
    if (status === 'in_progress') return '/assessment'
  } catch {
    /* corrupt/legacy session value — treat as "no session" and stay put */
  }
  return null
}
