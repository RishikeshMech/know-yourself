// AI evaluation endpoint — server-side only (keeps DEEPSEEK_API_KEY secret).
// Body: { kind, ...payload }
//   writing   { text, scenario }
//   speaking  { transcript?, recordingCount }
//   debugging { taskId, buggy, prompt, fix }
//   feature   { spec, code }
//   prompt    { task, hint, prompt }
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import {
  evaluateWriting, evaluateSpeaking, evaluateDebugging, evaluateFeature, evaluatePrompt,
  isDeepSeekConfigured, type AiKind,
} from '@/lib/ai'

export async function POST(req: Request) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  const kind = body?.kind as AiKind
  try {
    let result
    switch (kind) {
      case 'writing':
        result = await evaluateWriting(String(body.text || ''), String(body.scenario || ''))
        break
      case 'speaking':
        result = await evaluateSpeaking(body.transcript ?? null, Number(body.recordingCount || 0))
        break
      case 'debugging':
        result = await evaluateDebugging(
          String(body.taskId || ''), String(body.buggy || ''),
          String(body.prompt || ''), String(body.fix || ''),
        )
        break
      case 'feature':
        result = await evaluateFeature(String(body.spec || ''), String(body.code || ''))
        break
      case 'prompt':
        result = await evaluatePrompt(String(body.task || ''), String(body.hint || ''), String(body.prompt || ''))
        break
      default:
        return NextResponse.json({ error: `unknown kind: ${kind}` }, { status: 400 })
    }
    return NextResponse.json({ ok: true, engine: isDeepSeekConfigured() ? 'deepseek' : 'heuristic', result })
  } catch (e: any) {
    return NextResponse.json({ error: 'evaluation failed', detail: String(e?.message || e) }, { status: 500 })
  }
}
