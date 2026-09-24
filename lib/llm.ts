/**
 * Shared DeepSeek (OpenAI-compatible) chat client.
 *
 * Both AI surfaces in the product go through here:
 *   - lib/ai.ts          — the grader behind /api/ai/evaluate
 *   - lib/aiAssistant.ts — the in-exam assistant behind /api/ai/assistant
 *
 * Configuration precedence (first non-empty wins), so an existing CalibiAI
 * deployment keeps working unchanged while a plain DeepSeek key also works:
 *
 *   CALIBIAI_API_KEY   → DEEPSEEK_API_KEY
 *   CALIBIAI_BASE_URL  → DEEPSEEK_BASE_URL  → https://api.deepseek.com
 *   CALIBIAI_MODEL     → DEEPSEEK_MODEL     → deepseek-chat
 *
 * Everything degrades safely: with no key configured `callLlm` returns null and
 * the caller falls back to its local heuristic engine, so the exam always works.
 */
import { fetchWithTimeout } from './fetchTimeout.ts'

export interface LlmConfig {
  key: string
  baseUrl: string
  model: string
}

export interface LlmEnv {
  CALIBIAI_API_KEY?: string
  CALIBIAI_BASE_URL?: string
  CALIBIAI_MODEL?: string
  DEEPSEEK_API_KEY?: string
  DEEPSEEK_BASE_URL?: string
  DEEPSEEK_MODEL?: string
}

export const DEFAULT_BASE_URL = 'https://api.deepseek.com'
export const DEFAULT_MODEL = 'deepseek-chat'

const pick = (...vals: Array<string | undefined>): string => {
  for (const v of vals) {
    const t = (v || '').trim()
    if (t) return t
  }
  return ''
}

/**
 * Resolve the effective LLM configuration from an env-like object.
 *
 * `baseUrl` is normalised so both "https://api.deepseek.com" and
 * "https://api.deepseek.com/v1/" produce a correct chat-completions URL.
 */
export function resolveLlmConfig(env: LlmEnv = process.env as unknown as LlmEnv): LlmConfig {
  return {
    key: pick(env.CALIBIAI_API_KEY, env.DEEPSEEK_API_KEY),
    baseUrl: pick(env.CALIBIAI_BASE_URL, env.DEEPSEEK_BASE_URL, DEFAULT_BASE_URL).replace(/\/+$/, ''),
    model: pick(env.CALIBIAI_MODEL, env.DEEPSEEK_MODEL, DEFAULT_MODEL),
  }
}

/** Is a real model configured (as opposed to heuristic-only mode)? */
export function isLlmConfigured(env?: LlmEnv): boolean {
  return !!resolveLlmConfig(env).key
}

/** Build the chat-completions endpoint, tolerating a base that already ends in /v1. */
export function chatCompletionsUrl(baseUrl: string): string {
  const b = baseUrl.replace(/\/+$/, '')
  return /\/v\d+$/.test(b) ? `${b}/chat/completions` : `${b}/chat/completions`
}

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface CallLlmOptions {
  messages: LlmMessage[]
  temperature?: number
  /** Ask the model for a strict JSON object (used by the grader). */
  json?: boolean
  timeoutMs?: number
  /** Injectable for tests. */
  fetchImpl?: typeof fetchWithTimeout
  env?: LlmEnv
  /** Label used in log lines so grader/assistant failures are distinguishable. */
  label?: string
}

/**
 * Call the model and return the raw assistant message text.
 * Returns `null` on any failure (no key, HTTP error, timeout, empty body) so
 * every caller can fall back to its heuristic engine.
 */
export async function callLlm(opts: CallLlmOptions): Promise<string | null> {
  const cfg = resolveLlmConfig(opts.env)
  if (!cfg.key) return null

  const doFetch = opts.fetchImpl || fetchWithTimeout
  const label = opts.label || 'llm'

  try {
    const body: Record<string, unknown> = {
      model: cfg.model,
      temperature: opts.temperature ?? 0.2,
      messages: opts.messages,
    }
    if (opts.json) body.response_format = { type: 'json_object' }

    const res = await doFetch(
      chatCompletionsUrl(cfg.baseUrl),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
        body: JSON.stringify(body),
      },
      opts.timeoutMs ?? 15000,
    )

    if (!res.ok) {
      console.error(`[${label}] model error`, res.status, await res.text().catch(() => ''))
      return null
    }

    const data: any = await res.json()
    const content: string | undefined = data?.choices?.[0]?.message?.content
    return content ? String(content) : null
  } catch (e) {
    console.error(`[${label}] model call failed`, e)
    return null
  }
}

/**
 * Call the model expecting a JSON object back.
 *
 * Models occasionally wrap JSON in prose or a ```json fence even when asked not
 * to, so the first balanced object in the reply is extracted before parsing.
 */
export async function callLlmJson(opts: CallLlmOptions): Promise<any | null> {
  const raw = await callLlm({ ...opts, json: true })
  if (!raw) return null
  return parseJsonLoose(raw)
}

/** Parse JSON that may be fenced or surrounded by commentary. Null when unparseable. */
export function parseJsonLoose(raw: string): any | null {
  const text = String(raw || '').trim()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch { /* fall through to extraction */ }

  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) {
    try {
      return JSON.parse(fence[1].trim())
    } catch { /* fall through */ }
  }

  const start = text.indexOf('{')
  if (start === -1) return null
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') inStr = true
    else if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1))
        } catch {
          return null
        }
      }
    }
  }
  return null
}
