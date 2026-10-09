import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { clearIdentityCache, resolveStudent } from '../company/auth.ts'
import { isInterviewOwner } from '../interview/access.ts'

function routeFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name)
    return entry.isDirectory() ? routeFiles(full) : entry.name === 'route.ts' ? [full] : []
  })
}

test('interview session ids do not authorize cross-student access', () => {
  assert.equal(isInterviewOwner('student-owner', 'student-owner'), true)
  assert.equal(isInterviewOwner('ABCDEF00-0000-4000-8000-000000000001', 'abcdef00-0000-4000-8000-000000000001'), true)
  assert.equal(isInterviewOwner('student-owner', 'another-student'), false)
  assert.equal(isInterviewOwner('student-owner', ''), false)
})

test('Supabase identity comes from a verified bearer token, not the student-id claim', async () => {
  clearIdentityCache()
  const db = {
    auth: {
      getUser: async (token: string) => token === 'good-token'
        ? { data: { user: { id: 'verified-student' } }, error: null }
        : { data: { user: null }, error: new Error('invalid token') },
    },
  } as any

  const accepted = await resolveStudent(
    new Request('https://example.test/api/interviews', { headers: { authorization: 'Bearer good-token' } }),
    'verified-student',
    db,
  )
  assert.deepEqual(accepted, { ok: true, studentId: 'verified-student' })

  clearIdentityCache()
  const rejected = await resolveStudent(
    new Request('https://example.test/api/interviews', { headers: { authorization: 'Bearer good-token' } }),
    'attacker-selected-student',
    db,
  )
  assert.equal(rejected.ok, false)
  if (!rejected.ok) assert.equal(rejected.status, 403)
})

test('every interview API route checks student identity or interview ownership', () => {
  const directory = path.join(process.cwd(), 'app/api/interviews')
  const files = routeFiles(directory)
  assert.ok(files.length >= 10)
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8')
    assert.match(source, /requireStudentApi\(req,|requireOwnedInterview\(req,/, path.relative(process.cwd(), file))
  }
})
