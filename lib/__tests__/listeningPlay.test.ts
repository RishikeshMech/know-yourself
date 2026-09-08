import test from 'node:test'
import assert from 'node:assert/strict'

import { shouldCountListeningPlay, LISTENING_MAX_PLAYS } from '../listeningPlay.ts'

test('listening plays are only counted when starting from the beginning', () => {
  assert.equal(LISTENING_MAX_PLAYS, 2)
  // Fresh starts count.
  assert.equal(shouldCountListeningPlay(0, 0), true)
  assert.equal(shouldCountListeningPlay(0.2, 0), true)
  assert.equal(shouldCountListeningPlay(0, 1), true)
  // Resuming / seeking within a clip does NOT count.
  assert.equal(shouldCountListeningPlay(1.1, 0), false)
  assert.equal(shouldCountListeningPlay(30, 0), false)
  assert.equal(shouldCountListeningPlay(120, 1), false)
  // At / past the limit nothing counts.
  assert.equal(shouldCountListeningPlay(0, 2), false)
  assert.equal(shouldCountListeningPlay(0, 5), false)
})
