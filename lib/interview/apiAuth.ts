import { NextResponse } from 'next/server'
import { requireStudentApi, type StudentApiContext } from '../studentApi.ts'
import { getInterviewSessionFull } from './store.ts'
import { isInterviewOwner } from './access.ts'
import type { InterviewSession } from './types.ts'

export type OwnedInterviewResult =
  | { ok: true; auth: Extract<StudentApiContext, { ok: true }>; session: InterviewSession }
  | { ok: false; response: NextResponse }

/**
 * Resolve a request to a verified student and require the interview to belong
 * to that student. Session ids are identifiers, not authorization credentials.
 * Supabase-mode lookups use the trusted server client and fail closed; they do
 * not read an old local copy when Postgres is unavailable.
 */
export async function requireOwnedInterview(req: Request, sessionId: string): Promise<OwnedInterviewResult> {
  const auth = await requireStudentApi(req, null)
  if (!auth.ok) return auth

  let session: InterviewSession | null
  try {
    session = await getInterviewSessionFull(sessionId, auth.db)
  } catch (error) {
    console.error('[interview auth] session lookup failed', error)
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Interview storage is temporarily unavailable. Please retry.' },
        { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '30' } },
      ),
    }
  }

  // Return the same response for an unknown id and another student's id so
  // callers cannot probe whether a particular interview exists.
  if (!session || !isInterviewOwner(session.student_id, auth.studentId)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Interview session not found' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      ),
    }
  }

  return { ok: true, auth, session }
}
