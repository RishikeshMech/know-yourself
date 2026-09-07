'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useStore } from '@/lib/store'
import { OnboardingFlow } from '@/components/OnboardingFlow'
import { isProfileComplete } from '@/lib/validate'
import { DASHBOARD_ROUTE } from '@/lib/nextStep'

/**
 * Onboarding is a ONE-TIME step per profile. Fresh sign-ups flow here from
 * /login; anyone whose profile is already complete is redirected to the student
 * dashboard (/dashboard/student) smoothly without flickering or exposing the form.
 *
 * The completion state is captured on page load. Completing the form during
 * this visit does NOT trigger the redirect — the wizard's own "Profile saved"
 * overlay takes the user to the resume step.
 */
function Guard() {
  const router = useRouter()
  const { user, profile, setProfile, hydrated } = useStore()
  const initiallyComplete = useRef<boolean | null>(null)
  const [checking, setChecking] = useState(false)
  const [redirecting, setRedirecting] = useState(false)

  useEffect(() => {
    if (!hydrated) return
    if (!user) return

    // First knowledge of the profile (from store/localStorage) decides "one time".
    if (initiallyComplete.current === null) {
      const complete = isProfileComplete(profile)
      initiallyComplete.current = complete
      if (complete) {
        setRedirecting(true)
        router.replace(DASHBOARD_ROUTE)
        return
      }
    }

    // No profile locally → check the DB (returning user on a fresh device /
    // cleared storage). Only the load-time state may cause a redirect.
    if (initiallyComplete.current === false && !profile) {
      setChecking(true)
      fetch('/api/user/profile?user_id=' + user.id)
        .then(r => r.json())
        .then(d => {
          if (d.profile) {
            setProfile(d.profile)
            if (isProfileComplete(d.profile)) {
              initiallyComplete.current = true
              setRedirecting(true)
              router.replace(DASHBOARD_ROUTE)
            }
          }
        })
        .catch(() => {})
        .finally(() => setChecking(false))
    }
  }, [hydrated, user, profile, setProfile, router])

  // Prevent any flash of the onboarding form if we are still hydrating, checking the DB,
  // or redirecting an existing profile to the student dashboard.
  if (!hydrated || checking || redirecting || initiallyComplete.current === true) {
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
