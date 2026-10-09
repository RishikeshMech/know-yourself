import { NextResponse } from 'next/server'
import { findProfileByPrn, getProfileById, saveProfile } from '@/lib/db'
import { persistProfile, PROFILE_SELECT } from '@/lib/persist'
import { requireStudentApi } from '@/lib/studentApi'
import {
  GENDER_OPTIONS,
  PHONE_DIGITS,
  PRN_MAX_LENGTH,
  PRN_MIN_LENGTH,
  isGender,
  isValidPhone,
  isValidPrn,
  normalizePhone,
  normalizePrn,
} from '@/lib/validate'

export const dynamic = 'force-dynamic'

const PARTIAL_FIELDS = [
  'full_name', 'prn', 'phone', 'dob', 'gender', 'degree', 'college',
  'graduation_year', 'cgpa', 'skills', 'linkedin_url', 'github_url', 'ai_avatar',
] as const
const PRN_ERROR = `PRN must be ${PRN_MIN_LENGTH}–${PRN_MAX_LENGTH} letters/numbers, or left blank.`

function persistenceUnavailable() {
  return NextResponse.json(
    { error: 'Your profile could not be saved to Supabase. Please retry.' },
    { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '10' } },
  )
}

async function profileFor(db: any, userId: string): Promise<any | null> {
  const { data, error } = await db.from('profiles').select(PROFILE_SELECT).eq('id', userId).maybeSingle()
  if (error) throw error
  return data || null
}

async function prnAlreadyTaken(prn: string, userId: string, db: any): Promise<boolean> {
  if (!prn) return false
  if (!db) return Boolean(findProfileByPrn(prn, userId))
  const { data, error } = await db.from('profiles').select('id').eq('prn', prn).neq('id', userId).limit(1)
  if (error) throw error
  return Array.isArray(data) && data.length > 0
}

async function saveProfileForStudent(ctx: { supabase: boolean; db: any; studentId: string }, profile: any) {
  if (ctx.supabase) {
    const ok = await persistProfile(ctx.db, { ...profile, id: ctx.studentId })
    return ok
  }
  saveProfile({ ...profile, id: ctx.studentId })
  return true
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const ctx = await requireStudentApi(req, url.searchParams.get('user_id'))
  if (!ctx.ok) return ctx.response
  try {
    const profile = ctx.supabase
      ? await profileFor(ctx.db, ctx.studentId)
      : getProfileById(ctx.studentId) || null
    return NextResponse.json({ profile, supabase: ctx.supabase }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    console.error('[api/user/profile] GET failed:', e?.message || e)
    return persistenceUnavailable()
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const ctx = await requireStudentApi(req, body.user_id || body.id)
    if (!ctx.ok) return ctx.response
    const userId = ctx.studentId
    const existing = ctx.supabase ? await profileFor(ctx.db, userId) : getProfileById(userId) || null

    if (body.partial === true) {
      if (!existing) return NextResponse.json({ error: 'Profile not found.' }, { status: 404 })
      const merged: any = { ...existing, id: userId, email: existing.email || String(body.email || '') }
      for (const field of PARTIAL_FIELDS) {
        if (body[field] !== undefined) merged[field] = body[field]
      }
      if (merged.phone !== undefined && merged.phone !== null && merged.phone !== '') merged.phone = normalizePhone(merged.phone)
      if (merged.ai_avatar !== undefined && !(merged.ai_avatar && typeof merged.ai_avatar === 'object')) merged.ai_avatar = null
      merged.prn = normalizePrn(merged.prn)
      if (!isValidPrn(merged.prn)) return NextResponse.json({ error: PRN_ERROR }, { status: 400 })
      if (await prnAlreadyTaken(merged.prn, userId, ctx.supabase ? ctx.db : null)) {
        return NextResponse.json({ error: 'That PRN is already registered to another account.' }, { status: 409 })
      }
      merged.updated_at = new Date().toISOString()
      if (!(await saveProfileForStudent(ctx, merged))) return persistenceUnavailable()
      return NextResponse.json({ profile: merged, saved: true, supabase: ctx.supabase }, { headers: { 'Cache-Control': 'no-store' } })
    }

    const phone = normalizePhone(body.phone)
    if (!isValidPhone(phone)) {
      return NextResponse.json({ error: `Mobile number must be exactly ${PHONE_DIGITS} digits.` }, { status: 400 })
    }
    const gender = String(body.gender || '')
    if (!isGender(gender)) {
      return NextResponse.json({ error: `Gender must be one of: ${GENDER_OPTIONS.join(', ')}.` }, { status: 400 })
    }
    const prn = normalizePrn(body.prn)
    if (!isValidPrn(prn)) return NextResponse.json({ error: PRN_ERROR }, { status: 400 })
    if (await prnAlreadyTaken(prn, userId, ctx.supabase ? ctx.db : null)) {
      return NextResponse.json({ error: 'That PRN is already registered to another account.' }, { status: 409 })
    }

    const profile = {
      id: userId,
      // Email is an auth attribute, not an editable profile field. Keep the
      // existing trusted value where available; a submitted value is only a
      // bootstrap fallback for local demo accounts.
      email: existing?.email || String(body.email || ''),
      full_name: String(body.full_name || ''),
      prn,
      phone,
      dob: body.dob || '',
      gender,
      degree: body.degree || '',
      college: body.college || '',
      graduation_year: Number(body.graduation_year) || 0,
      cgpa: Number(body.cgpa) || 0,
      skills: body.skills || '',
      linkedin_url: body.linkedin_url || '',
      github_url: body.github_url || '',
      ai_avatar: body.ai_avatar && typeof body.ai_avatar === 'object' ? body.ai_avatar : null,
      updated_at: new Date().toISOString(),
    }
    if (!(await saveProfileForStudent(ctx, profile))) return persistenceUnavailable()
    return NextResponse.json({ profile, saved: true, supabase: ctx.supabase }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    console.error('[api/user/profile] POST failed:', e?.message || e)
    return persistenceUnavailable()
  }
}
