/**
 * Browser proctoring helpers for the live assessment.
 *
 * A plain web page cannot see how many physical displays are attached, whether
 * the desktop is being mirrored to a projector, or close browser tabs it did
 * not open — the platform forbids all of that. So this module is deliberately
 * a *best-effort* layer built from the signals a normal browser DOES expose:
 *
 *   1. The window's current screen size (`window.screen`) and its fullscreen
 *      state — an honest proxy for "the window just landed on a different /
 *      additional display or the resolution changed".
 *   2. The experimental **Window Management API** (`getScreenDetails()`), where
 *      Chromium + an explicit permission grant lets us enumerate the screens
 *      the window can reach and be notified via `screenschange` the moment a
 *      display is connected/disconnected. This is the closest a tab can get to
 *      "an external display was plugged in".
 *   3. Fullscreen as a hard requirement (a mirrored/projected session is far
 *      less practical while the tab is locked to fullscreen).
 *
 * The decision logic lives in small pure functions (injectable, SSR-safe) so it
 * is unit-testable in Node without a browser; the `browser.*` functions on the
 * bottom are thin adapters the assessment page wires up to real DOM events.
 */

/* ------------------------------------------------------------------ */
/* Constants                                                          */
/* ------------------------------------------------------------------ */

/** How many focus/display/fullscreen violations before auto-submit. */
export const MAX_FOCUS_STRIKES = 5

/**
 * A single real violation fires several overlapping DOM signals (window blur +
 * visibilitychange + a fullscreen exit). Within this window they are coalesced
 * into ONE warning instead of cascading into instant termination.
 */
export const STRIKE_COOLDOWN_MS = 2500

/**
 * How long the proctoring monitors stay disarmed AFTER a native browser prompt
 * (Allow fullscreen / camera / microphone / clipboard / cookie banners) has
 * been answered. The prompt resolution itself fires a trailing
 * blur/visibility/fullscreenchange burst — never a real violation.
 */
export const PROMPT_GUARD_TRAILING_MS = 4000

/**
 * How long a focus-loss signal waits before it becomes a warning. Native
 * browser dialogs (permission prompts, cookie banners, print dialogs) take
 * focus away and hand it straight back when dismissed — if the focus returns
 * within this window (and no prompt guard is active) nothing happened.
 */
export const FOCUS_STRIKE_GRACE_MS = 3000

export const FULLSCREEN_EXIT_MSG =
  'You exited fullscreen mode. Fullscreen must stay on for the whole test — going out of fullscreen is recorded as a proctoring violation.'
export const DISPLAY_CONNECT_MSG =
  'A new display / screen appears to have been connected. Connecting an external or mirrored display during the test is treated as cheating.'
export const DISPLAY_CHANGE_MSG =
  'Your screen or window changed displays / resolution mid-test. Switching the test to another screen is recorded as a proctoring violation.'

/* ------------------------------------------------------------------ */
/* Screen facts — the inputs every decision below is built from        */
/* ------------------------------------------------------------------ */

export interface ScreenDims {
  width: number
  height: number
  availWidth: number
  availHeight: number
  colorDepth: number
}

export interface ScreenFacts {
  /** Dimensions of the display the window currently occupies. */
  dims: ScreenDims
  /** Whether the document is in fullscreen (Element or document fullscreen). */
  fullscreen: boolean
  /**
   * Number of screens the Window-Management API can see, or `null` when that
   * API is unavailable / permission was denied / not granted yet.
   */
  accessibleDisplays: number | null
  /** identity of the screen the window currently sits on (WM API only). */
  currentScreenId: string | null
  /** Whether we successfully resolved the Window-Management API. */
  windowManagement: boolean
}

/** `any`-typed dependency holder so this module never touches globals. */
export interface ProctorDeps {
  screen?: {
    width?: number
    height?: number
    availWidth?: number
    availHeight?: number
    colorDepth?: number
  } | null
  getScreenDetails?: (() => Promise<any>) | null
  document?: { fullscreenElement?: any } | null
}

export const DEFAULT_DIMS: ScreenDims = {
  width: 0,
  height: 0,
  availWidth: 0,
  availHeight: 0,
  colorDepth: 24,
}

/** Non-throwing snapshot of the current screen/fullscreen facts. */
export function readScreenFacts(deps: ProctorDeps = {}): ScreenFacts {
  const dims: ScreenDims = {
    width: num(deps.screen?.width),
    height: num(deps.screen?.height),
    availWidth: num(deps.screen?.availWidth),
    availHeight: num(deps.screen?.availHeight),
    colorDepth: num(deps.screen?.colorDepth, 24),
  }
  const fullscreen = !!(deps.document && deps.document.fullscreenElement)
  return { dims, fullscreen, accessibleDisplays: null, currentScreenId: null, windowManagement: false }
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

/** Screen size snapshots are only worth comparing when the browser reports real pixels. */
export function screenDimsUsable(dims: ScreenDims): boolean {
  return dims.width > 0 && dims.height > 0
}

export function dimsEqual(a: ScreenDims, b: ScreenDims): boolean {
  return a.width === b.width && a.height === b.height &&
    a.availWidth === b.availWidth && a.availHeight === b.availHeight &&
    a.colorDepth === b.colorDepth
}

/* ------------------------------------------------------------------ */
/* Display / layout change classification (pure)                       */
/* ------------------------------------------------------------------ */

export type DisplayEvent =
  | 'none'                 // nothing worth flagging
  | 'display_connect'      // more screens than before → likely a display plugged in
  | 'display_layout_change' // window moved to another screen, or resolution changed

/**
 * Classify the delta between two snapshots into a proctoring signal.
 *
 * We prefer the explicit Window-Management facts when both snapshots have them
 * (`accessibleDisplays` / `currentScreenId`); otherwise we fall back to the
 * coarse "the window is now on a differently-sized area" heuristic.
 */
export function classifyDisplayEvent(prev: ScreenFacts, next: ScreenFacts): DisplayEvent {
  // Both snapshots came from the Window-Management API → trust it directly.
  if (prev.windowManagement && next.windowManagement) {
    if (
      next.accessibleDisplays != null &&
      prev.accessibleDisplays != null &&
      next.accessibleDisplays > prev.accessibleDisplays
    ) {
      return 'display_connect'
    }
    if (
      prev.currentScreenId != null &&
      next.currentScreenId != null &&
      prev.currentScreenId !== next.currentScreenId
    ) {
      return 'display_layout_change'
    }
    return dimsEqual(prev.dims, next.dims) ? 'none' : 'display_layout_change'
  }

  // Coarse fallback (no WM API): a changed screen size is the only hint.
  if (!screenDimsUsable(prev.dims) || !screenDimsUsable(next.dims)) return 'none'
  return dimsEqual(prev.dims, next.dims) ? 'none' : 'display_layout_change'
}

/* ------------------------------------------------------------------ */
/* Pre-start environment gate (pure)                                   */
/* ------------------------------------------------------------------ */

export interface StartGateVerdict {
  /** `true` when the test may start from an environment standpoint. */
  allow: boolean
  /**
   * `true` when we could genuinely enumerate displays (WM API available and
   * authorised). When `false` the web page simply cannot see displays, so the
   * decision rests on the candidate's consent.
   */
  detectible: boolean
  /** Human-readable reason to show when `allow === false`. */
  reason: string | null
}

/**
 * Decide whether the environment is safe to start the test.
 *
 * The only thing a browser can prove about "an external display is attached"
 * is via the Window-Management API reporting more than one reachable screen.
 * When that API is absent the tab is blind to displays, so we pass the gate but
 * mark `detectible === false` so the UI can require an explicit confirmation.
 */
export function evaluateStartGate(facts: ScreenFacts): StartGateVerdict {
  if (facts.windowManagement && facts.accessibleDisplays != null && facts.accessibleDisplays > 1) {
    return {
      allow: false,
      detectible: true,
      reason: 'More than one display was detected. The test requires a single screen — please disconnect any external or mirrored display and try again.',
    }
  }
  return { allow: true, detectible: facts.windowManagement, reason: null }
}

/* ------------------------------------------------------------------ */
/* Right-click lock                                                    */
/* ------------------------------------------------------------------ */

export interface ContextMenuVerdict {
  block: boolean
}

/**
 * The test screen disables the browser context menu (right-click) while a test
 * is active. This is a page-level lock only — it cannot stop OS-level or
 * browser-shortcut circumvention, which no web page can.
 */
export function rightClickShouldBlock(active: boolean): ContextMenuVerdict {
  return { block: active }
}

/* ------------------------------------------------------------------ */
/* Strike decisions (pure)                                             */
/*                                                                     */
/* Native browser alerts — “Allow fullscreen”, “Allow microphone”,     */
/* “Allow camera”, cookie/storage banners, print & save dialogs —     */
/* steal window focus and can briefly drop fullscreen. None of that is */
/* a real violation, so every focus/fullscreen signal runs through     */
/* these decision functions first: signals raised while a prompt guard */
/* is armed are absorbed, and blur-only signals are deferred and       */
/* cancelled when the dialog is dismissed and focus returns.           */
/* ------------------------------------------------------------------ */

export type FocusSignalAction = 'ignore' | 'strike_now' | 'defer'

/**
 * Decide what a blur/visibilitychange signal means.
 *
 *   ignore     — not actually away, already flagged, or a system alert in flight
 *   strike_now — the document is hidden (real tab switch / minimised window);
 *                no browser dialog can hide the page, so this is unambiguous
 *   defer      — window blurred but the page is still visible: exactly what a
 *                native permission/cookie/print dialog produces. Wait for the
 *                grace window and re-check instead of warning immediately.
 */
export function classifyFocusSignal(input: {
  active: boolean
  terminated: boolean
  suppress: boolean
  away: boolean
  hidden: boolean
  focused: boolean
}): FocusSignalAction {
  const { active, terminated, suppress, away, hidden, focused } = input
  if (!active || terminated || suppress) return 'ignore'
  if (away) return 'ignore'
  if (!hidden && focused) return 'ignore'
  if (hidden) return 'strike_now'
  return 'defer'
}

/**
 * Re-check a deferred blur signal when its grace window expires (or focus
 * returns early). System alerts must never produce warnings:
 *
 *   cancel  — prompt guard active (system alert), or focus came straight back
 *   recheck — the window is still blurred but the page is visible: a dialog is
 *             probably still open, give it another grace window
 *   strike  — genuinely away (page hidden) or stayed away beyond the budget
 */
export function resolveDeferredFocus(input: {
  suppress: boolean
  hidden: boolean
  focused: boolean
  checks: number
  maxChecks?: number
}): 'strike' | 'cancel' | 'recheck' {
  const { suppress, hidden, focused, checks, maxChecks = 2 } = input
  if (suppress) return 'cancel'
  if (!hidden && focused) return 'cancel'
  if (!hidden && !focused) return checks < maxChecks ? 'recheck' : 'strike'
  return 'strike'
}

/**
 * Re-check a fullscreen exit before it becomes a warning. Fullscreen drops are
 * a side effect of some native permission prompts — those heal as soon as the
 * prompt is answered and must never warn. A real exit (Esc, F11-style loss)
 * that stays out while the page is focused does warn.
 *
 *   cancel  — prompt guard active, or fullscreen is back (transient dip)
 *   recheck — a dialog still holds focus; look again after another grace window
 *   strike  — the exit stuck (or the page was hidden away with it)
 */
export function resolveFullscreenExit(input: {
  suppress: boolean
  fullscreen: boolean
  focused: boolean
  hidden: boolean
  checks: number
  maxChecks?: number
}): 'strike' | 'cancel' | 'recheck' {
  const { suppress, fullscreen, focused, hidden, checks, maxChecks = 2 } = input
  if (suppress) return 'cancel'
  if (fullscreen) return 'cancel'
  if (hidden) return 'strike'
  if (!focused) return checks < maxChecks ? 'recheck' : 'strike'
  return 'strike'
}

/**
 * Strike counters are sticky per attempt: a reload, a crash or a back-button
 * re-entry must never reset the warning budget. Reads a persisted counter
 * (localStorage JSON, server snapshot) defensively.
 */
export function restoredStrikes(raw: unknown): number {
  const n = Math.floor(Number(raw))
  return Number.isFinite(n) && n > 0 ? Math.min(n, 100) : 0
}

/** A restored attempt that already hit the limit must end immediately. */
export function shouldTerminateOnRestore(strikes: number, max: number = MAX_FOCUS_STRIKES): boolean {
  return restoredStrikes(strikes) >= max
}

/* ------------------------------------------------------------------ */
/* Browser adapters (used by /assessment)                              */
/* ------------------------------------------------------------------ */

/**
 * Resolve the Window-Management API screen facts if the browser exposes it and
 * the user has (or grants) permission. Never throws; returns plain facts.
 *
 * `getScreenDetails` may prompt for permission the first time — that prompt is
 * part of the pre-test gate and is fine to surface there. Once the exam is
 * running pass `{ allowPrompt: false }`: only the already-granted cached
 * `window.screenDetails` is consulted, so the periodic monitor can NEVER pop a
 * native “Allow screen information?” prompt (and its focus theft) mid-test.
 */
export async function resolveScreenFacts(
  win: any,
  opts: { allowPrompt?: boolean } = {},
): Promise<ScreenFacts> {
  const allowPrompt = opts.allowPrompt !== false
  const base = readScreenFacts({
    screen: win?.screen,
    document: win?.document,
  })
  // Prefer the cached details object (no prompt) before the prompting call.
  const cached = win?.screenDetails
  const gsd = cached
    ? () => Promise.resolve(cached)
    : allowPrompt && typeof win?.getScreenDetails === 'function'
      ? win.getScreenDetails.bind(win)
      : null
  if (typeof gsd !== 'function') return base
  try {
    const details = await gsd.call(win)
    if (!details) return base
    const screens: any[] = Array.isArray(details?.screens) ? details.screens : []
    return {
      ...base,
      accessibleDisplays: screens.length,
      currentScreenId: details?.currentScreen?.id ?? null,
      windowManagement: true,
      // Also capture the actual current screen dims if reported.
      dims: {
        width: num(details?.currentScreen?.width, base.dims.width),
        height: num(details?.currentScreen?.height, base.dims.height),
        availWidth: num(details?.currentScreen?.availWidth, base.dims.availWidth),
        availHeight: num(details?.currentScreen?.availHeight, base.dims.availHeight),
        colorDepth: num(details?.currentScreen?.colorDepth, base.dims.colorDepth),
      },
    }
  } catch {
    // Permission denied or API unavailable — fall back to the coarse snapshot.
    return base
  }
}

/** true when this browser/iframe exposes the Window-Management screenDetails. */
export function windowManagementAvailable(win: any): boolean {
  return typeof win?.getScreenDetails === 'function'
}

/** True when the document supports the Fullscreen API. */
export function fullscreenCapable(doc: any): boolean {
  return !!doc && (typeof doc.documentElement?.requestFullscreen === 'function')
}

/**
 * Requests fullscreen and NEVER rejects — the browser rejects the promise
 * (rather than throwing) when a Permissions Policy disallows it (e.g. the app
 * is embedded in an iframe without `allow="fullscreen"`), and an unhandled
 * rejection there surfaces as a Next.js runtime error. Callers get a boolean
 * success result instead.
 */
export async function safeRequestFullscreen(doc: any): Promise<boolean> {
  if (!fullscreenCapable(doc)) return false
  // `fullscreenEnabled === false` means the permission is missing outright —
  // skip the doomed call entirely rather than producing a rejection.
  if (doc?.fullscreenEnabled === false) return false
  try {
    await doc.documentElement.requestFullscreen()
    return !!doc.fullscreenElement
  } catch {
    return false
  }
}

/* ------------------------------------------------------------------ */
/* Leak-prevention watermark                                            */
/*                                                                     */
/* Every visible screenshot / photo of a mirrored screen is the leak   */
/* vector. A faint, tiled watermark carrying the candidate's own ID +  */
/* a CALIBIAI marker is overlaid across the whole test screen so that  */
/* ANY capture identifies who leaked it. Pure + testable.              */
/* ------------------------------------------------------------------ */

/** How wide/tall a single watermark tile is (in px). */
export const WATERMARK_TILE_WIDTH = 440
export const WATERMARK_TILE_HEIGHT = 280

export interface WatermarkIdentity {
  name?: string | null
  email?: string | null
  id?: string | null
  sessionId?: string | null
}

/**
 * Build the human line embedded in the watermark: the candidate's identity
 * (name → email → id, best available) fused with the CALIBIAI marker and a
 * short session tag, e.g. `Priya Sharma · CALIBIAI · a1b2c3`.
 */
export function watermarkIdentity(who: WatermarkIdentity = {}): string {
  const person = (who.name || who.email || who.id || 'CALIBIAI USER').trim()
  const sessionTag = (who.sessionId || '').toString().slice(-6).toLowerCase() || 'calibiai'
  return `${person} · CALIBIAI · ${sessionTag}`
}

export interface WatermarkTileOptions {
  /** Lower = subtler. Around 0.05–0.09 reads faintly but stays detectable. */
  opacity?: number
  tileWidth?: number
  tileHeight?: number
  fontSize?: number
}

/**
 * Returns a `background-image` CSS value (an inline SVG data URI) that repeats a
 * diagonal watermark tile across any element it is applied to. The caller
 * usually also sets `background-repeat: repeat` and a tile `background-size`.
 */
export function watermarkBackgroundImage(
  identity: string,
  opts: WatermarkTileOptions = {},
): string {
  const opacity = clamp01(opts.opacity ?? 0.06)
  const w = opts.tileWidth ?? WATERMARK_TILE_WIDTH
  const h = opts.tileHeight ?? WATERMARK_TILE_HEIGHT
  const fontSize = opts.fontSize ?? 13
  const salt = Math.random().toString(36).slice(2, 8).toUpperCase()
  const label = identity
  const tag = 'CALIBIAI ASSESSMENT · CONFIDENTIAL'
  // Single-quote attribute delimiters so we never need to escape double quotes.
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>` +
    `<g transform='rotate(-22 ${w / 2} ${h / 2})'>` +
    `<text x='${w / 2}' y='${h / 2 - 4}' text-anchor='middle' fill='rgba(30,41,90,${opacity})' font-family='Arial,Helvetica,sans-serif' font-size='${fontSize}' font-weight='600'>${label}</text>` +
    `<text x='${w / 2}' y='${h / 2 + 15}' text-anchor='middle' fill='rgba(30,41,90,${opacity * 0.8})' font-family='Arial,Helvetica,sans-serif' font-size='${Math.max(8, fontSize - 2)}'>${tag} · ${salt}</text>` +
    `</g></svg>`
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

