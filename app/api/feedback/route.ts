import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { getAllFeedback, getFeedbackForStudent, saveFeedback } from '@/lib/db'
import { validFeedback } from '@/lib/feedback'
import { fetchAllFeedback, persistFeedback } from '@/lib/persist'
import { getServerClient } from '@/lib/supabaseServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Candidate feedback ("which candidate gave which feedback").
 *
 *   POST /api/feedback   { student_id, session_id?, email?, rating, message, source? }
 *   GET  /api/feedback?student_id=&email=        → that candidate's submissions
 *
 * The JSON store is always written (so demo mode and offline hosts keep the
 * data), and Supabase `feedback_submissions` is mirrored when configured. The
 * response reports whether the Supabase mirror succeeded, mirroring the
 * `supabase: true` convention used by the other routes.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const rating = Number(body?.rating)
    const message = String(body?.message ?? '').trim()
    if (!validFeedback(rating, message)) {
      return NextResponse.json(
        { error: 'Feedback needs a rating from 1 to 5 and at least 10 characters.' },
        { status: 400 },
      )
    }

    const submission = {
      // The client reuses this id when retrying, so a transient Supabase error
      // cannot create duplicate local/remote feedback rows.
      id: String(body?.id ?? '').trim() || randomUUID(),
      student_id: String(body?.student_id ?? body?.user_id ?? '').trim() || 'sess_demo',
      session_id: String(body?.session_id ?? '').trim() || undefined,
      email: String(body?.email ?? '').trim().toLowerCase() || undefined,
      rating,
      message,
      source: String(body?.source ?? '').trim() || 'web',
      created_at: new Date().toISOString(),
    }

    saveFeedback(submission)

    let supabase = false
    const sb = getServerClient()
    if (sb) {
      supabase = await persistFeedback(sb, submission)
      // Do not report success when Supabase is configured but the mirror failed.
      // The local write above is retained for recovery, and the client keeps the
      // form open so the same submission id can be retried without duplication.
      if (!supabase) {
        return NextResponse.json(
          {
            error: 'Feedback could not be saved to Supabase. Please try again; your feedback is still kept for retry.',
            feedback: submission,
            saved_local: true,
            supabase: false,
          },
          { status: 503 },
        )
      }
    }

    return NextResponse.json({ ok: true, feedback: submission, saved: true, supabase })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Could not save feedback.' }, { status: 500 })
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const studentId = url.searchParams.get('student_id') || url.searchParams.get('user_id') || ''
    const email = url.searchParams.get('email') || ''
    if (!studentId && !email) {
      // Admin/diagnostic listing — same shape as the local store.
      return NextResponse.json({ feedback: getAllFeedback() })
    }
    const local = getFeedbackForStudent(studentId, email)
    const sb = getServerClient()
    if (sb) {
      const remote = await fetchAllFeedback(sb)
      if (remote) {
        const id = studentId.trim().toLowerCase()
        const mail = email.trim().toLowerCase()
        const mine = remote.filter((f: any) => {
          const fId = String(f.student_ref || f.student_id || '').trim().toLowerCase()
          const fMail = String(f.email || '').trim().toLowerCase()
          return (id && fId === id) || (mail && fMail === mail)
        })
        if (mine.length) {
          // Newest first, Supabase preferred, de-duplicated by id.
          const seen = new Set<string>()
          const merged = [...mine, ...local].filter(f => {
            const key = String(f.id) || `${f.created_at}|${f.message}`
            if (seen.has(key)) return false
            seen.add(key)
            return true
          })
          merged.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          return NextResponse.json({ feedback: merged, supabase: true })
        }
      }
    }
    return NextResponse.json({ feedback: local })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to load feedback.' }, { status: 500 })
  }
}
