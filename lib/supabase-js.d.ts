/**
 * Ambient fallback types for `@supabase/supabase-js`.
 *
 * TypeScript only consults this declaration when the real package cannot be
 * resolved from node_modules (next.config.js then aliases the runtime import
 * to `lib/supabase-js.stub.ts`, and lib/supabase.ts degrades to demo mode).
 *
 * When `@supabase/supabase-js` IS installed, module resolution finds the real
 * package types and this fallback is ignored, so the typed Supabase client
 * API is preserved exactly as before.
 */
declare module '@supabase/supabase-js' {
  export function createClient(
    supabaseUrl: string,
    supabaseKey: string,
    options?: Record<string, unknown>,
  ): any

  export type SupabaseClient = any
}
