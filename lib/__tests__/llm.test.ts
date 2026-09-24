/**
 * Tests for the shared DeepSeek (OpenAI-compatible) client that both the
 * grader (lib/ai.ts) and the in-exam assistant (lib/aiAssistant.ts) call.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  resolveLlmConfig,
  isLlmConfigured,
  chatCompletionsUrl,
  callLlm,
  callLlmJson,
  parseJsonLoose,
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
} from '../llm.ts'

/* ---------------- configuration ---------------- */

test('a bare DeepSeek key is enough to configure the model', () => {
  const cfg = resolveLlmConfig({ DEEPSEEK_API_KEY: 'sk-deepseek-123' })
  assert.equal(cfg.key, 'sk-deepseek-123')
  assert.equal(cfg.baseUrl, DEFAULT_BASE_URL)
  assert.equal(cfg.model, DEFAULT_MODEL)
  assert.equal(isLlmConfigured({ DEEPSEEK_API_KEY: 'sk-deepseek-123' }), true)
})

test('CALIBIAI_* variables take precedence over DEEPSEEK_* ones', () => {
  const cfg = resolveLlmConfig({
    CALIBIAI_API_KEY: 'calibi-key', DEEPSEEK_API_KEY: 'deepseek-key',
    CALIBIAI_MODEL: 'calibi-model', DEEPSEEK_MODEL: 'deepseek-reasoner',
  })
  assert.equal(cfg.key, 'calibi-key')
  assert.equal(cfg.model, 'calibi-model')
})

test('DEEPSEEK_* fills in whichever CALIBIAI_* values are blank', () => {
  const cfg = resolveLlmConfig({
    CALIBIAI_API_KEY: '   ', // blank/whitespace must not win
    DEEPSEEK_API_KEY: 'sk-fallback',
    DEEPSEEK_MODEL: 'deepseek-reasoner',
    DEEPSEEK_BASE_URL: 'https://proxy.internal/v1',
  })
  assert.equal(cfg.key, 'sk-fallback')
  assert.equal(cfg.model, 'deepseek-reasoner')
  assert.equal(cfg.baseUrl, 'https://proxy.internal/v1')
})

test('no key configured means heuristic-only mode', () => {
  assert.equal(isLlmConfigured({}), false)
  assert.equal(resolveLlmConfig({}).key, '')
})

test('a trailing slash on the base URL never produces a double slash', () => {
  assert.equal(chatCompletionsUrl('https://api.deepseek.com/'), 'https://api.deepseek.com/chat/completions')
  assert.equal(chatCompletionsUrl('https://api.deepseek.com/v1'), 'https://api.deepseek.com/v1/chat/completions')
})

/* ---------------- calling ---------------- */

const okResponse = (content: string) => ({
  ok: true,
  status: 200,
  json: async () => ({ choices: [{ message: { content } }] }),
  text: async () => '',
}) as any

test('callLlm returns null without a key and never calls the network', async () => {
  let called = false
  const out = await callLlm({
    env: {},
    messages: [{ role: 'user', content: 'hi' }],
    fetchImpl: (async () => { called = true; return okResponse('x') }) as any,
  })
  assert.equal(out, null)
  assert.equal(called, false, 'must not call the API when unconfigured')
})

test('callLlm sends the key, model and messages to the right endpoint', async () => {
  let url = ''
  let init: any = null
  const out = await callLlm({
    env: { DEEPSEEK_API_KEY: 'sk-test', DEEPSEEK_MODEL: 'deepseek-chat' },
    messages: [{ role: 'system', content: 'sys' }, { role: 'user', content: 'q' }],
    fetchImpl: (async (u: string, i: any) => { url = u; init = i; return okResponse('answer') }) as any,
  })
  assert.equal(out, 'answer')
  assert.equal(url, 'https://api.deepseek.com/chat/completions')
  assert.equal(init.headers.Authorization, 'Bearer sk-test')
  const body = JSON.parse(init.body)
  assert.equal(body.model, 'deepseek-chat')
  assert.equal(body.messages.length, 2)
  assert.equal(body.response_format, undefined, 'plain chat must not force JSON mode')
})

test('callLlmJson asks for a JSON object and parses it', async () => {
  let body: any = null
  const out = await callLlmJson({
    env: { DEEPSEEK_API_KEY: 'sk-test' },
    messages: [{ role: 'user', content: 'grade this' }],
    fetchImpl: (async (_u: string, i: any) => {
      body = JSON.parse(i.body)
      return okResponse('{"score": 87, "summary": "solid"}')
    }) as any,
  })
  assert.deepEqual(body.response_format, { type: 'json_object' })
  assert.equal(out.score, 87)
  assert.equal(out.summary, 'solid')
})

test('an upstream error or timeout degrades to null, never throws', async () => {
  const errored = await callLlm({
    env: { DEEPSEEK_API_KEY: 'sk-test' },
    messages: [{ role: 'user', content: 'q' }],
    fetchImpl: (async () => ({ ok: false, status: 500, text: async () => 'boom' })) as any,
  })
  assert.equal(errored, null)

  const thrown = await callLlm({
    env: { DEEPSEEK_API_KEY: 'sk-test' },
    messages: [{ role: 'user', content: 'q' }],
    fetchImpl: (async () => { throw new Error('aborted') }) as any,
  })
  assert.equal(thrown, null)
})

/* ---------------- lenient JSON parsing ---------------- */

test('JSON wrapped in a markdown fence or prose is still parsed', () => {
  assert.equal(parseJsonLoose('{"score":10}').score, 10)
  assert.equal(parseJsonLoose('```json\n{"score":42}\n```').score, 42)
  assert.equal(parseJsonLoose('Here is my grade:\n{"score":55}\nHope that helps!').score, 55)
  // Braces inside strings must not end the object early.
  assert.equal(parseJsonLoose('{"summary":"uses {braces} inside","score":7}').score, 7)
})

test('unparseable model output yields null rather than throwing', () => {
  assert.equal(parseJsonLoose('not json at all'), null)
  assert.equal(parseJsonLoose(''), null)
  assert.equal(parseJsonLoose('{"broken": '), null)
})
