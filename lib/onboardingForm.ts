import { normalizePhone, normalizePrn } from './validate.ts'

export type OnboardingForm = {
  full_name: string
  /** College PRN / permanent registration number — optional. */
  prn: string
  phone: string
  dob: string
  gender: string
  degree: string
  college: string
  graduation_year: string
  cgpa: string
  skills: string
  linkedin_url: string
  github_url: string
}

/**
 * Saved profiles can contain nulls (especially signup-created Supabase rows).
 * Normalize every input before it reaches form validation or rendering; simply
 * spreading a profile over empty defaults lets those nulls overwrite them.
 * Keep metadata such as ai_avatar intact for edit-form saves.
 */
export function normalizeOnboardingForm(profile?: Record<string, unknown> | null): OnboardingForm {
  const p = profile ?? {}
  return {
    ...p,
    full_name: String(p.full_name ?? ''),
    prn: normalizePrn(p.prn),
    phone: normalizePhone(p.phone),
    dob: String(p.dob ?? ''),
    gender: String(p.gender ?? ''),
    degree: String(p.degree ?? ''),
    college: String(p.college ?? ''),
    graduation_year: String(p.graduation_year ?? ''),
    cgpa: String(p.cgpa ?? ''),
    skills: String(p.skills ?? ''),
    linkedin_url: String(p.linkedin_url ?? ''),
    github_url: String(p.github_url ?? ''),
  }
}
