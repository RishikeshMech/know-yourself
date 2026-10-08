import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'crypto'

import {
  ADMIN_USERNAME,
  adminConfigProblem,
  adminPassword,
  cookieFromRequest,
  safeEqual,
  signSession,
  signSessionUntil,
  verifySessionToken,
} from '../adminAuth.ts'

test('signSession tokens verify and expire later', () => {
  const token = signSession()
  assert.ok(verifySessionToken(token))
})

test('verifySessionToken rejects tampered, garbage and expired tokens', () => {
  const token = signSession()
  // Flip one character in the signature.
  const [v, payload, sig] = token.split('.')
  const flipped = sig[0] === 'a' ? 'b' + sig.slice(1) : 'a' + sig.slice(1)
  assert.equal(verifySessionToken(`${v}.${payload}.${flipped}`), false)
  assert.equal(verifySessionToken('garbage'), false)
  assert.equal(verifySessionToken(''), false)
  assert.equal(verifySessionToken(null), false)
  // Genuinely signed, but already expired.
  assert.equal(verifySessionToken(signSessionUntil(Date.now() - 1000)), false)
})

test('a session signed with the old public fallback secret is rejected (regression)', () => {
  // The repository used to ship this secret, so anyone could mint an admin cookie.
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + 3600_000 })).toString('base64url')
  const forged = createHmac('sha256', 'calibiai-admin-local-secret-change-me').update(payload).digest('hex')
  assert.equal(verifySessionToken(`v1.${payload}.${forged}`), false)
})

test('outside production the development admin credentials apply and the configuration check passes', () => {
  // Tests run without NODE_ENV=production, so the development credentials apply.
  assert.equal(adminPassword(), 'CalibiAdmin@777')
  assert.equal(adminConfigProblem(), null)
})

test('safeEqual is true only for identical strings', () => {
  const pw = adminPassword() || ''
  assert.equal(safeEqual(ADMIN_USERNAME, 'admin'), true)
  assert.equal(safeEqual(pw, 'CalibiAdmin@777'), true)
  assert.equal(safeEqual(pw, 'Admin@123'), false)
  assert.equal(safeEqual(pw, 'admin'), false)
})

test('cookieFromRequest extracts the admin cookie', () => {
  const token = signSession()
  const req = new Request('http://x/api/admin/session', {
    headers: { cookie: `other=1; ${'calibiai_admin_session'}=${token}; third=2` },
  })
  assert.equal(cookieFromRequest(req), token)
  assert.equal(cookieFromRequest(new Request('http://x/')), undefined)
})
