'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'
import { useStore } from '@/lib/store'
import { afterSignInRoute } from '@/lib/nextStep'

export default function AuthCallbackPage() {
  const router = useRouter()
  const { setUser, setProfile } = useStore()
  const [status, setStatus] = useState('Verifying your Google session…')

  useEffect(() => {
    const handleAuth = async () => {
      try {
        const sb = getSupabase()
        if (sb) {
          // The shared client sets detectSessionInUrl: false, so exchange the
          // OAuth `code` in the URL manually (PKCE flow).
          const params = new URLSearchParams(window.location.search)
          const code = params.get('code')
          if (code) {
            const { error: exchangeError } = await sb.auth.exchangeCodeForSession(code)
            if (exchangeError) throw exchangeError
            // Drop the single-use code from the URL.
            window.history.replaceState({}, '', window.location.pathname)
          }

          const { data: { session }, error } = await sb.auth.getSession()
          if (error) throw error

          if (session?.user) {
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
          }
        }

        router.replace('/login')
      } catch (err: any) {
        console.warn('OAuth callback error:', err?.message)
        router.replace('/login')
      }
    }

    handleAuth()
  }, [router, setProfile, setUser])

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="glass-card animate-fade-up flex max-w-sm items-center gap-3 px-6 py-4">
        <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
        <span className="text-sm font-bold text-slate-700">{status}</span>
      </div>
    </div>
  )
}
