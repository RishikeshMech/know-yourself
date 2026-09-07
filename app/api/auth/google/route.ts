import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import {
  getUserByEmail,
  createUser,
  updateUserLogin,
  getProfileById,
  saveProfile,
  getLatestAssessmentResultForStudent,
} from '@/lib/db'
import { hashPassword } from '@/lib/auth'
import { isProfileComplete } from '@/lib/validate'
import { afterSignInRoute, ONBOARDING_ROUTE } from '@/lib/nextStep'
import { getServerClient } from '@/lib/supabaseServer'
import { fetchProfile, hasAssessmentResult, persistProfile } from '@/lib/persist'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const email = (body.email || '').toString().trim().toLowerCase()
    const fullName = (body.full_name || body.name || email.split('@')[0] || 'Student').toString().trim()
    const role = (body.role || 'student').toString()
    const institutionId = body.institution_id || 'inst_iitm'

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Please provide a valid Google email address.' }, { status: 400 })
    }

    // Check if Supabase backend is configured
    const sb = getServerClient()
    if (sb) {
      try {
        let profile = await fetchProfile(sb, email).catch(() => null)
        let userId = profile?.id || 'u_' + randomUUID().split('-')[0]
        const hasAssessment = await hasAssessmentResult(sb, userId).catch(() => false)
        const hasOnboarding = isProfileComplete(profile)
        const dest = afterSignInRoute({ has_assessment: hasAssessment, has_onboarding: hasOnboarding })

        if (!profile) {
          await persistProfile(sb, { id: userId, email, full_name: fullName }).catch(() => {})
        }

        return NextResponse.json({
          ok: true,
          access_token: 'sb_oauth_' + userId,
          refresh_token: 'sb_refresh_' + userId,
          expires_in: 3600,
          user: {
            id: userId,
            email,
            role,
            institution_id: institutionId,
            name: profile?.full_name?.trim() || fullName,
          },
          profile: profile || null,
          has_assessment: hasAssessment,
          has_onboarding: hasOnboarding,
          redirect_to: dest,
          supabase: true,
        })
      } catch (e: any) {
        console.warn('Supabase Google auth fallback to local DB:', e?.message)
      }
    }

    // Local DB Engine
    let user = getUserByEmail(email)
    let isNewUser = false

    if (!user) {
      isNewUser = true
      user = createUser(
        email,
        hashPassword(randomUUID()),
        role,
        institutionId,
        fullName
      )
      // Save initial profile stub with name and email
      const newProfile = {
        id: user.id,
        email: user.email,
        full_name: fullName,
        updated_at: new Date().toISOString(),
      }
      saveProfile(newProfile)
    } else {
      updateUserLogin(user.id)
    }

    const profile = getProfileById(user.id)
    const hasAssessment = !!getLatestAssessmentResultForStudent(user.id)
    const hasOnboarding = !isNewUser && isProfileComplete(profile)
    const dest = isNewUser ? ONBOARDING_ROUTE : afterSignInRoute({ has_assessment: hasAssessment, has_onboarding: hasOnboarding })

    return NextResponse.json({
      ok: true,
      access_token: 'jwt_google_' + user.id,
      refresh_token: 'refresh_google_' + user.id,
      expires_in: 3600,
      user: {
        id: user.id,
        email: user.email,
        role: user.role || role,
        institution_id: user.institution_id || institutionId,
        name: profile?.full_name?.trim() || user.name || fullName,
      },
      profile: profile || null,
      has_assessment: hasAssessment,
      has_onboarding: hasOnboarding,
      redirect_to: dest,
      is_new: isNewUser,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Google sign-in failed. Please try again.' }, { status: 500 })
  }
}
