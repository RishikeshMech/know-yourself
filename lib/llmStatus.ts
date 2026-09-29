/**
 * Admin-facing LLM (DeepSeek) status: is a model configured, which one, and
 * can this server actually reach it? Used by /api/admin/ai-status. The API key
 * is NEVER returned — only which variable supplied it and its last 4 chars.
 */
import { chatCompletionsUrl, llmTelemetry, resolveLlmConfig, type LlmEnv, type LlmTelemetry } from './llm.ts'
import { fetchWithTimeout } from './fetchTimeout.ts'

export interface LlmStatus {
  configured: boolean
  provider: string
  baseUrl: string
  model: string
  keySource: 'CALIBIAI_API_KEY' | 'DEEPSEEK_API_KEY' | null
  keyHint: string
  telemetry: LlmTelemetry
  surfaces: Array<{ label: string; where: string }>
}

export const AI_SURFACES = [
  { label: 'grader', where: 'CalibiAI assessment & Capgemini mock — "✨ Evaluate with AI" (writing, speaking, debugging, feature, prompt)' },
  { label: 'assistant', where: 'In-exam AI coding assistant' },
  { label: 'company-grader', where: 'Company mocks — written answers (graded at submit)' },
  { label: 'resume', where: 'Resume analysis' },
  { label: 'feedback', where: 'Feedback suggestions' },
]

export function llmStatus(env: LlmEnv = process.env as unknown as LlmEnv): LlmStatus {
  const cfg = resolveLlmConfig(env)
  const source = (env.CALIBIAI_API_KEY || '').trim() ? 'CALIBIAI_API_KEY' : (env.DEEPSEEK_API_KEY || '').trim() ? 'DEEPSEEK_API_KEY' : null
  let host = cfg.baseUrl
  try { host = new URL(cfg.baseUrl).host } catch { /* keep raw */ }
  return {
    configured: !!cfg.key,
    provider: /deepseek/i.test(host) ? 'DeepSeek' : 'OpenAI-compatible',
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    keySource: source,
    keyHint: cfg.key ? `…${cfg.key.slice(-4)}` : '',
    telemetry: llmTelemetry,
    surfaces: AI_SURFACES,
  }
}

export interface LlmTestResult {
  ok: boolean
  latencyMs: number
  status?: number
  model?: string
  reply?: string
  error?: string
  hint?: string
}

/** One tiny JSON-mode completion against the configured endpoint. */
export async function testLlmConnection(env: LlmEnv = process.env as unknown as LlmEnv, timeoutMs = 15000): Promise<LlmTestResult> {
  const cfg = resolveLlmConfig(env)
  if (!cfg.key) return { ok: false, latencyMs: 0, error: 'No API key configured.', hint: 'Set DEEPSEEK_API_KEY (or CALIBIAI_API_KEY) in the server .env and restart the app.' }
  const t0 = Date.now()
  try {
    const res = await fetchWithTimeout(chatCompletionsUrl(cfg.baseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0,
        max_tokens: 20,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'Connectivity check. Reply with exactly this JSON object: {"ok": true}' },
          { role: 'user', content: 'ping' },
        ],
      }),
    }, timeoutMs)
    const latencyMs = Date.now() - t0
    const text = await res.text().catch(() => '')
    if (!res.ok) {
      const msg = (() => { try { return JSON.parse(text)?.error?.message } catch { return '' } })() || text.slice(0, 160)
      const hint = res.status === 401 ? 'The API key was rejected — check the key value (no quotes/spaces) and that the account is active.'
        : res.status === 402 ? 'Insufficient balance on the DeepSeek account.'
        : res.status === 429 ? 'Rate limited — retry shortly.'
        : res.status >= 500 ? 'The model provider returned a server error — retry shortly.'
        : 'Check the base URL and model name.'
      return { ok: false, latencyMs, status: res.status, error: String(msg).replace(cfg.key, '***'), hint }
    }
    let data: any = {}
    try { data = JSON.parse(text) } catch { /* keep {} */ }
    const reply = String(data?.choices?.[0]?.message?.content || '').slice(0, 120)
    return { ok: !!reply, latencyMs, status: res.status, model: data?.model || cfg.model, reply, ...(reply ? {} : { error: 'Empty reply from the model.' }) }
  } catch (e: any) {
    const latencyMs = Date.now() - t0
    const timeout = e?.name === 'AbortError' || /abort|timeout/i.test(String(e?.message))
    return {
      ok: false,
      latencyMs,
      error: timeout ? `No response within ${Math.round(timeoutMs / 1000)}s.` : String(e?.message || e).replace(cfg.key, '***'),
      hint: timeout ? 'The server cannot reach the model endpoint in time — check outbound HTTPS from the host.' : 'The server could not connect to the model endpoint — check DNS/firewall for outbound HTTPS.',
    }
  }
}
