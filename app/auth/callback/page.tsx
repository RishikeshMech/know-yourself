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
          const { data: { session }, error } = await sb.auth.getSession()
          if (error) throw error

          if (session?.user) {
            const user = session.user
            const email = user.email || ''
            const fullName = user.user_metadata?.full_name || user.user_metadata?.name || email.split('@')[0]

            // Fetch profile and assessment status
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

            setStatus('Authentication successful! Redirecting…')
            router.replace(dest)
            return
          }
        }

        // Fallback if no Supabase session in callback
        router.replace('/login')
      } catch (err: any) {
        console.warn('OAuth callback error:', err?.message)
        router.replace('/login')
      }
    }

    handleAuth()
  }, [router, setProfile, setUser])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-[#191834] to-[#241b4d] px-4">
      <div className="glass-card animate-fade-up max-w-sm w-full p-8 text-center text-white space-y-4">
        <div className="mx-auto w-12 h-12 rounded-full border-3 border-indigo-400 border-t-transparent animate-spin" />
        <h2 className="text-xl font-black">Google Sign-In</h2>
        <p className="text-xs text-indigo-200">{status}</p>
      </div>
    </div>
  )
}
