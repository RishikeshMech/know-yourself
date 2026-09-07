/**
 * Routing decisions for a signed-in student.
 *
 * Kept in one place because three different entry points used to disagree:
 * `/api/auth/login` computed "has this person actually onboarded?", but the
 * guards on `/login` and `/` hard-coded `/dashboard/student` for *any*
 * signed-in user — so a brand-new account (including one arriving back from
 * the Supabase confirmation email) was dropped on the student dashboard with
 * an empty profile instead of on the form where they fill it in.
 *
 * `/onboarding` is the profile-creation wizard (About you → Academics → Your
 * presence). Its own guard forwards to `/profile` when the profile is already
 * complete, so sending people there is safe for returners too.
 */
// Explicit .ts extension so this module can also be exercised directly by
// `npm test` (Node's type-stripping loader requires full specifiers). Webpack
// resolves it to the same file.
import { isProfileComplete } from './validate.ts'

export const ONBOARDING_ROUTE = '/onboarding'
export const DASHBOARD_ROUTE = '/dashboard/student'

/**
 * Where a student belongs once their one-time attempt is over: the student
 * dashboard. It carries the latest CalibiAI Score, "View report", the PDF
 * download and the resume card — i.e. everything a finished candidate needs.
 *
 * This used to be `/profile`, a details-and-edit page with no next steps, so
 * submitting the assessment (or revisiting `/assessment`, `/instructions` or
 * `/result` afterwards) dropped students somewhere they did not expect.
 */
export const AFTER_ASSESSMENT_ROUTE = DASHBOARD_ROUTE

export type StudentRoute = typeof ONBOARDING_ROUTE | typeof DASHBOARD_ROUTE

/** Flags as returned by `POST /api/auth/login`. */
export interface SignInFlags {
  has_assessment?: boolean
  has_onboarding?: boolean
}

/**
 * Where to send someone immediately after they sign in.
 *
 * `has_onboarding` is `isProfileComplete(profile)` on the server, so a signup
 * row that only carries a name and email counts as NOT onboarded — those users
 * go to the onboarding form. Anyone with a result or a completed profile gets
 * the dashboard.
 */
export function afterSignInRoute(flags: SignInFlags = {}): StudentRoute {
  return flags.has_assessment || flags.has_onboarding ? DASHBOARD_ROUTE : ONBOARDING_ROUTE
}

/**
 * Where a signed-in student belongs when they land somewhere generic — the
 * marketing home page (where the confirmation email drops them), `/login` via
 * the back button, or a bookmark. Mirrors `afterSignInRoute` but works off the
 * locally hydrated profile, since no API call has been made.
 */
export function signedInLandingRoute(profile: any): StudentRoute {
  return isProfileComplete(profile) ? DASHBOARD_ROUTE : ONBOARDING_ROUTE
}

/**
 * Which dashboard home a role belongs to. `/dashboard` itself is only a
 * redirector (see app/dashboard/page.tsx); the real pages live under
 * `/dashboard/<role>`. Unknown or missing roles get the student view, so a
 * profile whose `role` was never set can never 404 on `/dashboard`.
 */
export function dashboardRouteForRole(role?: string | null): string {
  switch ((role || '').toLowerCase()) {
    case 'faculty':
      return '/dashboard/faculty'
    case 'institution':
    case 'admin':
      return '/dashboard/institution'
    default:
      return DASHBOARD_ROUTE
  }
}
