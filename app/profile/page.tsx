'use client'
import { StoreProvider } from '@/lib/store'
import { OnboardingFlow } from '@/components/OnboardingFlow'

/**
 * /profile is the edit-mode entry point to the same onboarding form
 * (dashboard "Edit profile" and the resume "Back" link both land here).
 * New sign-ups are sent to /onboarding instead.
 */
export default function Page() {
  return (
    <StoreProvider>
      <OnboardingFlow variant="edit" />
    </StoreProvider>
  )
}
