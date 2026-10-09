export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { saveFeedbackFlag, saveReport, getReportBySessionFull } from '@/lib/interview/store.ts'
import { randomUUID } from 'crypto'
import type { FeedbackFlag } from '@/lib/interview/types.ts'
import { requireOwnedInterview } from '@/lib/interview/apiAuth.ts'

function json(data: any, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const owned = await requireOwnedInterview(req, params.id)
    if (!owned.ok) return owned.response
    const { session, auth } = owned
    const sb = auth.db

    const body = await req.json()
    const { question_id, reason, rating, comment } = body

    if (question_id && reason) {
      const flag: FeedbackFlag = {
        id: `ff_${randomUUID().slice(0, 8)}`,
        session_id: session.id,
        student_id: session.student_id,
        question_id: String(question_id).slice(0, 100),
        reason: String(reason).slice(0, 1000),
        status: 'open',
        created_at: new Date().toISOString(),
      }
      await saveFeedbackFlag(flag, sb)
      return json({ flag, message: 'Flag submitted for review. Thank you!' })
    }

    if (rating) {
      const report = await getReportBySessionFull(session.id, sb)
      if (!report) return json({ error: 'Report not found' }, 404)

      const stars = Math.max(1, Math.min(5, Number(rating)))
      report.student_rating = {
        stars,
        comment: comment ? String(comment).slice(0, 1000) : undefined,
        rated_at: new Date().toISOString(),
      }
      await saveReport(report, sb)
      return json({ rating: report.student_rating })
    }

    return json({ error: 'Provide question_id+reason or rating' }, 400)
  } catch (e: any) {
    console.error('[api/interviews/feedback] failed', e)
    return json({ error: 'Feedback could not be saved. Please retry.' }, 500)
  }
}
