import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'

const DB_FILE = path.join(process.cwd(), 'calibiai_db.json')

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
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8')
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
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8')
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
