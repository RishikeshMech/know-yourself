/**
 * Compile-time stand-in for `@supabase/supabase-js`.
 *
 * `next.config.js` aliases `@supabase/supabase-js` to this file whenever the
 * real package is missing from node_modules (e.g. a stale or partial install
 * after pulling newer code). This keeps the app compilable so it can always
 * run in the documented fully-local demo mode — Supabase is an *optional*
 * backend (see README + `.env.example`), so a missing package must never
 * break the build or the "Start Assessment" flow.
 *
 * The stub is only ever *called* when Supabase env vars are configured but the
 * package is not installed; `lib/supabase.ts` wraps `createClient` in a
 * try/catch, logs a warning, and falls back to local demo mode — exactly as it
 * does for an unreachable backend.
 *
 * When `@supabase/supabase-js` IS installed, next.config.js does not apply the
 * alias and the real package (types included) is used unchanged.
 */
export function createClient(
  _url: string,
  _key: string,
  _options?: Record<string, unknown>,
): never {
  throw new Error(
    '@supabase/supabase-js is not installed. Run "npm install" to enable Supabase persistence; without it the app runs in local demo mode.',
  )
}

export type SupabaseClient = unknown
