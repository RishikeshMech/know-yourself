import test from 'node:test'
import assert from 'node:assert/strict'
import { chatWithAssistant } from '../aiAssistant.ts'

test('aiAssistant: generates root-cause explanation for AD1 pagination task', async () => {
  const res = await chatWithAssistant({
    taskId: 'AD1',
    taskTitle: 'Python — Off-by-one in pagination',
    taskPrompt: 'Fix pagination so page=1 returns the first page',
    buggyOrSpec: 'def paginate(items, page, size): ...',
    currentCode: '',
    messages: [{ role: 'user', content: 'Explain the root cause of this bug' }],
  })

  assert.equal(res.engine, 'heuristic')
  assert.ok(res.reply.includes('0-based') || res.reply.includes('Off-by-one') || res.reply.includes('page - 1'))
  assert.equal('suggestions' in res, false)
})

test('aiAssistant: explains Promise caching and race conditions for AD2', async () => {
  const res = await chatWithAssistant({
    taskId: 'AD2',
    taskTitle: 'JavaScript — Race condition / duplicate fetches',
    taskPrompt: 'Fix so concurrent calls fetch exactly once',
    buggyOrSpec: 'const cache = {}; ...',
    currentCode: '',
    messages: [{ role: 'user', content: 'How do I prevent race conditions with promise caching?' }],
  })

  assert.equal(res.engine, 'heuristic')
  assert.ok(res.reply.includes('Promise') || res.reply.includes('cache') || res.reply.includes('fetcher'))
})

test('aiAssistant: provides list comprehension fix for AD3 list mutation', async () => {
  const res = await chatWithAssistant({
    taskId: 'AD3',
    taskTitle: 'Python — Mutating a list while iterating',
    taskPrompt: 'Rewrite so every inactive user is removed safely',
    buggyOrSpec: 'def remove_inactive(users): ...',
    currentCode: '',
    messages: [{ role: 'user', content: 'Show me the solution with list comprehension' }],
  })

  assert.equal(res.engine, 'heuristic')
  assert.ok(res.reply.includes('remove_inactive'))
  assert.ok(res.reply.includes('active'))
})

test('aiAssistant: explains sliding window and express middleware for AF1', async () => {
  const res = await chatWithAssistant({
    taskId: 'AF1',
    taskTitle: 'Feature: Build a sliding-window rate limiter',
    taskPrompt: 'Implement isAllowed and Express middleware with 429',
    buggyOrSpec: 'isAllowed(userId) ...',
    currentCode: '',
    messages: [{ role: 'user', content: 'How do I implement the rate limiter and 429 response?' }],
  })

  assert.equal(res.engine, 'heuristic')
  assert.ok(res.reply.includes('isAllowed'))
  assert.ok(res.reply.includes('429') || res.reply.includes('Retry-After'))
})

test('aiAssistant: continues to answer after an earlier successful response', async () => {
  const first = await chatWithAssistant({
    taskId: 'AD1',
    messages: [{ role: 'user', content: 'Explain the root cause' }],
  })
  const second = await chatWithAssistant({
    taskId: 'AD1',
    messages: [
      { role: 'user', content: 'Explain the root cause' },
      { role: 'assistant', content: first.reply },
      { role: 'user', content: 'Which boundary cases should I check?' },
    ],
  })
  assert.ok(second.reply.includes('page') || second.reply.includes('Edge Cases'))
  assert.ok(second.reply.length > 30)

  const followUp = await chatWithAssistant({
    taskId: 'CG4',
    messages: [
      { role: 'user', content: 'I need help' },
      { role: 'assistant', content: 'What behavior are you trying to understand?' },
      { role: 'user', content: 'Why must I copy the intervals before sorting?' },
    ],
  })
  assert.match(followUp.reply, /mutat|copy/i)
})

test('aiAssistant: reviews user draft code and gives feedback', async () => {
  const draftCode = `def paginate(items, page, size):
    start = (page - 1) * size
    end = start + size
    return items[start:end]`

  const res = await chatWithAssistant({
    taskId: 'AD1',
    taskTitle: 'Python — Off-by-one in pagination',
    taskPrompt: 'Fix pagination so page=1 returns the first page',
    buggyOrSpec: 'def paginate(items, page, size): ...',
    currentCode: draftCode,
    messages: [{ role: 'user', content: 'Please review my draft code' }],
  })

  assert.equal(res.engine, 'heuristic')
  assert.ok(res.reply.includes('Review of your draft code') || res.reply.includes('index calculation'))
})
