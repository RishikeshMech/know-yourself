'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useStore } from '@/lib/store'
import { OnboardingFlow } from '@/components/OnboardingFlow'
import { isProfileComplete } from '@/lib/validate'
import { DASHBOARD_ROUTE } from '@/lib/nextStep'
import { getLiveUser } from '@/lib/session'

/**
 * Onboarding is a ONE-TIME step per profile. Fresh sign-ups flow here from
 * /login; anyone whose profile is already complete is redirected to the student
 * dashboard (/dashboard/student) smoothly without flickering or exposing the form.
 *
 * The DB — not the localStorage cache — is the source of truth for "already
 * onboarded?". This matters because a deleted-and-recreated Supabase account
 * leaves a complete profile in localStorage, and trusting that cache is exactly
 * what bounced the fresh account straight to the dashboard.
 *
 * Completing the form during this visit does NOT trigger the redirect — the
 * wizard's own "Profile saved" overlay takes the user to the resume step.
 */
function Guard() {
  const router = useRouter()
  const { user, profile, setProfile, setUser, hydrated, reconcileForUser } = useStore()
  const checkedRef = useRef(false)
  const [checking, setChecking] = useState(false)
  const [redirecting, setRedirecting] = useState(false)

  useEffect(() => {
    if (!hydrated || !user || checkedRef.current) return
    checkedRef.current = true
    setChecking(true)
    ;(async () => {
      try {
        const live = await getLiveUser()
        if (live === null) {
          localStorage.clear()
          setUser(null)
          setChecking(false)
          router.replace('/login')
          return
        }
        let userId = user.id
        if (live && live.id !== user.id) {
          // Cached account belongs to a different live user — clear the stale
          // account data and re-hydrate from the DB before deciding.
          await reconcileForUser(live)
          userId = live.id
        }
        const res = await fetch('/api/user/profile?user_id=' + userId).then(r => r.json()).catch(() => ({}))
        const dbProfile = res?.profile || null
        if (dbProfile) {
          setProfile(dbProfile)
          if (isProfileComplete(dbProfile)) {
            setRedirecting(true)
            router.replace(DASHBOARD_ROUTE)
            return
          }
        } else if (profile) {
          // DB has no profile for this account → the cached profile is stale.
          // Clear it so the wizard starts blank instead of pre-filling old data.
          setProfile(null)
        }
      } catch { /* network hiccup — allow the form rather than bouncing */ }
      setChecking(false)
    })()
  }, [hydrated, user, setProfile, setUser, reconcileForUser, router])

  // Prevent any flash of the onboarding form while hydrating, checking the DB,
  // or redirecting an existing profile to the student dashboard.
  if (!hydrated || checking || redirecting) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="glass-card animate-fade-up flex items-center gap-3 px-6 py-4">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
          <span className="text-sm font-bold text-slate-700">Loading your profile…</span>
        </div>
      </div>
    )
  }

  return <OnboardingFlow variant="onboarding" />
}

export default function Page() {
  return <Guard />
}
