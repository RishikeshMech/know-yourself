/**
 * Flattens a stored assessment result row (local JSON or Supabase) into the
 * `scores` shape the UI/PDF expects — the same shape `computeScores()` returns.
 *
 * A result row stores the section breakdown nested under `scores` plus
 * top-level `total` / `grade` / `percentile` / `verifiable_hash` / `ai_feedback`.
 * Every consumer (student dashboard, profile page, store reconciliation, PDF)
 * must go through this one function so the number on screen and the number in
 * the downloaded PDF can never drift apart.
 *
 * Returns `null` for a falsy/absent result so callers can clear stale cached
 * scores when the DB says there is no result for the current user.
 */
export function flattenAssessmentResult(result: any): any {
  if (!result) return null
  // A real result row always carries a numeric `total` and a `scores` jsonb
  // column; anything else (e.g. an empty object from a failed fetch) is
  // treated as "no result" so callers clear stale cached scores.
  if (result.total === undefined && result.scores === undefined) return null
  const scores = (result.scores && typeof result.scores === 'object') ? result.scores : {}
  return {
    session_id: result.session_id,
    ...scores,
    total: result.total,
    grade: result.grade,
    percentile: result.percentile,
    verifiable_hash: result.verifiable_hash,
    cognitive: scores.cognitive,
    english: scores.english,
    detail: scores.detail,
    ai_results: result.ai_feedback,
  }
}
