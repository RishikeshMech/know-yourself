/** Dashboard lifecycle: feature the first result once, then consolidate every
 * completed result under the CalibiAI Score. Keep the second exam available
 * until it has a result. A numeric zero is still a completed score. */
export function assessmentVisibility(first: { total?: number | null } | null | undefined, second: { total?: number | null } | null | undefined) {
  const firstDone = typeof first?.total === 'number' && Number.isFinite(first.total)
  const secondDone = typeof second?.total === 'number' && Number.isFinite(second.total)
  return {
    firstDone,
    secondDone,
    showFirstResultCard: firstDone && !secondDone,
    showSecondLaunchCard: !secondDone,
  }
}
