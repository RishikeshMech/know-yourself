// Shared community links — single source of truth so the invite URL
// never drifts between pages.
export const WHATSAPP_COMMUNITY_URL =
  'https://chat.whatsapp.com/KRTSYXgZ1ZRJa9kLbhflK7'

export const LINKEDIN_URL =
  'https://www.linkedin.com/company/calibiai-academy'

/** The CalibiAI Community app, surfaced in the navbar on the allowed pages. */
export const COMMUNITY_APP_URL = 'https://app.calibiai.com'

/**
 * Routes where the navbar shows the "CalibiAI Community" link. Deliberately a
 * strict allow-list: the link must stay out of the assessment (/assessment) and
 * every other flow, so we name exactly the pages that are allowed rather than
 * trying to exclude the ones that are not.
 */
export const COMMUNITY_NAV_ROUTES = ['/', '/dashboard/student', '/profile']
