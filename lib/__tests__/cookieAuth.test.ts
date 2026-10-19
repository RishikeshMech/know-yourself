import test from 'node:test'
import assert from 'node:assert/strict'
import { extractAuthToken, AUTH_COOKIE_NAME, SUPABASE_COOKIE_NAME, COOKIE_CONSENT_NAME } from '../cookieAuth.ts'
import { clearIdentityCache, resolveStudent } from '../company/auth.ts'

test('extractAuthToken: returns token from Authorization header', () => {
  const req = new Request('https://example.com/api', {
    headers: { authorization: 'Bearer test-bearer-token-123' },
  })
  assert.equal(extractAuthToken(req), 'test-bearer-token-123')
})

test('extractAuthToken: returns token from proxy bypass header x-access-token', () => {
  const req = new Request('https://example.com/api', {
    headers: { 'x-access-token': 'proxy-bypass-token-456' },
  })
  assert.equal(extractAuthToken(req), 'proxy-bypass-token-456')
})

test('extractAuthToken: returns token from cookie calibiai_token', () => {
  const req = new Request('https://example.com/api', {
    headers: { cookie: `other=1; ${AUTH_COOKIE_NAME}=calibi-cookie-token-789; foo=bar` },
  })
  assert.equal(extractAuthToken(req), 'calibi-cookie-token-789')
})

test('extractAuthToken: returns token from cookie sb-access-token', () => {
  const req = new Request('https://example.com/api', {
    headers: { cookie: `${SUPABASE_COOKIE_NAME}=sb-cookie-token-101; session=active` },
  })
  assert.equal(extractAuthToken(req), 'sb-cookie-token-101')
})

test('extractAuthToken: parses JSON from supabase-auth-token cookie', () => {
  const json = JSON.stringify(['json-cookie-token-202', 'refresh-token'])
  const req = new Request('https://example.com/api', {
    headers: { cookie: `supabase-auth-token=${encodeURIComponent(json)}` },
  })
  assert.equal(extractAuthToken(req), 'json-cookie-token-202')
})

test('extractAuthToken: parses base64 chunk from sb-<ref>-auth-token cookie', () => {
  const raw = JSON.stringify({ access_token: 'chunked-base64-token-303' })
  const base64 = 'base64-' + Buffer.from(raw).toString('base64')
  const req = new Request('https://example.com/api', {
    headers: { cookie: `sb-myproject-auth-token=${encodeURIComponent(base64)}` },
  })
  assert.equal(extractAuthToken(req), 'chunked-base64-token-303')
})

test('extractAuthToken: returns null when no auth token is present', () => {
  const req = new Request('https://example.com/api', {
    headers: { cookie: 'random=value; other=1' },
  })
  assert.equal(extractAuthToken(req), null)
})

test('resolveStudent: authenticates student via cookie when Authorization header is omitted', async () => {
  clearIdentityCache()
  const mockDb = {
    auth: {
      getUser: async (token: string) => token === 'valid-cookie-token'
        ? { data: { user: { id: 'student-cookie-user' } }, error: null }
        : { data: { user: null }, error: new Error('invalid') },
    },
  } as any

  const req = new Request('https://example.com/api/test', {
    headers: { cookie: `calibiai_token=valid-cookie-token` },
  })

  const identity = await resolveStudent(req, 'student-cookie-user', mockDb)
  assert.deepEqual(identity, { ok: true, studentId: 'student-cookie-user' })
})
