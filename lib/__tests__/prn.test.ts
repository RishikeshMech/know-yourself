import test from 'node:test'
import assert from 'node:assert/strict'

import {
  PRN_MAX_LENGTH,
  PRN_MIN_LENGTH,
  isProfileComplete,
  isValidPrn,
  normalizePrn,
} from '../validate.ts'

/** A profile that has completed the onboarding wizard — without a PRN. */
const completeProfile = {
  id: 'u1',
  email: 'priya@uni.edu',
  full_name: 'Priya Sharma',
  phone: '9876543210',
  dob: '2003-04-11',
  gender: 'Female',
  degree: 'B.Tech CSE',
  college: 'COEP Pune',
  graduation_year: 2026,
  cgpa: 8.4,
}

/* ------------------------------------------------------------------ */
/* normalizePrn                                                        */
/* ------------------------------------------------------------------ */

test('normalizing drops whitespace and uppercases', () => {
  assert.equal(normalizePrn(' 21cs1042 '), '21CS1042')
  assert.equal(normalizePrn('2021 / coep / 001'), '2021/COEP/001')
  assert.equal(normalizePrn('\ten 20cs 101\n'), 'EN20CS101')
})

test('missing values normalize to an empty string', () => {
  for (const value of [null, undefined, '', '   ']) {
    assert.equal(normalizePrn(value), '')
  }
})

/* ------------------------------------------------------------------ */
/* isValidPrn — optional, but validated when supplied                  */
/* ------------------------------------------------------------------ */

test('a blank PRN is always valid because the field is optional', () => {
  for (const value of [null, undefined, '', '   ']) {
    assert.equal(isValidPrn(value), true, `${JSON.stringify(value)} must pass`)
  }
})

test('real-world PRN formats are accepted', () => {
  for (const prn of ['21CS1042', 'en20cs101', '2021COEP001', '2021/COEP/001', 'CS-21-1042', 'AB_99_01']) {
    assert.equal(isValidPrn(prn), true, `${prn} must pass`)
  }
})

test('too-short, too-long and punctuated PRNs are rejected', () => {
  assert.equal(isValidPrn('21C'), false)                       // below PRN_MIN_LENGTH
  assert.equal(isValidPrn('x'.repeat(PRN_MAX_LENGTH + 1)), false)
  assert.equal(isValidPrn('21CS1042!'), false)
  assert.equal(isValidPrn('-21CS1042'), false)                 // must start alphanumeric
  assert.equal(isValidPrn('PRN 2021@COEP'), false)
  assert.equal(isValidPrn('x'.repeat(PRN_MAX_LENGTH)), true)   // boundary is inclusive
  assert.equal(isValidPrn('x'.repeat(PRN_MIN_LENGTH)), true)
})

/* ------------------------------------------------------------------ */
/* A missing PRN never blocks onboarding                               */
/* ------------------------------------------------------------------ */

test('a complete profile stays complete with or without a PRN', () => {
  assert.equal(isProfileComplete(completeProfile), true)
  assert.equal(isProfileComplete({ ...completeProfile, prn: '' }), true)
  assert.equal(isProfileComplete({ ...completeProfile, prn: '21CS1042' }), true)
  // …and it is still not part of the required-field check.
  assert.equal(isProfileComplete({ ...completeProfile, prn: '21CS1042', cgpa: 0 }), false)
})
