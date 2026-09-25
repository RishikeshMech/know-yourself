import test from 'node:test'
import assert from 'node:assert/strict'
import { JsonApiError, postJsonWithRetry } from '../clientApi.ts'

const jsonResponse = (status: number, value: unknown) => new Response(JSON.stringify(value), {
  status,
  headers: { 'Content-Type': 'application/json' },
})

test('postJsonWithRetry recovers from a transient network failure', async () => {
  let calls = 0
  const result = await postJsonWithRetry<{ ok: boolean }>('/api/test', { value: 1 }, {
    retries: 1,
    fetchImpl: (async (_url: any, init: any) => {
      calls++
      assert.equal(init.method, 'POST')
      assert.deepEqual(JSON.parse(init.body), { value: 1 })
      if (calls === 1) throw new TypeError('temporary network failure')
      return jsonResponse(200, { ok: true })
    }) as typeof fetch,
  })
  assert.equal(calls, 2)
  assert.equal(result.data.ok, true)
})

test('postJsonWithRetry retries a 5xx response but not a client error', async () => {
  let calls = 0
  const result = await postJsonWithRetry<{ ok: boolean }>('/api/test', {}, {
    retries: 1,
    fetchImpl: (async () => {
      calls++
      return calls === 1 ? jsonResponse(503, { error: 'warming up' }) : jsonResponse(200, { ok: true })
    }) as typeof fetch,
  })
  assert.equal(result.data.ok, true)
  assert.equal(calls, 2)

  calls = 0
  await assert.rejects(() => postJsonWithRetry('/api/test', {}, {
    retries: 1,
    fetchImpl: (async () => { calls++; return jsonResponse(429, { error: 'slow down' }) }) as typeof fetch,
  }), (error: unknown) => error instanceof JsonApiError && error.status === 429)
  assert.equal(calls, 1, 'rate limits should not be retried')
})

test('postJsonWithRetry reports malformed successful responses clearly', async () => {
  await assert.rejects(() => postJsonWithRetry('/api/test', {}, {
    retries: 0,
    fetchImpl: (async () => new Response('<html>not json</html>', { status: 200 })) as typeof fetch,
  }), /invalid response/i)
})
