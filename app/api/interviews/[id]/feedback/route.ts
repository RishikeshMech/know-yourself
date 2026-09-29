export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getInterviewSessionFull, saveFeedbackFlag, saveReport, getReportBySessionFull } from '@/lib/interview/store.ts'
import { randomUUID } from 'crypto'
import type { FeedbackFlag } from '@/lib/interview/types.ts'
import { getServerClient } from '@/lib/supabaseServer.ts'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const sb = getServerClient()
    const session = await getInterviewSessionFull(params.id, sb)
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

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
      return NextResponse.json({ flag, message: 'Flag submitted for review. Thank you!' })
    }

    if (rating) {
      const report = await getReportBySessionFull(session.id, sb)
      if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 })

      const stars = Math.max(1, Math.min(5, Number(rating)))
      report.student_rating = {
        stars,
        comment: comment ? String(comment).slice(0, 1000) : undefined,
        rated_at: new Date().toISOString(),
      }
      await saveReport(report, sb)
      return NextResponse.json({ rating: report.student_rating })
    }

    return NextResponse.json({ error: 'Provide question_id+reason or rating' }, { status: 400 })
  } catch (e: any) {
    console.error('[api/interviews/feedback] failed', e)
    return NextResponse.json({ error: 'Feedback failed', detail: String(e?.message || e) }, { status: 500 })
  }
}
