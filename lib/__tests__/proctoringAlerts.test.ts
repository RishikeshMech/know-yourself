import test from 'node:test'
import assert from 'node:assert/strict'

/**
 * End-to-end proctoring simulations: NO native browser alert may ever produce
 * a proctoring warning, while real violations must — and the warning budget is
 * sticky per attempt (a reload/back-navigation can never reset it).
 *
 * The Harness below mirrors the exact decision pipeline both live runners
 * (components/AssessmentRunner.tsx and components/company/useProctoring.ts)
 * wire up: prompt guard → classifyFocusSignal → deferred re-checks →
 * resolveDeferredFocus / resolveFullscreenExit → coalescing cooldown →
 * auto-submit at MAX_FOCUS_STRIKES. The event sequences are the same ones a
 * real browser produces around “Allow fullscreen”, “Allow microphone”,
 * “Allow camera” and cookie/storage dialogs.
 */
import {
  MAX_FOCUS_STRIKES,
  STRIKE_COOLDOWN_MS,
  PROMPT_GUARD_TRAILING_MS,
  FOCUS_STRIKE_GRACE_MS,
  classifyFocusSignal,
  resolveDeferredFocus,
  resolveFullscreenExit,
  restoredStrikes,
  shouldTerminateOnRestore,
  resolveScreenFacts,
} from '../proctoring.ts'

/* ------------------------------------------------------------------ */
/* Simulated live attempt (injectable clock)                           */
/* ------------------------------------------------------------------ */

type Timer = { at: number; fn: () => void }

class Harness {
  now = 0
  hidden = false
  focused = true
  fullscreen = true
  suppressUntil = -1
  away = false
  strikes = 0
  terminated = false
  autoSubmitReason: string | null = null
  lastStrikeAt = -Infinity
  pendingFocus: { checks: number } | null = null
  pendingFs: { checks: number } | null = null
  timers: Timer[] = []

  get suppressed() { return this.now < this.suppressUntil }

  /* Native prompt lifecycle: open → user answers (Allow or Block). */
  openPrompt() { this.suppressUntil = Infinity; this.focused = false }
  answerPrompt({ dropFullscreen = false }: { dropFullscreen?: boolean } = {}) {
    // The answer burst: focus returns, sometimes a trailing fullscreen dip.
    this.suppressUntil = this.now + PROMPT_GUARD_TRAILING_MS
    this.focused = true
    if (dropFullscreen) {
      this.fullscreen = false
      this.onFullscreenChange()
    }
  }

  schedule(delay: number, fn: () => void) {
    this.timers.push({ at: this.now + delay, fn })
  }

  tick(ms: number) {
    const end = this.now + ms
    for (;;) {
      const due = this.timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0]
      if (!due) break
      this.timers = this.timers.filter((t) => t !== due)
      this.now = due.at
      due.fn()
    }
    this.now = end
  }

  recordStrike() {
    if (this.terminated || this.suppressed) return false
    if (this.now - this.lastStrikeAt < STRIKE_COOLDOWN_MS) return false
    this.lastStrikeAt = this.now
    this.away = true
    this.strikes += 1
    if (this.strikes >= MAX_FOCUS_STRIKES) {
      this.terminated = true
      this.autoSubmitReason = `You reached ${MAX_FOCUS_STRIKES} focus warnings`
    }
    return true
  }

  /* ----- the runners' signal pipeline ----- */
  handleFocusSignal() {
    const verdict = classifyFocusSignal({
      active: true,
      terminated: this.terminated,
      suppress: this.suppressed,
      away: this.away || !!this.pendingFocus,
      hidden: this.hidden,
      focused: this.focused,
    })
    if (verdict === 'ignore') return
    if (verdict === 'strike_now') { this.recordStrike(); return }
    this.pendingFocus = this.pendingFocus || { checks: 0 }
    this.schedule(FOCUS_STRIKE_GRACE_MS, () => this.focusRecheck())
  }

  focusRecheck() {
    const pending = this.pendingFocus
    if (!pending) return
    const verdict = resolveDeferredFocus({
      suppress: this.suppressed,
      hidden: this.hidden,
      focused: this.focused,
      checks: pending.checks,
    })
    if (verdict === 'cancel') { this.pendingFocus = null; return }
    if (verdict === 'recheck') {
      pending.checks += 1
      this.schedule(FOCUS_STRIKE_GRACE_MS, () => this.focusRecheck())
      return
    }
    this.pendingFocus = null
    this.recordStrike()
  }

  onFullscreenChange() {
    if (this.fullscreen) { this.pendingFs = null; return }
    if (this.suppressed) return
    if (!this.focused && !this.hidden) {
      this.pendingFs = this.pendingFs || { checks: 0 }
      this.schedule(FOCUS_STRIKE_GRACE_MS, () => this.fsRecheck())
      return
    }
    this.recordStrike()
  }

  fsRecheck() {
    const pending = this.pendingFs
    if (!pending) return
    const verdict = resolveFullscreenExit({
      suppress: this.suppressed,
      fullscreen: this.fullscreen,
      focused: this.focused,
      hidden: this.hidden,
      checks: pending.checks,
    })
    if (verdict === 'cancel') { this.pendingFs = null; return }
    if (verdict === 'recheck') {
      pending.checks += 1
      this.schedule(FOCUS_STRIKE_GRACE_MS, () => this.fsRecheck())
      return
    }
    this.pendingFs = null
    this.recordStrike()
  }

  /* ----- DOM-ish events ----- */
  windowBlur() { this.focused = false; this.handleFocusSignal() }
  windowFocus() {
    this.focused = true
    if (this.pendingFocus && !this.hidden) this.pendingFocus = null
  }
  tabHidden() { this.hidden = true; this.handleFocusSignal() }
  tabVisible() { this.hidden = false; this.handleFocusSignal() }
  exitFullscreen() { this.fullscreen = false; this.onFullscreenChange() }
  enterFullscreen() { this.fullscreen = true; this.onFullscreenChange() }
}

/* ------------------------------------------------------------------ */
/* 1. Native system alerts must NEVER generate warnings                */
/* ------------------------------------------------------------------ */

test('e2e: “Allow fullscreen” at the gate generates zero warnings', () => {
  const h = new Harness()
  h.openPrompt()                       // browser shows the fullscreen prompt
  h.windowBlur()
  h.tick(500)
  h.answerPrompt({ dropFullscreen: true })  // some browsers dip fullscreen
  h.enterFullscreen()                  // prompt answered → fullscreen engaged
  h.tick(PROMPT_GUARD_TRAILING_MS + FOCUS_STRIKE_GRACE_MS * 4)
  assert.equal(h.strikes, 0)
  assert.equal(h.terminated, false)
})

test('e2e: “Allow camera” / “Allow microphone” mid-test generates zero warnings', () => {
  const h = new Harness()
  h.tick(1000)
  h.openPrompt()                       // getUserMedia pops the permission alert
  h.windowBlur()
  h.tick(2000)                         // user reads the prompt for 2s
  h.answerPrompt({ dropFullscreen: true })  // clicks Allow; Safari-style dip
  h.tick(PROMPT_GUARD_TRAILING_MS / 2)
  h.enterFullscreen()
  h.tick(PROMPT_GUARD_TRAILING_MS + FOCUS_STRIKE_GRACE_MS * 4)
  assert.equal(h.strikes, 0, 'every signal around the prompt must be absorbed')
  assert.equal(h.terminated, false)
})

test('e2e: “Allow microphone” with the prompt open across strike windows generates zero warnings', () => {
  const h = new Harness()
  h.openPrompt()
  h.windowBlur()
  // Even 30s of reading the prompt must never fire a deferred strike: the
  // prompt guard stays armed for as long as the request is pending.
  h.tick(30_000)
  assert.equal(h.strikes, 0)
  h.answerPrompt()
  h.tick(PROMPT_GUARD_TRAILING_MS + FOCUS_STRIKE_GRACE_MS * 4)
  assert.equal(h.strikes, 0)
})

test('e2e: a cookie/storage dialog that takes focus and returns it generates zero warnings', () => {
  const h = new Harness()
  h.tick(1000)
  h.windowBlur()                       // dialog opens (NOT caused by our code)
  h.tick(1200)                         // user clicks “Accept cookies”
  h.windowFocus()                      // focus comes straight back
  h.tick(FOCUS_STRIKE_GRACE_MS * 4)
  assert.equal(h.strikes, 0)
})

test('e2e: a longer cookie dialog that returns focus within the re-check budget generates zero warnings', () => {
  const h = new Harness()
  h.tick(1000)
  h.windowBlur()
  h.tick(FOCUS_STRIKE_GRACE_MS * 2 + 500)  // dialog open across two re-checks
  assert.equal(h.strikes, 0, 're-checks must not warn while a dialog holds focus')
  h.windowFocus()
  h.tick(FOCUS_STRIKE_GRACE_MS * 4)
  assert.equal(h.strikes, 0)
})

test('e2e: a print dialog (blur + fullscreen dip) that is cancelled generates zero warnings', () => {
  const h = new Harness()
  h.tick(1000)
  h.windowBlur()                       // print dialog opens (takes focus)…
  h.exitFullscreen()                   // …and briefly drops fullscreen
  h.tick(1500)
  h.windowFocus()                      // user cancels the print dialog…
  h.enterFullscreen()                  // …and fullscreen comes back
  h.tick(FOCUS_STRIKE_GRACE_MS * 4)
  assert.equal(h.strikes, 0)
})

test('e2e: the full “system alert” battery generates zero warnings', () => {
  const h = new Harness()
  const steps: Array<() => void> = [
    () => { h.openPrompt(); h.windowBlur() },                    // fullscreen prompt
    () => h.answerPrompt({ dropFullscreen: true }),              // answered
    () => h.enterFullscreen(),                                   // fullscreen restored
    () => { h.openPrompt(); h.windowBlur() },                    // camera prompt
    () => h.answerPrompt(),                                      // answered
    () => h.windowBlur(),                                        // cookie dialog
    () => h.windowFocus(),                                       // cookies accepted
    () => { h.openPrompt(); h.windowBlur() },                    // mic prompt
    () => h.answerPrompt({ dropFullscreen: true }),              // answered
    () => h.enterFullscreen(),                                   // fullscreen restored
    () => { h.windowBlur(); h.exitFullscreen() },                // print dialog
    () => { h.windowFocus(); h.enterFullscreen() },              // print cancelled
    () => { h.openPrompt(); h.windowBlur() },                    // clipboard prompt
    () => h.answerPrompt(),                                      // answered
  ]
  for (const step of steps) {
    step()
    h.tick(1500) // dialogs answered comfortably within the grace/re-check budget
  }
  h.tick(PROMPT_GUARD_TRAILING_MS + FOCUS_STRIKE_GRACE_MS * 4)
  assert.equal(h.strikes, 0, 'no system alert may produce a warning')
  assert.equal(h.terminated, false)
})

/* ------------------------------------------------------------------ */
/* 2. Real violations still warn — and end the attempt at the limit    */
/* ------------------------------------------------------------------ */

test('e2e: real tab switches count one warning each and auto-submit at the limit', () => {
  const h = new Harness()
  for (let i = 1; i < MAX_FOCUS_STRIKES; i++) {
    h.tabHidden()
    h.tick(STRIKE_COOLDOWN_MS + 100)
    assert.equal(h.strikes, i)
    assert.equal(h.terminated, false)
    h.tabVisible()
    h.away = false                    // candidate acknowledged the warning
    h.tick(100)
  }
  h.tabHidden()                        // the strike that fills the budget
  h.tick(STRIKE_COOLDOWN_MS + 100)
  assert.equal(h.strikes, MAX_FOCUS_STRIKES)
  assert.equal(h.terminated, true, 'the attempt must auto-submit at the limit')
  assert.match(h.autoSubmitReason || '', /focus warnings/)
  // Once terminated, no further signal can add anything.
  h.away = false
  h.tabVisible()
  h.tabHidden()
  assert.equal(h.strikes, MAX_FOCUS_STRIKES)
})

test('e2e: a real focused fullscreen exit (Esc) warns even when auto re-entry heals it', () => {
  const h = new Harness()
  h.tick(1000)
  h.exitFullscreen()                   // Esc: the page still HAS focus
  h.tick(100)
  h.enterFullscreen()                  // auto re-entry succeeds
  h.tick(FOCUS_STRIKE_GRACE_MS * 2)
  assert.equal(h.strikes, 1, 'a real Esc exit must warn even if fullscreen is restored')
})

test('e2e: a fullscreen exit that sticks after a dialog is dismissed warns', () => {
  const h = new Harness()
  h.tick(1000)
  h.windowBlur()                       // dialog opens first (takes focus)…
  h.exitFullscreen()                   // …then drops fullscreen
  h.tick(FOCUS_STRIKE_GRACE_MS * 2)    // dialog still open — no warning yet
  assert.equal(h.strikes, 0)
  h.windowFocus()                      // dialog dismissed, fullscreen still off
  h.tick(FOCUS_STRIKE_GRACE_MS * 2)
  assert.equal(h.strikes, 1, 'the exit stuck once the dialog was answered — that is real')
})

test('e2e: burst events from ONE action coalesce into a single warning', () => {
  const h = new Harness()
  h.tabHidden()                        // alt-tab fires blur + visibilitychange
  h.windowBlur()
  h.exitFullscreen()
  h.tick(STRIKE_COOLDOWN_MS + 100)
  assert.equal(h.strikes, 1, 'overlapping signals within the cooldown are one warning')
})

test('e2e: switching away with the document hidden warns immediately (no defer)', () => {
  const h = new Harness()
  h.tick(1000)
  h.tabHidden()
  assert.equal(h.strikes, 1, 'a hidden tab switch is unambiguous — count at once')
  assert.equal(h.pendingFocus, null)
})

/* ------------------------------------------------------------------ */
/* 3. The warning budget is sticky — no restart with reset warnings    */
/* ------------------------------------------------------------------ */

test('restore: a reload/back-navigation resumes at the same warning count', () => {
  assert.equal(restoredStrikes(4), 4)
  assert.equal(restoredStrikes('2'), 2)
  assert.equal(restoredStrikes(undefined), 0)
  assert.equal(restoredStrikes(null), 0)
  assert.equal(restoredStrikes('corrupt'), 0)
  assert.equal(restoredStrikes(-3), 0)
  assert.equal(restoredStrikes(2.9), 2)
  assert.equal(shouldTerminateOnRestore(restoredStrikes(4)), false)
})

test('restore: an attempt that already hit the limit must end immediately on load', () => {
  assert.equal(shouldTerminateOnRestore(restoredStrikes(MAX_FOCUS_STRIKES)), true)
  assert.equal(shouldTerminateOnRestore(restoredStrikes(MAX_FOCUS_STRIKES + 1)), true)
  assert.equal(shouldTerminateOnRestore(0), false)
  // End-to-end: the restored attempt auto-submits with zero new events.
  const h = new Harness()
  h.strikes = restoredStrikes(MAX_FOCUS_STRIKES)
  assert.equal(shouldTerminateOnRestore(h.strikes), true)
})

/* ------------------------------------------------------------------ */
/* 4. Decision matrices (the exact rules the runners call)             */
/* ------------------------------------------------------------------ */

test('classifyFocusSignal: system alerts and focus flicker are ignored; hidden tabs strike now', () => {
  const base = { active: true, terminated: false, suppress: false, away: false, hidden: false, focused: true }
  // Not actually away.
  assert.equal(classifyFocusSignal({ ...base }), 'ignore')
  // Prompt guard armed (native alert in flight).
  assert.equal(classifyFocusSignal({ ...base, suppress: true, focused: false }), 'ignore')
  // Already flagged.
  assert.equal(classifyFocusSignal({ ...base, away: true, hidden: true }), 'ignore')
  // Inactive / finished.
  assert.equal(classifyFocusSignal({ ...base, active: false, hidden: true }), 'ignore')
  assert.equal(classifyFocusSignal({ ...base, terminated: true, hidden: true }), 'ignore')
  // Real tab switch.
  assert.equal(classifyFocusSignal({ ...base, hidden: true, focused: false }), 'strike_now')
  // Blur-only (dialog / OS focus steal) → defer.
  assert.equal(classifyFocusSignal({ ...base, focused: false }), 'defer')
})

test('resolveDeferredFocus: focus returning or a prompt cancels; staying away strikes', () => {
  assert.equal(resolveDeferredFocus({ suppress: true, hidden: true, focused: false, checks: 0 }), 'cancel')
  assert.equal(resolveDeferredFocus({ suppress: false, hidden: false, focused: true, checks: 0 }), 'cancel')
  assert.equal(resolveDeferredFocus({ suppress: false, hidden: false, focused: false, checks: 0 }), 'recheck')
  assert.equal(resolveDeferredFocus({ suppress: false, hidden: false, focused: false, checks: 2 }), 'strike')
  assert.equal(resolveDeferredFocus({ suppress: false, hidden: true, focused: false, checks: 0 }), 'strike')
})

test('resolveFullscreenExit: transient dips around dialogs cancel; stuck exits strike', () => {
  const base = { suppress: false, fullscreen: true, focused: true, hidden: false, checks: 0 }
  assert.equal(resolveFullscreenExit({ ...base }), 'cancel', 'fullscreen is back — transient dip')
  assert.equal(resolveFullscreenExit({ ...base, suppress: true, fullscreen: false }), 'cancel')
  assert.equal(resolveFullscreenExit({ ...base, fullscreen: false, focused: false }), 'recheck')
  assert.equal(resolveFullscreenExit({ ...base, fullscreen: false, focused: false, checks: 2 }), 'strike')
  assert.equal(resolveFullscreenExit({ ...base, fullscreen: false, hidden: true, focused: false }), 'strike')
  assert.equal(resolveFullscreenExit({ ...base, fullscreen: false }), 'strike', 'focused exit is real')
})

/* ------------------------------------------------------------------ */
/* 5. The periodic monitor can never pop a permission prompt           */
/* ------------------------------------------------------------------ */

const fakeWin = (over: Record<string, unknown> = {}) => {
  let calls = 0
  const win = {
    screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24 },
    document: { fullscreenElement: {} },
    getScreenDetails: () => {
      calls++
      return Promise.resolve({
        screens: [{ id: 'a' }, { id: 'b' }],
        currentScreen: { id: 'a', width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24 },
      })
    },
    ...over,
  }
  return { win, calls: () => calls }
}

test('resolveScreenFacts(allowPrompt:false) never touches the prompting API', async () => {
  const { win, calls } = fakeWin()
  const facts = await resolveScreenFacts(win, { allowPrompt: false })
  assert.equal(calls(), 0, 'the monitor must never trigger the window-management prompt')
  assert.equal(facts.windowManagement, false)
  assert.equal(facts.dims.width, 1920)
})

test('resolveScreenFacts prefers the cached screenDetails object (no re-prompt)', async () => {
  const cached = {
    screens: [{ id: 'a' }],
    currentScreen: { id: 'a', width: 1440, height: 900, availWidth: 1440, availHeight: 860, colorDepth: 24 },
  }
  const { win, calls } = fakeWin({ screenDetails: cached })
  const facts = await resolveScreenFacts(win, { allowPrompt: false })
  assert.equal(calls(), 0)
  assert.equal(facts.windowManagement, true, 'cached details are used without prompting')
  assert.equal(facts.dims.width, 1440)
})

test('resolveScreenFacts may prompt at the pre-test gate (explicit)', async () => {
  const { win, calls } = fakeWin()
  const facts = await resolveScreenFacts(win)
  assert.equal(calls(), 1)
  assert.equal(facts.windowManagement, true)
  assert.equal(facts.accessibleDisplays, 2)
})
