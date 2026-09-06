/**
 * Shared validation helpers for the onboarding / profile forms.
 * Used by the client (app/onboarding, app/profile) and by the API
 * (/api/user/profile) so both sides enforce exactly the same rules.
 */

/** Gender is a fixed dropdown — no free text. */
export const GENDER_OPTIONS = ['Male', 'Female', 'Other'] as const
export type Gender = (typeof GENDER_OPTIONS)[number]

export function isGender(value: any): value is Gender {
  return typeof value === 'string' && (GENDER_OPTIONS as readonly string[]).includes(value)
}

/** Degree is a fixed dropdown of common programmes. */
export const DEGREE_OPTIONS = [
  'B.Tech CSE',
  'B.Tech IT',
  'B.Tech ECE',
  'B.Tech Electrical',
  'B.Tech Mechanical',
  'B.Tech Civil',
  'B.Sc',
  'BCA',
  'B.Com',
  'BA',
  'M.Tech',
  'MCA',
  'MBA',
  'M.Sc',
  'PhD',
  'Other',
] as const

/** Indian mobile numbers are 10 digits. */
export const PHONE_DIGITS = 10
/** Country calling code shown as a fixed prefix next to the input. */
export const PHONE_COUNTRY_CODE = '91'

/**
 * Reduces any user input ("+91 98765 43210", "09876543210", "919876543210")
 * to bare digits, dropping the country code or trunk prefix when present.
 */
export function normalizePhone(raw: any): string {
  let digits = String(raw ?? '').replace(/\D/g, '')
  if (digits.length === PHONE_DIGITS + 2 && digits.startsWith(PHONE_COUNTRY_CODE)) {
    digits = digits.slice(PHONE_COUNTRY_CODE.length)
  } else if (digits.length === PHONE_DIGITS + 1 && digits.startsWith('0')) {
    digits = digits.slice(1)
  }
  return digits
}

/** True only when the value is exactly 10 digits long. */
export function isValidPhone(raw: any): boolean {
  return normalizePhone(raw).length === PHONE_DIGITS
}

/** Groups digits for display: "98765 43210". */
export function formatPhone(raw: any): string {
  const digits = normalizePhone(raw)
  if (!digits) return ''
  if (digits.length <= 5) return digits
  return `${digits.slice(0, 5)} ${digits.slice(5)}`
}

/** Full E.164-ish display: "+91 98765 43210". */
export function formatPhoneInternational(raw: any): string {
  const formatted = formatPhone(raw)
  return formatted ? `+${PHONE_COUNTRY_CODE} ${formatted}` : ''
}

/** Age in whole years for a YYYY-MM-DD date, or null when unparseable. */
export function ageFrom(dob: any): number | null {
  const raw = String(dob ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1
  return age
}

export const MIN_AGE = 15
export const MAX_AGE = 100

export function isValidDob(dob: any): boolean {
  const age = ageFrom(dob)
  return age !== null && age >= MIN_AGE && age <= MAX_AGE
}

export const GRAD_YEAR_MIN = 2020
export const GRAD_YEAR_MAX = 2035

export function isValidGradYear(year: any): boolean {
  const n = Number(year)
  return Number.isFinite(n) && Number.isInteger(n) && n >= GRAD_YEAR_MIN && n <= GRAD_YEAR_MAX
}

export function isValidCgpa(cgpa: any): boolean {
  const n = Number(cgpa)
  return Number.isFinite(n) && n >= 0 && n <= 10
}

/** Optional-but-validated: blank passes, anything else must look like a URL. */
export function isValidUrl(url: any): boolean {
  const raw = String(url ?? '').trim()
  if (!raw) return true
  try {
    const u = new URL(raw)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * True only when the user has actually completed the onboarding form — i.e. the
 * profile row carries the required details, not just a seeded `full_name` from
 * signup-time metadata. Login uses this to route a genuinely-new user to
 * /onboarding instead of the dashboard; a signup-created profile with only a
 * name/email must NOT count as onboarded.
 */
export function isProfileComplete(p: any): boolean {
  if (!p) return false
  if (typeof p !== 'object') return false
  const fullName = String(p.full_name ?? '').trim()
  const phone = String(p.phone ?? '').trim()
  const degree = String(p.degree ?? '').trim()
  const college = String(p.college ?? '').trim()
  const dob = String(p.dob ?? '').trim()
  const gender = String(p.gender ?? '').trim()
  const gradYear = Number(p.graduation_year)
  const cgpa = Number(p.cgpa)
  // Mirrors the required fields of the onboarding form (steps 1 & 2): name,
  // phone, DOB, gender, degree, college, graduation year and CGPA. Optional
  // fields (skills, links) are intentionally not required.
  return Boolean(
    fullName &&
    phone &&
    degree &&
    college &&
    dob &&
    gender &&
    Number.isFinite(gradYear) && gradYear > 0 &&
    Number.isFinite(cgpa) && cgpa > 0,
  )
}
