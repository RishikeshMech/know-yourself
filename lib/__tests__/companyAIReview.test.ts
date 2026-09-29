import test from 'node:test'
import assert from 'node:assert/strict'
import { loadBank } from '../company/bank.ts'
import { reviewCodingAnswer, reviewWrittenAnswer } from '../company/aiReview.ts'
import type { CodingQuestion, WrittenQuestion } from '../company/types.ts'

const bank = loadBank()
const coding = bank.byId.get('s3-c-subarray-sum-equals-k') as CodingQuestion
const written = bank.questions.find(
  (question): question is WrittenQuestion => question.kind === 'written' && question.base.startsWith('Explain the difference between a process and a thread') && !question.angle,
)!
const strongWrittenAnswer = `A process is an independent program in execution with its own address space, while a thread is a
lightweight unit of execution inside a process. Threads share memory and resources such as the heap and open files,
so they communicate through shared variables, whereas processes need IPC mechanisms like pipes, sockets or message
passing. Creating a thread and context switching between threads is cheaper because there is less overhead.
However, sharing memory introduces race conditions, so threads need synchronization with a mutex, lock or semaphore.
For example, a browser runs each tab as a separate process for fault isolation: if one tab crashes it does not bring
down the process of another tab, while a web server may use a pool of threads to handle requests efficiently.`

test('on-demand coding review calls DeepSeek with the prompt, candidate code, and no hidden tests or solution', async () => {
  const saved = { calibi: process.env.CALIBIAI_API_KEY, deepseek: process.env.DEEPSEEK_API_KEY, fetch: globalThis.fetch }
  const requests: Array<{ url: string; authorization: string; body: any }> = []
  process.env.CALIBIAI_API_KEY = ''
  process.env.DEEPSEEK_API_KEY = 'test-deepseek-key'
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({
      url: String(input),
      authorization: new Headers(init?.headers).get('Authorization') || '',
      body: JSON.parse(String(init?.body || '{}')),
    })
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ score: 88, strengths: ['Uses prefix sums', 'Counts prior prefixes'], improvements: ['Discuss complexity'], summary: 'The solution uses the right linear-time pattern.' }) } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch
  try {
    const result = await reviewCodingAnswer(coding, 'function subarraySum(nums, k) { return 0 }', 'javascript')
    assert.equal(result.engine, 'deepseek')
    assert.equal(result.score, 88)
    assert.equal(result.strengths.length, 2)
    assert.equal(requests.length, 1)
    assert.match(requests[0].url, /chat\/completions$/)
    assert.equal(requests[0].authorization, 'Bearer test-deepseek-key')
    assert.equal(requests[0].body.model, 'deepseek-chat')
    assert.equal(requests[0].body.response_format.type, 'json_object')
    const prompt = requests[0].body.messages.map((message: any) => String(message.content)).join('\n')
    assert.match(prompt, /Subarray Sum Equals K/)
    assert.match(prompt, /function subarraySum/)
    assert.match(String(requests[0].body.messages[0].content), /untrusted/i)
    assert.doesNotMatch(prompt, /"tests"|"expected"|"solution"/)
  } finally {
    globalThis.fetch = saved.fetch
    if (saved.calibi === undefined) delete process.env.CALIBIAI_API_KEY
    else process.env.CALIBIAI_API_KEY = saved.calibi
    if (saved.deepseek === undefined) delete process.env.DEEPSEEK_API_KEY
    else process.env.DEEPSEEK_API_KEY = saved.deepseek
  }
})

test('on-demand written review sends the design answer and returns bounded rubric feedback', async () => {
  const saved = { calibi: process.env.CALIBIAI_API_KEY, deepseek: process.env.DEEPSEEK_API_KEY, fetch: globalThis.fetch }
  const requests: Array<{ body: any }> = []
  process.env.CALIBIAI_API_KEY = ''
  process.env.DEEPSEEK_API_KEY = 'test-deepseek-key'
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ body: JSON.parse(String(init?.body || '{}')) })
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ score: 92, strengths: ['Explains isolation', 'Uses a concrete example', 'Mentions synchronization', 'Compares IPC', 'Extra item'], improvements: ['Discuss process startup cost'], summary: 'Clear comparison with a relevant example.' }) } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch
  try {
    const result = await reviewWrittenAnswer(written, strongWrittenAnswer)
    assert.equal(result.engine, 'deepseek')
    assert.equal(result.score, 92)
    assert.equal(result.strengths.length, 4)
    assert.ok(requests.length > 0)
    const prompt = requests[0].body.messages.map((message: any) => String(message.content)).join('\n')
    assert.match(prompt, /Rubric/)
    assert.match(prompt, /Candidate answer/)
    assert.match(prompt, /synchronization/)
    assert.doesNotMatch(prompt, /"tests"|"solution"/)
  } finally {
    globalThis.fetch = saved.fetch
    if (saved.calibi === undefined) delete process.env.CALIBIAI_API_KEY
    else process.env.CALIBIAI_API_KEY = saved.calibi
    if (saved.deepseek === undefined) delete process.env.DEEPSEEK_API_KEY
    else process.env.DEEPSEEK_API_KEY = saved.deepseek
  }
})

test('on-demand coding review falls back honestly when DeepSeek is not configured', async () => {
  const saved = { calibi: process.env.CALIBIAI_API_KEY, deepseek: process.env.DEEPSEEK_API_KEY }
  delete process.env.CALIBIAI_API_KEY
  delete process.env.DEEPSEEK_API_KEY
  try {
    const result = await reviewCodingAnswer(coding, 'function subarraySum(nums, k) { return 0 }', 'javascript')
    assert.equal(result.engine, 'heuristic')
    assert.equal(result.score, null)
    assert.match(result.summary, /not configured/)
  } finally {
    if (saved.calibi === undefined) delete process.env.CALIBIAI_API_KEY
    else process.env.CALIBIAI_API_KEY = saved.calibi
    if (saved.deepseek === undefined) delete process.env.DEEPSEEK_API_KEY
    else process.env.DEEPSEEK_API_KEY = saved.deepseek
  }
})
