/**
 * The single-use "this candidate just finished the assessment" ticket.
 *
 * `/assessment` writes it a moment before navigating away; the student
 * dashboard reads it to show the "assessment complete" banner, and `/result`
 * reads it to decide whether a full report may be shown. Keeping the key, the
 * TTL and the read-and-clear semantics in one module means every call site
 * agrees on what "just submitted" means — three copies of this logic used to
 * disagree (different key names / TTLs), which is how a freshly submitted
 * candidate ended up bounced off their own report.
 *
 * Readers/writers are injected so the same code runs against `localStorage` in
 * the browser and against a plain object in tests (or on the server, where
 * `localStorage` does not exist).
 */

export const JUST_SUBMITTED_KEY = 'calibiai_just_submitted'

/** How long the ticket stays valid after a submission (10 minutes). */
export const JUST_SUBMITTED_TTL_MS = 10 * 60 * 1000

export type TicketRead = (key: string) => string | null
export type TicketWrite = (key: string, value: string) => void
export type TicketRemove = (key: string) => void

/** Storage helpers that never throw (private mode / SSR / disabled storage). */
function safeRead(key: string): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeWrite(key: string, value: string): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    window.localStorage.setItem(key, value)
  } catch {
    /* storage unavailable — the ticket is a nicety, not a requirement */
  }
}

function safeRemove(key: string): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    window.localStorage.removeItem(key)
  } catch {
    /* nothing to clean up */
  }
}

/** Called by `/assessment` right before it navigates to the dashboard. */
export function markJustSubmitted(write: TicketWrite = safeWrite): void {
  write(JUST_SUBMITTED_KEY, String(Date.now()))
}

/**
 * Timestamp of a still-valid ticket, or `0` when there is none (missing,
 * unreadable, in the future, or older than the TTL). Does NOT clear it.
 */
export function justSubmittedAt(read: TicketRead = safeRead): number {
  let raw: string | null = null
  try {
    raw = read(JUST_SUBMITTED_KEY)
  } catch {
    return 0
  }
  if (raw === null || raw === undefined) return 0
  const ts = Number(raw)
  if (!Number.isFinite(ts) || ts <= 0) return 0
  const age = Date.now() - ts
  return age >= 0 && age < JUST_SUBMITTED_TTL_MS ? ts : 0
}

/**
 * Reads the ticket and clears it in the same call, so at most one page ever
 * reacts to a single submission. Returns `true` only for a fresh submission.
 */
export function consumeJustSubmittedTicket(
  read: TicketRead = safeRead,
  remove: TicketRemove = safeRemove,
): boolean {
  const ts = justSubmittedAt(read)
  if (!ts) return false
  try {
    remove(JUST_SUBMITTED_KEY)
  } catch {
    /* Not clearing it only means the next page may greet the candidate again. */
  }
  return true
}
