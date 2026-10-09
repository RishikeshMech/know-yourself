import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { flushDB, saveAssessmentSession, saveCompanyAttempt, setDbDirectory } from '../db.ts'
import { loadStudentRecord } from '../adminAssessmentData.ts'

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-full-record-'))
setDbDirectory(directory)

const studentId = 'student-full-record'
saveAssessmentSession({
  id: 'platform-session-full-record',
  student_id: studentId,
  status: 'submitted',
  started_at: '2026-10-09T08:00:00.000Z',
  expires_at: '2026-10-09T10:00:00.000Z',
  duration_sec: 7200,
  submitted_at: '2026-10-09T09:00:00.000Z',
  tab_switches: 0,
  assessment_no: 1,
  answers: { EL1: 'b', WR1: 'structured response' },
  created_at: '2026-10-09T08:00:00.000Z',
})
saveCompanyAttempt({
  id: 'company-attempt-full-record',
  student_id: studentId,
  company: 'tcs',
  status: 'submitted',
  answers: { 'question-1': 'candidate response' },
} as any)

test('the admin full-record export contains the candidate’s stored answer payloads', async () => {
  const record = await loadStudentRecord(null, {
    student_id: studentId,
    email: 'student@example.test',
  } as any)
  const local = record.local as any
  assert.deepEqual(local.assessment_sessions[0].answers, { EL1: 'b', WR1: 'structured response' })
  assert.deepEqual(local.company_attempts[0].answers, { 'question-1': 'candidate response' })
})

test('the full-record HTTP route remains admin-cookie protected and private', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'app/api/admin/student/route.ts'), 'utf8')
  assert.match(source, /if \(!isAdminRequest\(req\)\)/)
  assert.match(source, /Cache-Control': 'no-store'/)
  assert.match(source, /getServiceRoleClient\(\)/)
})

after(async () => {
  await flushDB()
  fs.rmSync(directory, { recursive: true, force: true })
})
