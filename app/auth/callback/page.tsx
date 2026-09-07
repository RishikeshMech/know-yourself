'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase'
import { useStore } from '@/lib/store'
import { afterSignInRoute } from '@/lib/nextStep'
import { parseAuthCallbackUrl, hasSessionInCallbackUrl, describeAuthError } from '@/lib/oauthCallback'

export default function AuthCallbackPage() {
  const router = useRouter()
  const { setUser, setProfile } = useStore()
  const [status, setStatus] = useState('Verifying your Google session…')
  const [failure, setFailure] = useState('')

  useEffect(() => {
    const handleAuth = async () => {
      try {
        const sb = getSupabase()
        if (!sb || !isSupabaseConfigured()) {
          throw new Error('Supabase is not configured on this deployment (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).')
        }

        // Supabase returns the OAuth result in the query string (PKCE `?code=`)
        // or in the fragment (implicit `#access_token=`) depending on the
        // project's flow type. Read both — looking at only `location.search`
        // was what silently bounced every Google login back to /login.
        const cb = parseAuthCallbackUrl(window.location.href)

        if (cb.error) {
          throw new Error(describeAuthError(cb))
        }

        if (cb.code) {
          // PKCE flow. The shared client sets detectSessionInUrl: false so
          // supabase-js has not already consumed this single-use code.
          const { error: exchangeError } = await sb.auth.exchangeCodeForSession(cb.code)
          if (exchangeError) throw exchangeError
        } else if (cb.accessToken && cb.refreshToken) {
          // Implicit flow fallback — keeps the callback working even if the
          // Supabase project is switched back to the implicit grant.
          const { error: sessionError } = await sb.auth.setSession({
            access_token: cb.accessToken,
            refresh_token: cb.refreshToken,
          })
          if (sessionError) throw sessionError
        } else if (!hasSessionInCallbackUrl(cb)) {
          // No code, no tokens and no error: Supabase rejected our
          // `redirect_to` (it is not on the project's Redirect URL allow list)
          // and fell back to the Site URL. Say so instead of looping.
          throw new Error(
            'No session was returned to ' + window.location.origin + '/auth/callback. ' +
            'Add that exact URL to Supabase → Authentication → URL Configuration → Redirect URLs.',
          )
        }

        // Drop the single-use code / token from the address bar.
        window.history.replaceState({}, '', window.location.pathname)

        const { data: { session }, error } = await sb.auth.getSession()
        if (error) throw error

        if (!session?.user) {
          throw new Error('Supabase did not return a session for this callback.')
        }

        const user = session.user
        const email = user.email || ''
        const fullName = user.user_metadata?.full_name || user.user_metadata?.name || email.split('@')[0]

        const res = await fetch('/api/user/profile?user_id=' + user.id).then(r => r.json()).catch(() => ({}))
        const profile = res.profile

        setUser({
          id: user.id,
          email,
          role: user.user_metadata?.role || 'student',
          institution_id: 'inst_iitm',
          name: profile?.full_name || fullName,
        })
        if (profile) setProfile(profile)

        const scoresRes = await fetch('/api/user/scores?student_id=' + user.id).then(r => r.json()).catch(() => ({}))
        const hasAssessment = !!scoresRes.result

        const dest = afterSignInRoute({
          has_assessment: hasAssessment,
          has_onboarding: Boolean(profile && profile.degree && profile.college),
        })

        setStatus('Signed in! Redirecting…')
        router.replace(dest)
        return
      } catch (err: any) {
        // NEVER redirect silently here: a bounce to /login with no message is
        // exactly what made this OAuth failure undiagnosable. Show the reason
        // and let the candidate retry.
        console.error('[auth/callback] sign-in failed:', err?.message || err)
        setFailure(err?.message || 'Google sign-in could not be completed.')
      }
    }

    handleAuth()
  }, [router, setProfile, setUser])

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      {failure ? (
        <div className="glass-card animate-fade-up w-full max-w-md px-6 py-6">
          <h1 className="font-display text-lg font-extrabold tracking-tight text-slate-900">
            Sign-in did not finish
          </h1>
          <p className="mt-2 break-words text-sm font-semibold text-rose-600">{failure}</p>
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={() => router.replace('/login')}
              className="btn-primary flex-1 !py-2.5 text-sm"
            >
              Back to login
            </button>
          </div>
        </div>
      ) : (
        <div className="glass-card animate-fade-up flex max-w-sm items-center gap-3 px-6 py-4">
          <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
          <span className="text-sm font-bold text-slate-700">{status}</span>
        </div>
      )}
    </div>
  )
}
