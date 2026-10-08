/**
 * The final submission of an assessment, kept on this device until the server has
 * confirmed that it is stored.
 *
 *   1. It is written to localStorage BEFORE the first request.
 *   2. It is removed only after the server answers that the result is stored
 *      (the server stores session + result in one transaction).
 *   3. If the tab closes or the network drops, the student dashboard resends
 *      whatever is still pending the next time it opens.
 *
 * The server's submit is idempotent (a retry returns the stored result), so
 * resending is always safe.
 */
import { authFetch } from './authFetch.ts'

const KEY = 'calibiai_pending_submissions'

export interface PendingSubmission {
  session_id: string
  body: Record<string, unknown>
  saved_at: string
}

function read(): PendingSubmission[] {
  try {
    const raw = localStorage.getItem(KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list.filter(x => x && typeof x.session_id === 'string' && x.body) : []
  } catch {
    return []
  }
}

function write(list: PendingSubmission[]): void {
  try {
    if (list.length) localStorage.setItem(KEY, JSON.stringify(list))
    else localStorage.removeItem(KEY)
  } catch {
    /* storage full or unavailable — the server copy is still attempted */
  }
}

export function loadPendingSubmissions(): PendingSubmission[] {
  return read()
}

export function queueSubmission(sessionId: string, body: Record<string, unknown>): void {
  const rest = read().filter(p => p.session_id !== sessionId)
  rest.push({ session_id: sessionId, body, saved_at: new Date().toISOString() })
  write(rest)
}

export function dequeueSubmission(sessionId: string): void {
  write(read().filter(p => p.session_id !== sessionId))
}

export interface SendOutcome {
  /** The server has the result (stored now, or already stored earlier). */
  stored: boolean
  /** Worth retrying later (network, server busy, database unavailable). */
  retryable: boolean
  status?: number
  error?: string
}

/** One attempt to deliver a final submission. */
export async function sendSubmission(sessionId: string, body: Record<string, unknown>): Promise<SendOutcome> {
  try {
    const res = await authFetch('/api/user/assessment/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      // A hung connection must not hold the submit forever: a timeout is retried.
      signal: typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(25_000) : undefined,
    })
    const data = await res.json().catch(() => ({} as any))
    if (res.ok && data?.saved) {
      dequeueSubmission(sessionId)
      return { stored: true, retryable: false, status: res.status }
    }
    // 409: the attempt is already finished (a result exists) — nothing more to send.
    if (res.status === 409) {
      dequeueSubmission(sessionId)
      return { stored: true, retryable: false, status: res.status, error: data?.error }
    }
    // 403: the attempt belongs to another account — it must not stay queued here.
    if (res.status === 403) {
      dequeueSubmission(sessionId)
      return { stored: false, retryable: false, status: res.status, error: data?.error }
    }
    // 401 keeps it queued: the student signs in again and the dashboard resends it.
    const retryable = res.status === 401 || res.status >= 500 || res.status === 429 || data?.retryable === true
    return { stored: false, retryable, status: res.status, error: data?.error }
  } catch {
    return { stored: false, retryable: true, error: 'The connection was interrupted.' }
  }
}

/**
 * Keeps trying (with a growing pause) until the server has the result, or a
 * non-retryable answer comes back. Resolves true only when the result is stored.
 */
export async function sendUntilStored(
  sessionId: string,
  body: Record<string, unknown>,
  options: { attempts?: number; initialDelayMs?: number; maxDelayMs?: number } = {},
): Promise<boolean> {
  const attempts = options.attempts ?? 12
  const maxDelay = options.maxDelayMs ?? 15_000
  let delay = options.initialDelayMs ?? 1_500
  for (let i = 0; i < attempts; i++) {
    const outcome = await sendSubmission(sessionId, body)
    if (outcome.stored) return true
    if (!outcome.retryable) return false
    await new Promise(resolve => setTimeout(resolve, delay))
    delay = Math.min(delay * 2, maxDelay)
  }
  return false
}

/** Resends everything still pending (the dashboard does this on open). */
export async function flushPendingSubmissions(): Promise<number> {
  let stored = 0
  for (const entry of loadPendingSubmissions()) {
    const outcome = await sendSubmission(entry.session_id, entry.body)
    if (outcome.stored) stored++
  }
  return stored
}
