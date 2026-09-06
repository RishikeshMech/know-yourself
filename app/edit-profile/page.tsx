'use client'
import { StoreProvider } from '@/lib/store'
import { OnboardingFlow } from '@/components/OnboardingFlow'

/**
 * /edit-profile — the edit-mode entry point to the onboarding form for
 * returning users (the profile page's "✎ Edit profile" and the student
 * dashboard link here). New sign-ups are sent to /onboarding instead, which
 * is a one-time step per profile.
 */
export default function Page() {
  return (
    <StoreProvider>
      <OnboardingFlow variant="edit" />
    </StoreProvider>
  )
}
