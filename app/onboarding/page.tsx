'use client'
import { StoreProvider } from '@/lib/store'
import { OnboardingFlow } from '@/components/OnboardingFlow'

export default function Page() {
  return (
    <StoreProvider>
      <OnboardingFlow variant="onboarding" />
    </StoreProvider>
  )
}
