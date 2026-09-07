import test from 'node:test'
import assert from 'node:assert/strict'

import { afterSignInRoute, signedInLandingRoute, ONBOARDING_ROUTE, DASHBOARD_ROUTE } from '../nextStep.ts'

/** The row `/api/auth/signup` writes: a name and an email, nothing else. */
const signupSeededProfile = { id: 'u1', email: 'new@uni.edu', full_name: 'new' }

/** A profile that has actually been through the onboarding wizard. */
const completeProfile = {
  ...signupSeededProfile,
  full_name: 'Prajwal Gulhane',
  phone: '9876543210',
  degree: 'B.Tech CSE',
  college: 'COEP Pune',
  dob: '2003-04-11',
  gender: 'Male',
  graduation_year: 2026,
  cgpa: 8.4,
}

/* ------------------------------------------------------------------ */
/* afterSignInRoute — the flags /api/auth/login returns                */
/* ------------------------------------------------------------------ */

test('a brand-new sign-in goes to onboarding, not the dashboard', () => {
  assert.equal(afterSignInRoute({ has_assessment: false, has_onboarding: false }), ONBOARDING_ROUTE)
})

test('missing flags are treated as "nothing done yet"', () => {
  assert.equal(afterSignInRoute({}), ONBOARDING_ROUTE)
  assert.equal(afterSignInRoute(), ONBOARDING_ROUTE)
})

test('a completed profile goes to the dashboard', () => {
  assert.equal(afterSignInRoute({ has_onboarding: true }), DASHBOARD_ROUTE)
})

test('an existing assessment result goes to the dashboard', () => {
  assert.equal(afterSignInRoute({ has_assessment: true }), DASHBOARD_ROUTE)
})

/* ------------------------------------------------------------------ */
/* signedInLandingRoute — landing on / or /login with a live session   */
/* ------------------------------------------------------------------ */

test('no profile at all means onboarding', () => {
  assert.equal(signedInLandingRoute(null), ONBOARDING_ROUTE)
  assert.equal(signedInLandingRoute(undefined), ONBOARDING_ROUTE)
})

test('a signup-seeded profile (name + email only) is NOT onboarded', () => {
  // This is the case that used to drop new users on /dashboard/student.
  assert.equal(signedInLandingRoute(signupSeededProfile), ONBOARDING_ROUTE)
})

test('a completed profile goes to the dashboard', () => {
  assert.equal(signedInLandingRoute(completeProfile), DASHBOARD_ROUTE)
})

test('a partially filled profile still needs onboarding', () => {
  assert.equal(signedInLandingRoute({ ...completeProfile, cgpa: 0 }), ONBOARDING_ROUTE)
  assert.equal(signedInLandingRoute({ ...completeProfile, phone: '' }), ONBOARDING_ROUTE)
})
