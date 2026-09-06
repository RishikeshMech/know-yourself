import { NextResponse } from 'next/server'
import { saveResumeAnalysis } from '@/lib/db'
import { getServerClient } from '@/lib/supabaseServer'
import { persistResumeAnalysis } from '@/lib/persist'
import {
  MAX_RESUME_BYTES,
  analyzeResumeText,
  extractResumeText,
  type CandidateContext,
} from '@/lib/resume'

/**
 * POST multipart { file, user_id, full_name, email, degree, skills }
 * Extracts the document text server-side, then runs DeepSeek (or the
 * rule-based engine) to produce a professional, industry-style analysis —
 * including name-mismatch and professionalism flags.
 */
export async function POST(req: Request) {
  try {
    const form = await req.formData()
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
      student_id: form.get('user_id')?.toString() || 'unknown',
      storage_key: form.get('storage_key')?.toString() || '',
      file_name: file.name,
      created_at: new Date().toISOString(),
      ...analysis,
    }
    saveResumeAnalysis(record as any)
    const sb = getServerClient()
    let supabase = false
    if (sb) supabase = await persistResumeAnalysis(sb, record)
    return NextResponse.json({ analysis: record, supabase })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Resume analysis failed.' }, { status: 500 })
  }
}
