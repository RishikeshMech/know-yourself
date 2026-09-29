import { NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/adminAuth'
import { llmStatus, testLlmConnection } from '@/lib/llmStatus'

export const dynamic = 'force-dynamic'

/** GET — LLM configuration + usage counters (no secrets). */
export async function GET(req: Request) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(llmStatus(), { headers: { 'Cache-Control': 'no-store' } })
}

/** POST — run a live connectivity test against the configured model. */
export async function POST(req: Request) {
  if (!isAdminRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const result = await testLlmConnection()
  return NextResponse.json({ ...llmStatus(), test: { ...result, at: new Date().toISOString() } }, { headers: { 'Cache-Control': 'no-store' } })
}
