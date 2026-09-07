// API Route: POST /api/ai/assistant
// Handles in-exam AI assistant chat requests for Stage 3 (AI Debugging) and Stage 4 (AI Feature Dev).
// Server-side execution keeps DEEPSEEK_API_KEY secure.

export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { chatWithAssistant, type AssistantRequest } from '@/lib/aiAssistant'

export async function POST(req: Request) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { taskId, taskTitle, taskPrompt, buggyOrSpec, currentCode, messages } = body

  if (!taskId) {
    return NextResponse.json({ error: 'taskId is required' }, { status: 400 })
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'messages array is required' }, { status: 400 })
  }

  try {
    const assistantReq: AssistantRequest = {
      taskId: String(taskId),
      taskTitle: taskTitle ? String(taskTitle) : undefined,
      taskPrompt: taskPrompt ? String(taskPrompt) : undefined,
      buggyOrSpec: buggyOrSpec ? String(buggyOrSpec) : undefined,
      currentCode: currentCode ? String(currentCode) : '',
      messages: messages.map((m: any) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: String(m.content || ''),
      })),
    }

    const response = await chatWithAssistant(assistantReq)

    return NextResponse.json({
      ok: true,
      ...response,
    })
  } catch (err: any) {
    console.error('Error in /api/ai/assistant:', err)
    return NextResponse.json(
      { error: 'Failed to generate assistant response', detail: String(err?.message || err) },
      { status: 500 },
    )
  }
}
