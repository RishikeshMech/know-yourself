/**
 * Listening clip play-count rule.
 *
 * Each listening clip can be listened to from the start up to a limited number
 * of times. Seeking / skipping within a clip fires a fresh `play` event on the
 * <audio> element, which the old code miscounted as a new listen. A listen
 * should only be consumed when playback actually starts from the beginning —
 * resuming or seeking mid-clip continues the same listen and must not count.
 */

export const LISTENING_MAX_PLAYS = 2

/**
 * True when starting playback should consume one of the clip's listens.
 * A value just over 0 tolerates browsers that report a tiny offset on the
 * very first play; anything further in means the candidate is resuming or
 * seeking within a clip they have already started.
 */
export function shouldCountListeningPlay(currentTime: number, plays: number, maxPlays = LISTENING_MAX_PLAYS): boolean {
  if (plays >= maxPlays) return false
  return currentTime <= 0.5
}
