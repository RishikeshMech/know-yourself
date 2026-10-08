import test from 'node:test'
import assert from 'node:assert/strict'

// The outbox runs in the browser; provide the two globals it touches.
const store = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, String(v)) },
  removeItem: (k: string) => { store.delete(k) },
}
let replies: Array<() => Response> = []
const calls: Array<{ url: string; init: any }> = []
;(globalThis as any).fetch = async (url: string, init: any) => {
  calls.push({ url: String(url), init })
  const next = replies.shift()
  if (!next) throw new Error('no reply queued')
  return next()
}
const reply = (status: number, body: unknown = {}) => () =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const outbox = await import('../submissionOutbox.ts')
const BODY = { session_id: 's-1', answers: { Q1: 'a' }, scores: { total: 612 } }

function reset() {
  store.clear()
  replies = []
  calls.length = 0
}

test('a final submission is kept on the device until it is queued and removed once stored', async () => {
  reset()
  outbox.queueSubmission('s-1', BODY)
  assert.equal(outbox.loadPendingSubmissions().length, 1)
  replies = [reply(200, { saved: true, result: { total: 612 } })]
  assert.equal(await outbox.sendUntilStored('s-1', BODY, { attempts: 1, initialDelayMs: 1 }), true)
  assert.equal(outbox.loadPendingSubmissions().length, 0, 'stored submissions leave the device queue')
  assert.equal(calls[0].url, '/api/user/assessment/submit')
  assert.equal(calls[0].init.method, 'POST')
})

test('transient failures are retried until the server stores the result', async () => {
  reset()
  outbox.queueSubmission('s-1', BODY)
  replies = [reply(503, { error: 'busy', retryable: true }), reply(500), reply(200, { saved: true })]
  assert.equal(await outbox.sendUntilStored('s-1', BODY, { attempts: 5, initialDelayMs: 1, maxDelayMs: 2 }), true)
  assert.equal(calls.length, 3)
  assert.equal(outbox.loadPendingSubmissions().length, 0)
})

test('a 403 (attempt belongs to another account) is not retried and is not kept queued', async () => {
  reset()
  outbox.queueSubmission('s-1', BODY)
  replies = [reply(403, { error: 'This attempt belongs to a different account.' })]
  assert.equal(await outbox.sendUntilStored('s-1', BODY, { attempts: 5, initialDelayMs: 1 }), false)
  assert.equal(calls.length, 1)
  assert.equal(outbox.loadPendingSubmissions().length, 0)
})

test('a 401 keeps the submission queued for after the student signs in again', async () => {
  reset()
  outbox.queueSubmission('s-1', BODY)
  replies = [reply(401, { error: 'Your session has expired' })]
  assert.equal(await outbox.sendUntilStored('s-1', BODY, { attempts: 1, initialDelayMs: 1 }), false)
  assert.equal(outbox.loadPendingSubmissions().length, 1)
})

test('a 409 means the attempt is already finished: it counts as stored', async () => {
  reset()
  outbox.queueSubmission('s-1', BODY)
  replies = [reply(409, { error: 'This assessment was already submitted.' })]
  assert.equal(await outbox.sendUntilStored('s-1', BODY, { attempts: 1, initialDelayMs: 1 }), true)
  assert.equal(outbox.loadPendingSubmissions().length, 0)
})

test('the dashboard flush resends what is pending and keeps what still fails', async () => {
  reset()
  outbox.queueSubmission('s-1', { session_id: 's-1', scores: {} })
  outbox.queueSubmission('s-2', { session_id: 's-2', scores: {} })
  replies = [reply(200, { saved: true }), reply(503, { retryable: true })]
  assert.equal(await outbox.flushPendingSubmissions(), 1)
  const left = outbox.loadPendingSubmissions().map(p => p.session_id)
  assert.deepEqual(left, ['s-2'])
})
