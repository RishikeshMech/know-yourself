import { NextResponse } from 'next/server'
import { saveResumeAnalysis } from '@/lib/db'
import { persistResumeOutcome } from '@/lib/persist'
import { resolveStudentAccess } from '@/lib/studentAuth'
import { createLimiter } from '@/lib/concurrency'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'
import {
  MAX_RESUME_BYTES,
  analyzeResumeText,
  extractResumeText,
  type CandidateContext,
} from '@/lib/resume'

// PDF/DOCX parsing + an LLM call is heavy; cap concurrent parses per worker so
// a burst of uploads degrades to 429 instead of OOMing the process.
const RESUME_PARSE_LIMIT = 4
const resumeLimiter = createLimiter(RESUME_PARSE_LIMIT)
// Per-IP *abuse backstop* only — campuses share a NAT IP, so keep it generous.
const RATE_LIMIT = 300
const RATE_WINDOW_MS = 60_000

/**
 * POST multipart { file, user_id, full_name, email, degree, skills }
 * Extracts the document text server-side, then runs the CalibiAI resume grader
 * (or the rule-based engine). The analysis is stored for the VERIFIED student
 * (the bearer token), never for an id typed into the form.
 */
export async function POST(req: Request) {
  const rl = checkRateLimit(`resume:${getClientIp(req)}`, RATE_LIMIT, RATE_WINDOW_MS)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many uploads — slow down.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  if (!resumeLimiter.tryAcquire()) {
    return NextResponse.json(
      { error: 'Resume analysis is busy — please try again in a moment.' },
      { status: 429, headers: { 'Retry-After': '3' } },
    )
  }
  try {
    const form = await req.formData()
    const who = await resolveStudentAccess(req, form.get('user_id')?.toString())
    if (!who.ok) return NextResponse.json({ error: who.error }, { status: who.status })

    const file = form.get('file')
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: 'Please attach a resume file.' }, { status: 400 })
    }
    if (file.size > MAX_RESUME_BYTES) {
      return NextResponse.json({ error: 'Resume is larger than 5 MB.' }, { status: 413 })
    }

    let text: string
    try {
      text = await extractResumeText(Buffer.from(await file.arrayBuffer()), file.name)
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || 'Could not read this file.' }, { status: 415 })
    }
    if (!text || text.trim().length < 20) {
      return NextResponse.json(
        { error: 'No readable text found in this file — is it a real resume?' },
        { status: 422 },
      )
    }

    const ctx: CandidateContext = {
      full_name: form.get('full_name')?.toString() || '',
      email: form.get('email')?.toString() || '',
      degree: form.get('degree')?.toString() || '',
      skills: form.get('skills')?.toString() || '',
    }

    const analysis = await analyzeResumeText(text, ctx)
    const record = {
      id: 'res_' + Date.now(),
      student_id: who.studentId,
      storage_key: form.get('storage_key')?.toString() || '',
      file_name: file.name,
      created_at: new Date().toISOString(),
      ...analysis,
    }
    if (who.mode === 'supabase') {
      const outcome = await persistResumeOutcome(who.client, record)
      if (!outcome.ok) {
        // Do not show an analysis as saved when it is not in the database.
        return NextResponse.json(
          { error: 'We analysed your resume but could not save it. Please upload it again.' },
          { status: 503 },
        )
      }
      return NextResponse.json({ analysis: record, supabase: true, stored: 'supabase' })
    }
    saveResumeAnalysis(record as any)
    return NextResponse.json({ analysis: record, supabase: false, stored: 'local' })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Resume analysis failed.' }, { status: 500 })
  } finally {
    resumeLimiter.release()
  }
}
