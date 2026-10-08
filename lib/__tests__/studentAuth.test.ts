import test from 'node:test'
import assert from 'node:assert/strict'

import { claimedStudentId, resolveStudentAccess } from '../studentAuth.ts'

test('claimedStudentId ignores the placeholders older clients sent', () => {
  assert.equal(claimedStudentId('unknown'), null)
  assert.equal(claimedStudentId('sess_demo'), null)
  assert.equal(claimedStudentId('   '), null)
  assert.equal(claimedStudentId(undefined), null)
  assert.equal(claimedStudentId('  u_123 '), 'u_123')
})

test('demo mode (no Supabase): the claimed student id is used and a missing one is refused', async () => {
  const saved = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY }
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  try {
    const req = new Request('http://localhost/api/user/scores')
    const ok = await resolveStudentAccess(req, 'u_demo')
    assert.deepEqual(ok, { ok: true, mode: 'local', studentId: 'u_demo', email: null })
    const refused = await resolveStudentAccess(req, 'unknown')
    assert.equal(refused.ok, false)
    if (!refused.ok) assert.equal(refused.status, 400)
  } finally {
    if (saved.url !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = saved.url
    if (saved.key !== undefined) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = saved.key
  }
})

test('with Supabase configured, a request without a bearer token is refused (401), never served from a claimed id', async () => {
  const saved = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY }
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:9'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key'
  try {
    const req = new Request('http://localhost/api/user/scores?student_id=11111111-1111-4111-8111-111111111111')
    const who = await resolveStudentAccess(req, '11111111-1111-4111-8111-111111111111')
    assert.equal(who.ok, false)
    if (!who.ok) assert.equal(who.status, 401)
  } finally {
    if (saved.url !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = saved.url
    else delete process.env.NEXT_PUBLIC_SUPABASE_URL
    if (saved.key !== undefined) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = saved.key
    else delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  }
})
