'use client'
import { useEffect, useRef, useState } from 'react'
import { StoreProvider, useStore } from '@/lib/store'
import { OnboardingFlow } from '@/components/OnboardingFlow'
import { isProfileComplete } from '@/lib/validate'

/**
 * Onboarding is a ONE-TIME step per profile. Fresh sign-ups flow here from
 * /login; anyone whose profile is already complete is redirected to
 * /profile instead — so returning users can never be "stuck" on onboarding
 * (and "See My Profile" in the navbar is a real profile page, not this form).
 *
 * The completion state is captured on page load. Completing the form during
 * this visit does NOT trigger the redirect — the wizard's own "Profile saved"
 * overlay takes the user to the resume step.
 */
function Guard() {
  const { user, profile, setProfile, hydrated } = useStore()
  const initiallyComplete = useRef<boolean | null>(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    if (!hydrated || !user) return
    // First knowledge of the profile (from localStorage) decides "one time".
    if (initiallyComplete.current === null) {
      initiallyComplete.current = isProfileComplete(profile)
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
            if (isProfileComplete(d.profile)) initiallyComplete.current = true
          }
        })
        .catch(() => {})
        .finally(() => setChecking(false))
    }
  }, [hydrated, user, profile, setProfile])

  useEffect(() => {
    if (initiallyComplete.current === true) window.location.replace('/profile')
  })

  if (checking) return null
  return <OnboardingFlow variant="onboarding" />
}

export default function Page() {
  return (
    <StoreProvider>
      <Guard />
    </StoreProvider>
  )
}
