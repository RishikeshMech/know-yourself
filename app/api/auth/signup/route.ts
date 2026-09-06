import { NextResponse } from 'next/server'
import { getUserByEmail, createUser } from '@/lib/db'
import { hashPassword } from '@/lib/auth'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const email = (body.email || '').toString().trim()
    const password = (body.password || '').toString()
    const role = (body.role || 'student').toString()
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 })
    }
    const existing = getUserByEmail(email)
    if (existing) {
      return NextResponse.json({ error: 'email already exist' }, { status: 409 })
    }
    const user = createUser(email, hashPassword(password), role, body.institution_id || 'inst_iitm', body.full_name || email.split('@')[0])
    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        institution_id: user.institution_id,
        name: user.name,
      },
      message: 'Account created successfully.',
    }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Sign up failed.' }, { status: 500 })
  }
}
