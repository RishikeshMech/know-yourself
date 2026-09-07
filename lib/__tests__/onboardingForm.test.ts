import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeOnboardingForm, type OnboardingForm } from '../onboardingForm.ts'

const emptyForm: OnboardingForm = {
  full_name: '',
  prn: '',
  phone: '',
  dob: '',
  gender: '',
  degree: '',
  college: '',
  graduation_year: '',
  cgpa: '',
  skills: '',
  linkedin_url: '',
  github_url: '',
}

test('missing profiles produce empty controlled-input values', () => {
  assert.deepEqual(normalizeOnboardingForm(), emptyForm)
  assert.deepEqual(normalizeOnboardingForm(null), emptyForm)
  assert.deepEqual(normalizeOnboardingForm({}), emptyForm)
})

for (const value of [null, undefined]) {
  test(`${value} profile fields cannot overwrite empty strings`, () => {
    const profile = Object.fromEntries(Object.keys(emptyForm).map((key) => [key, value]))
    const form = normalizeOnboardingForm(profile)

    assert.deepEqual(form, emptyForm)
    // Validation, progress, presence checks and initials all call trim().
    for (const field of Object.values(form)) assert.equal(field.trim(), '')
  })
}

test('a signup-created profile keeps the name but leaves nullable fields empty', () => {
  const profile = Object.freeze({
    ...Object.fromEntries(Object.keys(emptyForm).map((key) => [key, null])),
    id: 'u1',
    email: 'new@uni.edu',
    full_name: 'Priya Sharma',
  })
  const form = normalizeOnboardingForm(profile)

  assert.deepEqual(form, {
    ...emptyForm,
    id: profile.id,
    email: profile.email,
    full_name: profile.full_name,
  })
  assert.equal(form.degree.trim(), '')
  assert.equal(form.college.trim(), '')
  assert.equal(Boolean(form.skills.trim() || form.linkedin_url.trim() || form.github_url.trim()), false)
})

test('populated profiles retain text and normalize phone and numeric inputs', () => {
  const profile = {
    full_name: 'Priya Sharma',
    phone: '+91 98765 43210',
    dob: '2003-04-11',
    gender: 'Female',
    degree: 'B.Tech CSE',
    college: 'IIT Madras',
    graduation_year: 2026,
    cgpa: 8.7,
    skills: 'Python, React, SQL',
    prn: ' 21cs1042 ',
    linkedin_url: 'https://linkedin.com/in/priya',
    github_url: 'https://github.com/priya',
  }
  const form = normalizeOnboardingForm(profile)

  assert.deepEqual(form, {
    ...profile,
    prn: '21CS1042',
    phone: '9876543210',
    graduation_year: '2026',
    cgpa: '8.7',
  })
  assert.deepEqual(normalizeOnboardingForm(form), form)
  assert.equal(profile.phone, '+91 98765 43210')
  assert.equal(profile.cgpa, 8.7)
})

test('zero-valued numeric inputs are not mistaken for missing values', () => {
  const form = normalizeOnboardingForm({ graduation_year: 0, cgpa: 0 })

  assert.equal(form.graduation_year, '0')
  assert.equal(form.cgpa, '0')
})

test('profile metadata is preserved for edit-form saves', () => {
  const metadata = {
    id: 'u1',
    email: 'returning@uni.edu',
    updated_at: '2026-09-07T12:00:00.000Z',
    ai_avatar: { seed: 42, style: 'illustrated', version: 1 },
  }

  assert.deepEqual(normalizeOnboardingForm(metadata), { ...emptyForm, ...metadata })
})

test('a null PRN loads as blank and a real one is canonicalized', () => {
  // Optional field: a signup-seeded row must not put "null" in the input.
  assert.equal(normalizeOnboardingForm({ prn: null }).prn, '')
  assert.equal(normalizeOnboardingForm({ prn: undefined }).prn, '')
  // Canonical form is upper case with no whitespace, so re-normalizing is stable.
  assert.equal(normalizeOnboardingForm({ prn: ' 21cs 1042 ' }).prn, '21CS1042')
  const once = normalizeOnboardingForm({ prn: 'en20cs101' })
  assert.deepEqual(normalizeOnboardingForm(once), once)
})
