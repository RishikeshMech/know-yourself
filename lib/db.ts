import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'

// ---------------------------------------------------------------------------
// Demo-mode "database": a single JSON file on disk.
//
// Two files are involved, and the split matters for deploys:
//   - `calibiai_db.json`            (git-tracked) — the SEED / demo snapshot.
//   - `calibiai_db.runtime.json`    (gitignored)  — LIVE runtime writes.
//
// The app used to write new sign-ups / sessions / results straight into the
// tracked file. On a live server that left the tracked file permanently
// "modified", so the deploy's `git checkout -B <branch>` aborted with
// "Your local changes ... would be overwritten by checkout". Runtime data now
// lives in a gitignored file, so the tracked seed is only ever changed by
// commits and deploys can always check out cleanly.
// ---------------------------------------------------------------------------
const SEED_FILE = path.join(process.cwd(), 'calibiai_db.json')
const RUNTIME_FILE = path.join(process.cwd(), 'calibiai_db.runtime.json')

/**
 * Where the data lives right now. Once the runtime file exists it becomes the
 * source of truth (it holds everything the seed did plus live writes); before
 * that, the tracked seed is used.
 */
function dbFile(): string {
  return fs.existsSync(RUNTIME_FILE) ? RUNTIME_FILE : SEED_FILE
}

export interface User {
  id: string
  email: string
  password_hash: string
  role: string
  institution_id: string
  name?: string
  created_at: string
  last_login_at?: string
}

export interface Profile {
  id: string
  email: string
  full_name?: string
  /** College PRN / permanent registration number — optional. */
  prn?: string
  phone?: string
  dob?: string
  gender?: string
  degree?: string
  college?: string
  graduation_year?: number
  cgpa?: number
  skills?: string
  linkedin_url?: string
  github_url?: string
  ai_avatar?: { seed: number; style: string; version: number; generated_at: string } | null
  updated_at: string
}

export interface AssessmentSession {
  id: string
  student_id: string
  status: string
  started_at: string
  expires_at: string
  duration_sec: number
  answers?: any
  submitted_at?: string
  tab_switches: number
  question_seed?: number
  created_at: string
}

export interface AssessmentResult {
  id: string
  session_id: string
  student_id: string
  scores: any
  total: number
  grade: string
  percentile: number
  verifiable_hash: string
  ai_feedback?: any
  created_at: string
}

export interface ResumeAnalysis {
  id: string
  student_id: string
  storage_key?: string
  resume_score?: number
  parsed?: any
  feedback?: any
  created_at: string
}

export interface TrackingEvent {
  id: string
  user_id: string
  action: string
  completed: boolean
  completed_at?: string
}

export interface DBData {
  users: User[]
  profiles: Profile[]
  assessment_sessions: AssessmentSession[]
  assessment_results: AssessmentResult[]
  resume_analyses: ResumeAnalysis[]
  tracking_events: TrackingEvent[]
}

function initDB(): DBData {
  try {
    const file = dbFile()
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, 'utf-8')
      const parsed = JSON.parse(raw)
      return {
        users: parsed.users || [],
        profiles: parsed.profiles || [],
        assessment_sessions: parsed.assessment_sessions || [],
        assessment_results: parsed.assessment_results || [],
        resume_analyses: parsed.resume_analyses || [],
        tracking_events: parsed.tracking_events || [],
      }
    }
  } catch (e) {
    console.warn('[db] init error', e)
  }
  return {
    users: [],
    profiles: [],
    assessment_sessions: [],
    assessment_results: [],
    resume_analyses: [],
    tracking_events: [],
  }
}

function saveDB(data: DBData) {
  try {
    // Always persist to the runtime file (never the tracked seed) so live
    // writes can't dirty the repo and break `git checkout` during deploys.
    fs.writeFileSync(RUNTIME_FILE, JSON.stringify(data, null, 2), 'utf-8')
  } catch (e) {
    console.error('[db] save error', e)
  }
}

export function getDB(): DBData {
  return initDB()
}

export function getUserByEmail(email: string): User | undefined {
  const db = getDB()
  return db.users.find(u => u.email.toLowerCase() === email.toLowerCase())
}

export function getUserById(id: string): User | undefined {
  const db = getDB()
  return db.users.find(u => u.id === id)
}

export function createUser(email: string, passwordHash: string, role = 'student', institutionId = 'inst_iitm', name?: string): User {
  const db = getDB()
  const user: User = {
    id: 'u_' + randomUUID().split('-')[0],
    email,
    password_hash: passwordHash,
    role,
    institution_id: institutionId,
    name: name || email.split('@')[0],
    created_at: new Date().toISOString(),
    last_login_at: new Date().toISOString(),
  }
  db.users.push(user)
  saveDB(db)
  return user
}

export function updateUserLogin(id: string) {
  const db = getDB()
  const user = db.users.find(u => u.id === id)
  if (user) {
    user.last_login_at = new Date().toISOString()
    saveDB(db)
  }
}

export function saveProfile(profile: Profile) {
  const db = getDB()
  const idx = db.profiles.findIndex(p => p.id === profile.id)
  if (idx >= 0) db.profiles[idx] = profile
  else db.profiles.push(profile)
  saveDB(db)
}

export function getProfileById(id: string): Profile | undefined {
  const db = getDB()
  return db.profiles.find(p => p.id === id)
}

/**
 * Another student already using this PRN, or `undefined`. PRNs are compared in
 * canonical form (upper case, no whitespace — see normalizePrn) and blanks are
 * never a match, since the field is optional.
 */
export function findProfileByPrn(prn: string, excludeId?: string): Profile | undefined {
  const wanted = String(prn ?? '').replace(/\s+/g, '').toUpperCase()
  if (!wanted) return undefined
  const db = getDB()
  return db.profiles.find(p =>
    p.id !== excludeId &&
    String(p.prn ?? '').replace(/\s+/g, '').toUpperCase() === wanted,
  )
}

export function saveAssessmentSession(session: AssessmentSession) {
  const db = getDB()
  const idx = db.assessment_sessions.findIndex(s => s.id === session.id)
  if (idx >= 0) db.assessment_sessions[idx] = session
  else db.assessment_sessions.push(session)
  saveDB(db)
}

export function getAssessmentSession(id: string): AssessmentSession | undefined {
  const db = getDB()
  return db.assessment_sessions.find(s => s.id === id)
}

export function getActiveSessionForStudent(studentId: string): AssessmentSession | undefined {
  const db = getDB()
  return db.assessment_sessions.find(s => s.student_id === studentId && s.status === 'in_progress')
}

export function saveAssessmentResult(result: AssessmentResult) {
  const db = getDB()
  const idx = db.assessment_results.findIndex(r => r.session_id === result.session_id)
  if (idx >= 0) db.assessment_results[idx] = result
  else db.assessment_results.push(result)
  saveDB(db)
}

export function getAssessmentResultBySession(sessionId: string): AssessmentResult | undefined {
  const db = getDB()
  return db.assessment_results.find(r => r.session_id === sessionId)
}

export function getLatestAssessmentResultForStudent(studentId: string): AssessmentResult | undefined {
  const db = getDB()
  const results = db.assessment_results.filter(r => r.student_id === studentId)
  if (results.length === 0) return undefined
  return results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
}

export function saveResumeAnalysis(analysis: ResumeAnalysis) {
  const db = getDB()
  const idx = db.resume_analyses.findIndex(r => r.id === analysis.id)
  if (idx >= 0) db.resume_analyses[idx] = analysis
  else db.resume_analyses.push(analysis)
  saveDB(db)
}

export function getResumeAnalysisByStudent(studentId: string): ResumeAnalysis | undefined {
  const db = getDB()
  const results = db.resume_analyses.filter(r => r.student_id === studentId)
  return results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
}

export function saveTrackingEvent(event: TrackingEvent) {
  const db = getDB()
  const idx = db.tracking_events.findIndex(e => e.id === event.id)
  if (idx >= 0) db.tracking_events[idx] = event
  else db.tracking_events.push(event)
  saveDB(db)
}

export function getTrackingEvents(userId: string): TrackingEvent[] {
  const db = getDB()
  return db.tracking_events.filter(e => e.user_id === userId)
}
