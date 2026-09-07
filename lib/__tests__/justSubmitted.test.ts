import test from 'node:test'
import assert from 'node:assert/strict'

import {
  JUST_SUBMITTED_KEY,
  JUST_SUBMITTED_TTL_MS,
  consumeJustSubmittedTicket,
  justSubmittedAt,
  markJustSubmitted,
} from '../justSubmitted.ts'

/** In-memory localStorage stand-in — only getItem/setItem/removeItem are used. */
function storage() {
  const map = new Map<string, string>()
  return {
    read: (key: string) => (map.has(key) ? map.get(key)! : null),
    write: (key: string, value: string) => void map.set(key, value),
    remove: (key: string) => void map.delete(key),
    has: (key: string) => map.has(key),
    size: () => map.size,
  }
}

test('marking a submission stores the timestamp under the shared key', () => {
  const s = storage()
  markJustSubmitted(s.write)

  assert.equal(s.has(JUST_SUBMITTED_KEY), true)
  assert.equal(justSubmittedAt(s.read) > 0, true)
})

test('a fresh ticket is consumed exactly once', () => {
  const s = storage()
  markJustSubmitted(s.write)

  assert.equal(consumeJustSubmittedTicket(s.read, s.remove), true)
  // Single-use: the second page to look (StrictMode's second effect pass, a
  // reload, the back button) must not see it again.
  assert.equal(consumeJustSubmittedTicket(s.read, s.remove), false)
  assert.equal(s.has(JUST_SUBMITTED_KEY), false)
})

test('no ticket at all means "not a fresh submission"', () => {
  const s = storage()
  assert.equal(justSubmittedAt(s.read), 0)
  assert.equal(consumeJustSubmittedTicket(s.read, s.remove), false)
  assert.equal(s.size(), 0)
})

test('an expired ticket is ignored and left alone', () => {
  const s = storage()
  s.write(JUST_SUBMITTED_KEY, String(Date.now() - JUST_SUBMITTED_TTL_MS - 1000))

  assert.equal(justSubmittedAt(s.read), 0)
  assert.equal(consumeJustSubmittedTicket(s.read, s.remove), false)
})

test('a ticket one second from expiry still counts', () => {
  const s = storage()
  s.write(JUST_SUBMITTED_KEY, String(Date.now() - (JUST_SUBMITTED_TTL_MS - 1000)))

  assert.equal(consumeJustSubmittedTicket(s.read, s.remove), true)
})

test('garbage or future-dated tickets are rejected without throwing', () => {
  for (const value of ['not-a-number', '', '-5', 'NaN', String(Date.now() + 60_000)]) {
    const s = storage()
    s.write(JUST_SUBMITTED_KEY, value)
    assert.equal(justSubmittedAt(s.read), 0, `${JSON.stringify(value)} must be ignored`)
    assert.equal(consumeJustSubmittedTicket(s.read, s.remove), false)
  }
})

test('a throwing reader degrades to "no ticket" instead of crashing the page', () => {
  const boom = () => {
    throw new Error('storage disabled')
  }
  assert.equal(justSubmittedAt(boom), 0)
  assert.equal(consumeJustSubmittedTicket(boom, () => {}), false)
})
