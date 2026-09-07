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
