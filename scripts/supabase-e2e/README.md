# Supabase end-to-end harness

Runs the app's real server code (route handlers, `lib/persist.ts`, `lib/db.ts`,
`lib/studentAuth.ts`, …) against the repository's own SQL (`supabase/schema.sql`
and every later migration) on a real Postgres engine (PGlite, WebAssembly), behind a
Supabase-compatible HTTP surface:

- `emu.mjs` — PostgREST and GoTrue subset: the role comes from the JWT
  (`anon`, `authenticated`, `service_role`), every request is one transaction, and
  upserts are sent the way PostgREST sends them (`ON CONFLICT … DO UPDATE`), so row
  level security behaves as it does on Supabase.
- `alias-hooks.mjs` — resolves the repo's `@/…` import alias for Node.
- `boot.mjs` — points the app at the emulator and the local JSON store at a scratch
  directory.
- `scenarios.mjs` — the scenarios. Each check states the correct behaviour and reads
  ground truth straight from Postgres.

Run it (from the repository root):

    MODE=service node --no-warnings scripts/supabase-e2e/scenarios.mjs   # service key set
    MODE=anon    node --no-warnings scripts/supabase-e2e/scenarios.mjs   # anon key only

The same runs are part of `npm test` (`lib/__tests__/supabaseE2E.test.ts`). The
report is written to `REPORT=<file>` or to the temp directory.

This is a verification harness, not part of the application. It is not a
replacement for testing against a real Supabase project before a release.
