import test from 'node:test'
import assert from 'node:assert/strict'
import { runTests } from '../runTests.ts'

test('the JavaScript harness can test lexical const declarations and ignores console output', async () => {
  const result = await runTests('CG3', `
const firstPos = (values, key) => {
  let low = 0, high = values.length - 1, answer = -1
  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    if (values[mid] === key) { answer = mid; high = mid - 1 }
    else if (values[mid] < key) low = mid + 1
    else high = mid - 1
  }
  return answer
}
console.log('candidate debug output should not break the test JSON')
`)
  assert.equal(result.passed, 6)
  assert.equal(result.total, 6)
  assert.equal(result.error, undefined)
})

test('the Python harness captures candidate print output and supports fenced code', async () => {
  const result = await runTests('CG1', `\`\`\`python
print('setup message')
def first_repeated(s):
    counts = {}
    for ch in s:
        counts[ch] = counts.get(ch, 0) + 1
    for ch in s:
        if counts[ch] == 2:
            return ch
    return ''
\`\`\``)
  assert.equal(result.passed, 6)
  assert.equal(result.total, 6)
})

test('Python and JavaScript task suites accept reference implementations with exact totals', async () => {
  const references: Array<{ taskId: string; code: string; expected: number }> = [
    {
      taskId: 'AD1',
      expected: 6,
      code: `def paginate(items, page, size):
    if not isinstance(items, (list, tuple)) or page < 1 or size <= 0:
        return []
    start = (page - 1) * size
    if start >= len(items):
        return []
    return list(items[start:start + size])`,
    },
    {
      taskId: 'AD3',
      expected: 5,
      code: `def remove_inactive(users):
    if not isinstance(users, list):
        return []
    return [user for user in users if user.get('active') is not False]`,
    },
    {
      taskId: 'CG2',
      expected: 6,
      code: `def rotate(values, k):
    if not values:
        return []
    k %= len(values)
    return list(values[-k:]) + list(values[:-k]) if k else list(values)`,
    },
    {
      taskId: 'CG4',
      expected: 7,
      code: `const mergeIntervals = (intervals) => {
  const sorted = intervals.map(([start, end]) => [start, end]).sort((a, b) => a[0] - b[0])
  const merged = []
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1]
    if (last && start <= last[1]) last[1] = Math.max(last[1], end)
    else merged.push([start, end])
  }
  return merged
}`,
    },
  ]

  for (const sample of references) {
    const result = await runTests(sample.taskId, sample.code)
    assert.equal(result.total, sample.expected, `${sample.taskId} total`)
    assert.equal(result.passed, sample.expected, `${sample.taskId} reference solution`)
  }
})

test('the async cache harness can access const functions and catches falsey-cache bugs', async () => {
  const code = `const cache = new Map()
const get = async (key, fetcher) => {
  if (cache.has(key)) return cache.get(key)
  const pending = Promise.resolve().then(fetcher).catch((error) => { cache.delete(key); throw error })
  cache.set(key, pending)
  return pending
}`
  const result = await runTests('AD2', code)
  assert.equal(result.passed, 6)
  assert.equal(result.total, 6)
})

test('the rate-limiter lab now checks expiry and Express middleware', async () => {
  const code = `const buckets = new Map()
function isAllowed(userId, maxRequests = 5, windowMs = 60000) {
  const now = Date.now()
  const recent = (buckets.get(userId) || []).filter((time) => now - time < windowMs)
  if (recent.length >= maxRequests) { buckets.set(userId, recent); return false }
  recent.push(now)
  buckets.set(userId, recent)
  return true
}
function rateLimitMiddleware(req, res, next) {
  const userId = req.ip || req.headers['x-user-id'] || 'anonymous'
  const windowMs = 60000
  if (isAllowed(userId, 5, windowMs)) return next()
  const retryAfter = Math.ceil(windowMs / 1000)
  res.setHeader('Retry-After', retryAfter)
  return res.status(429).json({ error: 'Too Many Requests' })
}`
  const result = await runTests('AF1', code)
  assert.equal(result.passed, 8)
  assert.equal(result.total, 8)
})

test('syntax errors fail the known suite instead of returning an unexplained 0/0', async () => {
  const result = await runTests('CG4', 'function mergeIntervals( {')
  assert.equal(result.passed, 0)
  assert.equal(result.total, 7)
  assert.match(result.error || '', /failed to run/i)
})

test('empty and unknown submissions return honest counts', async () => {
  const empty = await runTests('CG1', '')
  assert.equal(empty.total, 6)
  assert.equal(empty.passed, 0)
  assert.match(empty.error || '', /no code/i)

  const unknown = await runTests('MISSING', 'function f() {}')
  assert.equal(unknown.total, 0)
  assert.match(unknown.error || '', /unknown task/i)
})
