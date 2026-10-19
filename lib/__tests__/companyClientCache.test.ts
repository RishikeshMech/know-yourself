import test from 'node:test'
import assert from 'node:assert/strict'
import {
  saveCompanyResultCache,
  getCompanyResultCache,
  getCompanyAttemptsCache,
  saveCompanyAttemptsCache,
} from '../company/client.ts'
import type { AttemptSummary } from '../company/types.ts'
import type { PublicResult } from '../company/scoring.ts'

// Provide a mock window and storage
class MockStorage {
  private store = new Map<string, string>()
  getItem(k: string) { return this.store.get(k) ?? null }
  setItem(k: string, v: string) { this.store.set(k, String(v)) }
  removeItem(k: string) { this.store.delete(k) }
  clear() { this.store.clear() }
}

test('company result cache saves and retrieves attempt and result', () => {
  const origWindow = globalThis.window
  const origSession = (globalThis as any).sessionStorage
  const origLocal = (globalThis as any).localStorage

  const mockSession = new MockStorage()
  const mockLocal = new MockStorage()
  let dispatchedEvent: any = null

  ;(globalThis as any).window = {
    dispatchEvent: (e: any) => { dispatchedEvent = e; return true },
  }
  ;(globalThis as any).sessionStorage = mockSession
  ;(globalThis as any).localStorage = mockLocal

  try {
    const attempt: AttemptSummary = {
      company: 'infosys',
      status: 'submitted',
      started_at: new Date().toISOString(),
      expires_at: new Date().toISOString(),
      submitted_at: new Date().toISOString(),
      score: 85,
      verdict: 'ready',
      auto_submitted: false,
    }
    const result: PublicResult = {
      score: 85,
      total: 100,
      verdict: 'ready',
      verdictLabel: 'Interview ready',
      answered: 10,
      gradedAt: new Date().toISOString(),
      rounds: [],
      sections: [],
      topics: [],
      areas: [],
      items: [],
      graders: { written: 'calibiai', coding: 'python' },
    }

    saveCompanyResultCache('infosys', attempt, result)

    const cached = getCompanyResultCache('infosys')
    assert.ok(cached)
    assert.equal(cached.attempt.company, 'infosys')
    assert.equal(cached.attempt.score, 85)
    assert.equal(cached.result?.score, 85)
    assert.ok(dispatchedEvent)
    assert.equal(dispatchedEvent.detail.company, 'infosys')

    const attemptsList = getCompanyAttemptsCache()
    assert.equal(attemptsList.length, 1)
    assert.equal(attemptsList[0].company, 'infosys')
    assert.equal(attemptsList[0].score, 85)

    // Updating same company updates existing entry without duplication
    const updatedAttempt: AttemptSummary = { ...attempt, score: 90 }
    saveCompanyResultCache('infosys', updatedAttempt, result)
    const listAfterUpdate = getCompanyAttemptsCache()
    assert.equal(listAfterUpdate.length, 1)
    assert.equal(listAfterUpdate[0].score, 90)
  } finally {
    ;(globalThis as any).window = origWindow
    ;(globalThis as any).sessionStorage = origSession
    ;(globalThis as any).localStorage = origLocal
  }
})
