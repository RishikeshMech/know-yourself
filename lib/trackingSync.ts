/**
 * WhatsApp / LinkedIn follow steps. The step is recorded in the browser at once
 * (so the flow continues), and written to Supabase with a few retries. If the
 * write still fails, the local flag remains and the student dashboard sends the
 * step again the next time it opens. The server's write is idempotent (one row per
 * student and action), so resending is always safe.
 */
import { authFetch } from './authFetch.ts'

export type TrackingAction = 'join_whatsapp' | 'follow_linkedin'

/** Writes one step. True when the server stored it. */
export async function recordTrackingStep(userId: string, action: TrackingAction, attempts = 3): Promise<boolean> {
  let delay = 800
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await authFetch('/api/user/tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, action, completed: true }),
        signal: typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(15_000) : undefined,
      })
      if (res.ok) return true
      // Refused for a reason that retrying will not change (not signed in, wrong account).
      if (res.status < 500 && res.status !== 429) return false
    } catch {
      /* network — retried below */
    }
    if (i < attempts - 1) await new Promise(resolve => setTimeout(resolve, delay))
    delay *= 2
  }
  return false
}

/** Sends any step the browser has recorded (dashboard on open). Safe to repeat. */
export async function syncTrackingSteps(userId: string, tracking: { whatsapp?: boolean; linkedin?: boolean } | null | undefined): Promise<void> {
  if (!userId || !tracking) return
  if (tracking.whatsapp) await recordTrackingStep(userId, 'join_whatsapp', 1)
  if (tracking.linkedin) await recordTrackingStep(userId, 'follow_linkedin', 1)
}
