import { NextResponse } from 'next/server'
import { ADMIN_COOKIE, ADMIN_USERNAME, adminConfigProblem, adminPassword, safeEqual, signSession } from '@/lib/adminAuth'

export async function POST(req: Request) {
  try {
    // Fail closed: a production server without its admin secrets cannot sign anyone in.
    if (adminConfigProblem()) {
      return NextResponse.json({ error: 'Admin sign-in is not configured on this server.' }, { status: 503 })
    }
    const body = await req.json().catch(() => ({}))
    const username = String(body.username || '').trim()
    const password = String(body.password || '')
    const expected = adminPassword() || ''
    if (!safeEqual(username, ADMIN_USERNAME) || !safeEqual(password, expected)) {
      return NextResponse.json({ error: 'Invalid username or password.' }, { status: 401 })
    }
    const res = NextResponse.json({ ok: true, message: 'Signed in.' })
    res.cookies.set(ADMIN_COOKIE, signSession(), {
      httpOnly: true,
      sameSite: 'lax',
      secure: req.url?.startsWith('https') ?? false,
      path: '/',
      maxAge: 8 * 60 * 60,
    })
    return res
  } catch {
    return NextResponse.json({ error: 'Sign in failed.' }, { status: 500 })
  }
}
