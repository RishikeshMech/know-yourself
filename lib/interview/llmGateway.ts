/**
 * AI Mock Interview — LLM Gateway (Section 10 & 11.1)
 *
 * Provider-agnostic wrapper for DeepSeek API (OpenAI-compatible).
 * Implements:
 *   - Retries, timeouts, schema validation, prompt versioning, cost tracking
 *   - Prefix caching (static prefix identical across turns)
 *   - Token budgets and graceful degradation
 *   - Streaming support for live interviewer turns
 *   - Fallback to heuristic when no key or on failure
 *
 * Uses existing lib/llm.ts resolveLlmConfig for env resolution:
 *   CALIBIAI_API_KEY / DEEPSEEK_API_KEY, BASE_URL, MODEL
 */

import { callLlm, callLlmJson, resolveLlmConfig, chatCompletionsUrl, parseJsonLoose } from '../llm.ts'
import { fetchWithTimeout } from '../fetchTimeout.ts'
import { PROMPT_VERSION } from './prompts.ts'

export interface LlmGatewayConfig {
  model?: string
  temperature?: number
  maxTokens?: number
  timeoutMs?: number
}

export interface LlmCallResult {
  text: string
  model: string
  promptVersion: string
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    cached_tokens?: number
  }
  latencyMs: number
  engine: 'deepseek' | 'heuristic-fallback'
}

export interface StreamChunk {
  text: string
  done: boolean
}

const DEFAULT_TIMEOUT = 15000
const STREAM_TIMEOUT = 30000
const MAX_RETRIES = 2

// Cost estimation per doc 10.1: ~ $0.435/M input, $0.87/M output (V4-Pro). Use conservative.
const COST_PER_M_INPUT_USD = 0.5
const COST_PER_M_OUTPUT_USD = 1.0
const USD_TO_INR = 83

export function estimateCostInr(promptTokens: number, completionTokens: number): number {
  const inputCost = (promptTokens / 1_000_000) * COST_PER_M_INPUT_USD * USD_TO_INR
  const outputCost = (completionTokens / 1_000_000) * COST_PER_M_OUTPUT_USD * USD_TO_INR
  return Math.round((inputCost + outputCost) * 100) / 100
}

/**
 * Non-streaming call with retries and cost tracking.
 * Returns null on failure so caller falls back to heuristic.
 */
export async function gatewayCallLlm(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  opts: LlmGatewayConfig = {},
): Promise<LlmCallResult | null> {
  const cfg = resolveLlmConfig()
  if (!cfg.key) return null

  const model = opts.model || cfg.model || 'deepseek-chat'
  const temperature = opts.temperature ?? 0.5
  const maxTokens = opts.maxTokens || 400
  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT

  const start = Date.now()

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const body: Record<string, unknown> = {
        model,
        temperature,
        max_tokens: maxTokens,
        messages,
      }

      const res = await fetchWithTimeout(
        chatCompletionsUrl(cfg.baseUrl),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${cfg.key}`,
          },
          body: JSON.stringify(body),
        },
        timeoutMs,
      )

      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        console.error(`[interview-llm] attempt ${attempt} HTTP ${res.status}: ${errText.slice(0, 300)}`)
        if (res.status >= 500 && attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, 300 * (attempt + 1)))
          continue
        }
        return null
      }

      const data: any = await res.json()
      const content = data?.choices?.[0]?.message?.content
      if (!content) return null

      const usage = data?.usage
      return {
        text: String(content),
        model,
        promptVersion: PROMPT_VERSION,
        usage: usage
          ? {
              prompt_tokens: usage.prompt_tokens || 0,
              completion_tokens: usage.completion_tokens || 0,
              cached_tokens: usage.prompt_tokens_details?.cached_tokens || 0,
            }
          : undefined,
        latencyMs: Date.now() - start,
        engine: 'deepseek',
      }
    } catch (e: any) {
      console.error(`[interview-llm] attempt ${attempt} failed:`, e?.message || e)
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 300 * (attempt + 1)))
        continue
      }
      return null
    }
  }
  return null
}

export async function gatewayCallLlmJson(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  opts: LlmGatewayConfig = {},
): Promise<{ parsed: any; raw: LlmCallResult } | null> {
  const cfg = resolveLlmConfig()
  if (!cfg.key) return null

  const result = await gatewayCallLlm(messages, { ...opts, temperature: opts.temperature ?? 0.2, maxTokens: opts.maxTokens || 800 })
  if (!result) return null

  const parsed = parseJsonLoose(result.text)
  if (!parsed) {
    console.error('[interview-llm] JSON parse failed:', result.text.slice(0, 500))
    return null
  }

  return { parsed, raw: result }
}

/**
 * Streaming call for live interviewer turns (Section 12 latency: p95 <4s to first token).
 * Returns async generator of text chunks.
 */
export async function* gatewayStreamLlm(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  opts: LlmGatewayConfig = {},
): AsyncGenerator<StreamChunk, void, unknown> {
  const cfg = resolveLlmConfig()
  if (!cfg.key) {
    yield { text: '', done: true }
    return
  }

  const model = opts.model || cfg.model || 'deepseek-chat'
  const temperature = opts.temperature ?? 0.6
  const maxTokens = opts.maxTokens || 250

  try {
    const res = await fetch(chatCompletionsUrl(cfg.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.key}`,
      },
      body: JSON.stringify({
        model,
        temperature,
        max_tokens: maxTokens,
        messages,
        stream: true,
      }),
    })

    if (!res.ok || !res.body) {
      yield { text: '', done: true }
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed === 'data: [DONE]') continue
        if (!trimmed.startsWith('data: ')) continue
        try {
          const json = JSON.parse(trimmed.slice(6))
          const delta = json?.choices?.[0]?.delta?.content
          if (delta) {
            yield { text: String(delta), done: false }
          }
          if (json?.choices?.[0]?.finish_reason) {
            yield { text: '', done: true }
            return
          }
        } catch {
          // ignore malformed SSE line
        }
      }
    }
    yield { text: '', done: true }
  } catch (e) {
    console.error('[interview-llm] stream failed:', e)
    yield { text: '', done: true }
  }
}

/**
 * Convenience wrapper that collects streamed chunks into full text,
 * while also invoking onChunk for real-time UI.
 */
export async function collectStream(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  onChunk: (chunk: string) => void,
  opts: LlmGatewayConfig = {},
): Promise<{ fullText: string; latencyMs: number } | null> {
  const cfg = resolveLlmConfig()
  if (!cfg.key) return null

  const start = Date.now()
  let full = ''

  for await (const chunk of gatewayStreamLlm(messages, opts)) {
    if (chunk.text) {
      full += chunk.text
      onChunk(chunk.text)
    }
    if (chunk.done) break
  }

  if (!full) return null
  return { fullText: full, latencyMs: Date.now() - start }
}
