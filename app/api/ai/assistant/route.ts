// API Route: POST /api/ai/assistant
// Handles in-exam AI assistant chat requests for Stage 3 (AI Debugging) and Stage 4 (AI Feature Dev).
// Server-side execution keeps the CalibiAI key secure.

export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { chatWithAssistant, type AssistantRequest } from '@/lib/aiAssistant'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

// The in-exam assistant is capped client-side at 5 prompts/task. The server
// keeps only a generous per-IP *abuse backstop* (campuses share a NAT IP, so
// per-IP limits must not throttle real students).
const RATE_LIMIT = 1000
const RATE_WINDOW_MS = 60_000

export async function POST(req: Request) {
  const rl = checkRateLimit(`assistant:${getClientIp(req)}`, RATE_LIMIT, RATE_WINDOW_MS)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many assistant requests — slow down.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'A JSON object is required' }, { status: 400 })
  }

  const { taskId, taskTitle, taskPrompt, buggyOrSpec, currentCode, messages } = body

  if (typeof taskId !== 'string' || !taskId.trim() || taskId.length > 80) {
    return NextResponse.json({ error: 'A valid taskId is required' }, { status: 400 })
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'Send a question before requesting an answer.' }, { status: 400 })
  }

  // Keep the chat bounded and accept only real conversation roles. In
  // particular, a client cannot smuggle a system message into the model prompt.
  const cleanMessages = messages
    .slice(-12)
    .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m: any) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content.slice(0, 8_000),
    }))
    .filter((m: any) => m.content.trim())

  if (!cleanMessages.length || cleanMessages[cleanMessages.length - 1].role !== 'user') {
    return NextResponse.json({ error: 'Send your own question to get an assistant response.' }, { status: 400 })
  }

  try {
    const assistantReq: AssistantRequest = {
      taskId: taskId.trim(),
      taskTitle: taskTitle ? String(taskTitle).slice(0, 160) : undefined,
      taskPrompt: taskPrompt ? String(taskPrompt).slice(0, 6_000) : undefined,
      buggyOrSpec: buggyOrSpec ? String(buggyOrSpec).slice(0, 16_000) : undefined,
      currentCode: currentCode ? String(currentCode).slice(0, 60_000) : '',
      messages: cleanMessages,
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
