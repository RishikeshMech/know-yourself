import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isProfileComplete } from '../validate.ts'
import { afterSignInRoute, ONBOARDING_ROUTE, DASHBOARD_ROUTE } from '../nextStep.ts'

test('Google auth: first-time user without completed profile routes to onboarding', () => {
  const flags = { has_assessment: false, has_onboarding: false }
  const dest = afterSignInRoute(flags)
  assert.equal(dest, ONBOARDING_ROUTE)
})

test('Google auth: existing user with completed profile routes to student dashboard', () => {
  const flags = { has_assessment: false, has_onboarding: true }
  const dest = afterSignInRoute(flags)
  assert.equal(dest, DASHBOARD_ROUTE)
})

test('Google auth: existing user with assessment results routes to student dashboard', () => {
  const flags = { has_assessment: true, has_onboarding: false }
  const dest = afterSignInRoute(flags)
  assert.equal(dest, DASHBOARD_ROUTE)
})

test('Google auth profile completeness verification', () => {
  const newProfile = { id: 'u_123', email: 'alex.google@example.com', full_name: 'Alex Rivera' }
  assert.equal(isProfileComplete(newProfile), false)

  const completeProfile = {
    id: 'u_123',
    email: 'alex.google@example.com',
    full_name: 'Alex Rivera',
    phone: '9876543210',
    dob: '2002-05-15',
    gender: 'Male',
    degree: 'B.Tech',
    college: 'IIT Madras',
    graduation_year: 2026,
    cgpa: 8.8,
  }
  assert.equal(isProfileComplete(completeProfile), true)
  assert.equal(afterSignInRoute({ has_onboarding: isProfileComplete(completeProfile) }), DASHBOARD_ROUTE)
})
