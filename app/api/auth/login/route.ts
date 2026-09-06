import { NextResponse } from 'next/server'
import { getUserByEmail, updateUserLogin, getLatestAssessmentResultForStudent } from '@/lib/db'
import { verifyPassword } from '@/lib/auth'
import { getServerClient } from '@/lib/supabaseServer'
import { hasAssessmentResult, supabaseSignIn } from '@/lib/persist'

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

    // Supabase mode: verify credentials against Supabase Auth.
    const sb = getServerClient()
    if (sb) {
      try {
        const auth = await supabaseSignIn(sb, { email, password })
        const hasAssessment = await hasAssessmentResult(sb, auth.user.id)
        return NextResponse.json({
          access_token: auth.access_token,
          refresh_token: auth.refresh_token,
          expires_in: 900,
          user: {
            id: auth.user.id,
            email: auth.user.email,
            role: 'student',
            institution_id: 'inst_iitm',
            name: auth.user.name || auth.user.email.split('@')[0],
          },
          has_assessment: hasAssessment,
          supabase: true,
        })
      } catch (e: any) {
        return NextResponse.json({ error: e?.message || 'Invalid credentials.' }, { status: 401 })
      }
    }

    // Local demo mode.
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
