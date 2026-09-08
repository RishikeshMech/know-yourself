import test from 'node:test'
import assert from 'node:assert/strict'

import {
  MAX_FOCUS_STRIKES,
  dimsEqual,
  screenDimsUsable,
  classifyDisplayEvent,
  evaluateStartGate,
  readScreenFacts,
  rightClickShouldBlock,
  watermarkIdentity,
  watermarkBackgroundImage,
} from '../proctoring.ts'
import type { ScreenFacts } from '../proctoring.ts'

const dims = (w: number, h: number) => ({ width: w, height: h, availWidth: w, availHeight: h, colorDepth: 24 })
const facts = (over: Partial<ScreenFacts>): ScreenFacts => ({
  dims: dims(1920, 1080),
  fullscreen: true,
  accessibleDisplays: 1,
  currentScreenId: 'a',
  windowManagement: false,
  ...over,
})

test('screen dims equality and usability', () => {
  assert.equal(dimsEqual(dims(1920, 1080), dims(1920, 1080)), true)
  assert.equal(dimsEqual(dims(1920, 1080), dims(1280, 720)), false)
  assert.equal(screenDimsUsable(dims(1920, 1080)), true)
  assert.equal(screenDimsUsable({ ...dims(1920, 1080), width: 0 }), false)
})

test('readScreenFacts reads a plain screen object without throwing', () => {
  const f = readScreenFacts({
    screen: { width: 1366, height: 768, availWidth: 1366, availHeight: 728, colorDepth: 24 },
    document: { fullscreenElement: {} },
  })
  assert.equal(f.dims.width, 1366)
  assert.equal(f.dims.height, 768)
  assert.equal(f.fullscreen, true)
  assert.equal(f.windowManagement, false)
})

test('readScreenFacts tolerates missing / throwing-ish globals', () => {
  const f = readScreenFacts({ screen: null, document: null })
  assert.equal(f.fullscreen, false)
  assert.equal(f.accessibleDisplays, null)
  assert.ok(Number.isFinite(f.dims.width))
})

test('classifyDisplayEvent: identical snapshots are not a violation', () => {
  const prev = facts({})
  const next = facts({})
  assert.equal(classifyDisplayEvent(prev, next), 'none')
})

test('classifyDisplayEvent: WM API reports a new display being connected', () => {
  const prev = facts({ windowManagement: true, accessibleDisplays: 1, currentScreenId: 'a' })
  const next = facts({ windowManagement: true, accessibleDisplays: 2, currentScreenId: 'a' })
  assert.equal(classifyDisplayEvent(prev, next), 'display_connect')
})

test('classifyDisplayEvent: WM API reports the window moving to another screen', () => {
  const prev = facts({ windowManagement: true, accessibleDisplays: 2, currentScreenId: 'a' })
  const next = facts({ windowManagement: true, accessibleDisplays: 2, currentScreenId: 'b' })
  assert.equal(classifyDisplayEvent(prev, next), 'display_layout_change')
})

test('classifyDisplayEvent: coarse fallback flags a changed screen size', () => {
  const prev = facts({ windowManagement: false, dims: dims(1920, 1080) })
  const next = facts({ windowManagement: false, dims: dims(1280, 720) })
  assert.equal(classifyDisplayEvent(prev, next), 'display_layout_change')
})

test('classifyDisplayEvent: coarse fallback ignores unusable snapshots', () => {
  const prev = facts({ windowManagement: false, dims: { ...dims(0, 0), width: 0, height: 0 } })
  const next = facts({ windowManagement: false, dims: dims(1920, 1080) })
  assert.equal(classifyDisplayEvent(prev, next), 'none')
})

test('classifyDisplayEvent: WM-visible current screen ids from both snapshots', () => {
  // Both have ids but stay on the same screen & same dims → not a violation.
  const prev = facts({ windowManagement: true, accessibleDisplays: 1, currentScreenId: 'internal', dims: dims(1920, 1080) })
  const next = facts({ windowManagement: true, accessibleDisplays: 1, currentScreenId: 'internal', dims: dims(1920, 1080) })
  assert.equal(classifyDisplayEvent(prev, next), 'none')
})

test('evaluateStartGate: single display always passes', () => {
  const v = evaluateStartGate(facts({ windowManagement: true, accessibleDisplays: 1 }))
  assert.equal(v.allow, true)
  assert.equal(v.detectible, true)
})

test('evaluateStartGate: more than one reachable display blocks the start', () => {
  const v = evaluateStartGate(facts({ windowManagement: true, accessibleDisplays: 2 }))
  assert.equal(v.allow, false)
  assert.equal(v.detectible, true)
  assert.ok(v.reason)
})

test('evaluateStartGate: API unavailable → cannot detect, still allow with detectible=false', () => {
  const v = evaluateStartGate(facts({ windowManagement: false, accessibleDisplays: null }))
  assert.equal(v.allow, true)
  assert.equal(v.detectible, false)
})

test('right-click lock only blocks while a test is active', () => {
  assert.equal(rightClickShouldBlock(true).block, true)
  assert.equal(rightClickShouldBlock(false).block, false)
})

test('focus-violation ceiling is exactly three warnings', () => {
  assert.equal(MAX_FOCUS_STRIKES, 3)
})

/* ---------------- Leak-prevention watermark ---------------- */

test('watermarkIdentity fuses the person with the CALIBIAI marker', () => {
  const wm = watermarkIdentity({ name: 'Priya Sharma', id: 'usr_123', sessionId: 'sess_abc123' })
  assert.ok(wm.includes('Priya Sharma'))
  assert.ok(wm.includes('CALIBIAI'))
  assert.ok(wm.toLowerCase().includes('abc123'))
})

test('watermarkIdentity prefers name over email/id and falls back gracefully', () => {
  assert.equal(watermarkIdentity({ name: ' A ', email: 'a@x.com', id: 'u1' }).startsWith('A ·'), true)
  assert.ok(watermarkIdentity({ email: 'a@x.com' }).includes('a@x.com'))
  assert.ok(watermarkIdentity({ id: 'u1' }).includes('u1'))
  // Empty identity still yields the CALIBIAI marker (never a blank tile).
  assert.ok(watermarkIdentity({}).includes('CALIBIAI'))
})

test('watermarkBackgroundImage returns a repeatable inline-SVG data URI carrying the identity', () => {
  const wm = watermarkBackgroundImage('Priya Sharma · CALIBIAI · abc123', { opacity: 0.07 })
  assert.equal(typeof wm, 'string')
  assert.ok(wm.startsWith('url("data:image/svg+xml;utf8,'))
  assert.ok(wm.endsWith('")'))
  const svg = decodeURIComponent(wm.replace(/^url\("data:image\/svg\+xml;utf8,/, '').replace(/"\)$/, ''))
  assert.ok(svg.includes('Priya Sharma'))
  assert.ok(svg.includes('CALIBIAI'))
  assert.ok(svg.includes('<svg'))
})

test('watermark opacity is clamped into the safe display range', () => {
  const a = watermarkBackgroundImage('x', { opacity: 99 })
  const b = watermarkBackgroundImage('x', { opacity: -1 })
  assert.ok(decodeURIComponent(a).includes('rgba(30,41,90,1)'))
  assert.ok(decodeURIComponent(b).includes('rgba(30,41,90,0)'))
})
