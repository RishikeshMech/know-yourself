/** Compare interview ownership independently of the request transport layer. */
export function isInterviewOwner(sessionStudentId: unknown, authenticatedStudentId: unknown): boolean {
  const owner = String(sessionStudentId ?? '').trim().toLowerCase()
  const caller = String(authenticatedStudentId ?? '').trim().toLowerCase()
  return !!owner && !!caller && owner === caller
}
