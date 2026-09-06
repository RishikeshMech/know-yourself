import { NextResponse } from 'next/server'
import { getProfileById, saveProfile } from '@/lib/db'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const userId = url.searchParams.get('user_id') || ''
    if (!userId) return NextResponse.json({ error: 'Missing user_id' }, { status: 400 })
    const profile = getProfileById(userId)
    return NextResponse.json({ profile })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to fetch profile' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const profile = {
      id: body.user_id || body.id,
      email: body.email || '',
      full_name: body.full_name || '',
      phone: body.phone || '',
      dob: body.dob || '',
      gender: body.gender || '',
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
    return NextResponse.json({ profile, saved: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to save profile' }, { status: 500 })
  }
}
