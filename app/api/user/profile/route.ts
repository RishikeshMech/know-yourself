import { NextResponse } from 'next/server'
import { findProfileByPrn, getProfileById, saveProfile } from '@/lib/db'
import { isSupabaseConfigured } from '@/lib/supabase'
import { resolveStudentAccess } from '@/lib/studentAuth'
import { persistProfileOutcome, readProfile } from '@/lib/persist'
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

/** Fields a partial update may touch — everything else is ignored. */
const PARTIAL_FIELDS = [
  'full_name', 'prn', 'phone', 'dob', 'gender', 'degree', 'college',
  'graduation_year', 'cgpa', 'skills', 'linkedin_url', 'github_url', 'ai_avatar',
] as const

const PRN_ERROR = `PRN must be ${PRN_MIN_LENGTH}–${PRN_MAX_LENGTH} letters/numbers, or left blank.`
const PRN_TAKEN = 'That PRN is already registered to another account.'

/** Maps a failed Supabase write to the status and message the candidate can act on. */
function writeFailure(outcome: { code?: string; message?: string }) {
  if (outcome.code === '23505') return NextResponse.json({ error: PRN_TAKEN }, { status: 409 })
  if (outcome.code === '42501') return NextResponse.json({ error: 'Your session has expired — please sign in again.' }, { status: 401 })
  return NextResponse.json(
    { error: 'We could not save your profile right now. Your details are unchanged — please try again.' },
    { status: 503 },
  )
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const userId = url.searchParams.get('user_id') || ''
    if (!userId) return NextResponse.json({ error: 'Missing user_id' }, { status: 400 })
    const who = await resolveStudentAccess(req, userId)
    if (!who.ok) return NextResponse.json({ error: who.error }, { status: who.status })
    if (who.mode === 'supabase') {
      const { profile, error } = await readProfile(who.client, who.studentId)
      if (error) return NextResponse.json({ error: 'Could not load your profile right now — please retry.' }, { status: 503 })
      return NextResponse.json({ profile, supabase: true })
    }
    return NextResponse.json({ profile: getProfileById(who.studentId) })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to fetch profile' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const who = await resolveStudentAccess(req, body.user_id || body.id)
    if (!who.ok) return NextResponse.json({ error: who.error }, { status: who.status })
    const userId = who.studentId
    // The verified account owns the email the profile is stored under.
    const email = (who.mode === 'supabase' ? who.email : null) || String(body.email || '').trim()

    // Partial update (inline name edit, avatar save): merge into the existing row.
    if (body.partial === true) {
      let existing: any = null
      if (who.mode === 'supabase') {
        const read = await readProfile(who.client, userId)
        if (read.error) return NextResponse.json({ error: 'Could not load your profile right now — please retry.' }, { status: 503 })
        existing = read.profile
      } else {
        existing = getProfileById(userId)
      }
      if (!existing) return NextResponse.json({ error: 'Profile not found.' }, { status: 404 })

      const merged: any = { ...existing, email: existing.email || email, id: userId }
      for (const f of PARTIAL_FIELDS) {
        if (body[f] !== undefined) merged[f] = body[f]
      }
      if (merged.phone !== undefined && merged.phone !== null && merged.phone !== '') {
        merged.phone = normalizePhone(merged.phone)
      }
      if (merged.ai_avatar !== undefined && !(merged.ai_avatar && typeof merged.ai_avatar === 'object')) {
        merged.ai_avatar = null
      }
      // PRN is optional; when present it must be plausible. Uniqueness is enforced
      // by the database (profiles_prn_unique_idx) — it is never a client-side guess.
      merged.prn = normalizePrn(merged.prn)
      if (!isValidPrn(merged.prn)) return NextResponse.json({ error: PRN_ERROR }, { status: 400 })
      if (who.mode === 'local' && merged.prn && findProfileByPrn(merged.prn, userId)) {
        return NextResponse.json({ error: PRN_TAKEN }, { status: 409 })
      }
      merged.updated_at = new Date().toISOString()

      if (who.mode === 'local') {
        saveProfile(merged)
        return NextResponse.json({ profile: merged, saved: true, supabase: false, stored: 'local' })
      }
      const outcome = await persistProfileOutcome(who.client, merged)
      if (!outcome.ok) return writeFailure(outcome)
      return NextResponse.json({ profile: merged, saved: true, supabase: true, stored: 'supabase' })
    }

    // Full onboarding / edit-form save: strict validation.
    const phone = normalizePhone(body.phone)
    if (!isValidPhone(phone)) {
      return NextResponse.json({ error: `Mobile number must be exactly ${PHONE_DIGITS} digits.` }, { status: 400 })
    }
    const gender = (body.gender || '').toString()
    if (!isGender(gender)) {
      return NextResponse.json({ error: `Gender must be one of: ${GENDER_OPTIONS.join(', ')}.` }, { status: 400 })
    }
    const prn = normalizePrn(body.prn)
    if (!isValidPrn(prn)) return NextResponse.json({ error: PRN_ERROR }, { status: 400 })
    if (who.mode === 'local' && prn && findProfileByPrn(prn, userId)) {
      return NextResponse.json({ error: PRN_TAKEN }, { status: 409 })
    }
    if (!email) return NextResponse.json({ error: 'Your account has no email address.' }, { status: 400 })

    const profile = {
      id: userId,
      email,
      full_name: body.full_name || '',
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
    if (who.mode === 'local') {
      saveProfile(profile)
      return NextResponse.json({ profile, saved: true, supabase: false, stored: 'local' })
    }
    const outcome = await persistProfileOutcome(who.client, profile)
    if (!outcome.ok) return writeFailure(outcome)
    return NextResponse.json({ profile, saved: true, supabase: isSupabaseConfigured(), stored: 'supabase' })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to save profile' }, { status: 500 })
  }
}
