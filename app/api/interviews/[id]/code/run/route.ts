export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getInterviewSessionFull, saveInterviewSession, getCustomOrBankQuestion } from '@/lib/interview/store.ts'
import { runCodingTests } from '@/lib/company/codeRunner.ts'
import { randomUUID } from 'crypto'
import type { CodeLang } from '@/lib/company/languages.ts'
import { getServerClient } from '@/lib/supabaseServer.ts'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const sb = getServerClient()
    const session = await getInterviewSessionFull(params.id, sb)
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

    const body = await req.json()
    const { code, language, question_id } = body

    if (!code || typeof code !== 'string') return NextResponse.json({ error: 'code required' }, { status: 400 })

    const qId = question_id || session.blueprint.current_question_id
    if (!qId) return NextResponse.json({ error: 'No question context' }, { status: 400 })

    const question = getCustomOrBankQuestion(session, qId)
    if (!question) return NextResponse.json({ error: 'Question not found' }, { status: 404 })
    if (!question.coding_spec) return NextResponse.json({ error: 'This question has no coding spec' }, { status: 400 })

    const lang = (language || 'python') as CodeLang
    if (!['python', 'javascript', 'java', 'cpp', 'c'].includes(lang)) {
      return NextResponse.json({ error: 'Unsupported language' }, { status: 400 })
    }

    const codingQ: any = {
      id: question.id,
      fn: { python: question.coding_spec.fn_name.python, javascript: question.coding_spec.fn_name.javascript },
      tests: question.coding_spec.tests,
      compare: question.coding_spec.compare,
    }

    const result = await runCodingTests(codingQ, code, lang)

    const submission = {
      id: `cs_${randomUUID().slice(0, 8)}`,
      session_id: session.id,
      question_id: qId,
      language: lang,
      code: code.slice(0, 10000),
      passed: result.passed,
      total: result.total,
      test_results: result.results.map(r => ({
        name: r.name,
        passed: r.passed,
        status: r.status,
        ms: r.ms,
        got: (r as any).got,
        expected: (r as any).expected,
        message: (r as any).message,
      })),
      runtime_ms: result.results.reduce((s, r) => s + (r.ms || 0), 0),
      submitted_at: new Date().toISOString(),
    }

    session.code_submissions.push(submission)
    await saveInterviewSession(session, sb, { persistCode: true })

    return NextResponse.json({
      submission,
      summary: `${result.passed}/${result.total} tests passed`,
      results: result.results,
    })
  } catch (e: any) {
    console.error('[api/interviews/code/run] failed', e)
    return NextResponse.json({ error: 'Code run failed', detail: String(e?.message || e) }, { status: 500 })
  }
}
