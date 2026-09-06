// Test-runner endpoint for the coding modules. Runs the candidate's submitted
// code against the real hidden tests in an isolated subprocess and returns the
// actual pass count (never a length-based guess).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { runTests } from '@/lib/runTests'

export async function POST(req: Request) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }
  const taskId = String(body?.task_id || '').trim()
  const code = String(body?.code || '')
  if (!taskId) return NextResponse.json({ error: 'Missing task_id' }, { status: 400 })

  try {
    const result = await runTests(taskId, code)
    return NextResponse.json({ ok: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ error: 'test run failed', detail: String(e?.message || e) }, { status: 500 })
  }
}
