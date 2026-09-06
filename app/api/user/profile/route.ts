import { NextResponse } from 'next/server'
import { getProfileById, saveProfile } from '@/lib/db'
import { getServerClient } from '@/lib/supabaseServer'
import { persistProfile } from '@/lib/persist'
import {
  GENDER_OPTIONS,
  PHONE_DIGITS,
  isGender,
  isValidPhone,
  normalizePhone,
} from '@/lib/validate'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const userId = url.searchParams.get('user_id') || ''
    if (!userId) return NextResponse.json({ error: 'Missing user_id' }, { status: 400 })
    const sb = getServerClient()
    if (sb) {
      const { data } = await sb.from('profiles').select('*').eq('id', userId).maybeSingle()
      if (data) return NextResponse.json({ profile: data, supabase: true })
    }
    const profile = getProfileById(userId)
    return NextResponse.json({ profile })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to fetch profile' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    // Phone: exactly 10 digits (country code / trunk prefix are stripped).
    const phone = normalizePhone(body.phone)
    if (!isValidPhone(phone)) {
      return NextResponse.json(
        { error: `Mobile number must be exactly ${PHONE_DIGITS} digits.` },
        { status: 400 },
      )
    }
    // Gender: fixed dropdown — Male / Female / Other only.
    const gender = (body.gender || '').toString()
    if (!isGender(gender)) {
      return NextResponse.json(
        { error: `Gender must be one of: ${GENDER_OPTIONS.join(', ')}.` },
        { status: 400 },
      )
    }
    const profile = {
      id: body.user_id || body.id,
      email: body.email || '',
      full_name: body.full_name || '',
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
      updated_at: new Date().toISOString(),
    }
    saveProfile(profile)
    // Mirror everything (mobile, gender, degree, …) into Supabase when configured.
    const sb = getServerClient()
    let supabase = false
    if (sb) supabase = await persistProfile(sb, profile)
    return NextResponse.json({ profile, saved: true, supabase })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to save profile' }, { status: 500 })
  }
}
