import { NextResponse } from 'next/server'
import { getUserByEmail, updateUserLogin, getLatestAssessmentResultForStudent } from '@/lib/db'
import { verifyPassword } from '@/lib/auth'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const email = (body.email || '').toString().trim()
    const password = (body.password || '').toString()
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
    }
    if (!password || password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 })
    }
    const user = getUserByEmail(email)
    if (!user) {
      return NextResponse.json({ error: 'Account not found. Please sign up first.' }, { status: 404 })
    }
    if (!verifyPassword(password, user.password_hash)) {
      return NextResponse.json({ error: 'Invalid password.' }, { status: 401 })
    }
    updateUserLogin(user.id)
    return NextResponse.json({
      access_token: 'jwt_' + user.id,
      refresh_token: 'refresh_' + user.id,
      expires_in: 900,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        institution_id: user.institution_id,
        name: user.name || user.email.split('@')[0],
      },
      has_assessment: !!getLatestAssessmentResultForStudent(user.id),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Sign in failed.' }, { status: 500 })
  }
}
