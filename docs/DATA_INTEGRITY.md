# Data integrity, storage and access control

This document describes how a candidate's data reaches Supabase, what guarantees
hold along the way, and what the server must be configured with. It was written
with the fix that made assessment results reliable (migration `0012`) and the
end-to-end suite in `scripts/supabase-e2e/`.

## What was wrong (and is now fixed)

| Symptom | Cause | Fix |
|---|---|---|
| Tests taken, but nothing in Supabase | The server wrote with the **anon key** when `SUPABASE_SERVICE_ROLE_KEY` was not set. Row-level security rejects those writes (no signed-in user), and the route still answered `200`. | Student data is written **as the student** (their own access token). It no longer needs the service key. |
| Submit could leave half the data | The session and its result were two separate writes. | `submit_assessment()` stores the session **and** the result in one transaction. |
| A late autosave reopened a finished test | Autosave upserted whatever status it was sent. | `save_assessment_progress()` never changes a finished attempt, and a finished session is immutable in the database. |
| Results could be read or overwritten by others | API routes trusted `student_id` in the request. The server used the service key, which bypasses row-level security. | Every student route verifies the bearer token and uses the **verified** user id. A mismatched id is refused (403). |
| A student could make themselves staff | Self-update policy allowed changing `role` and `institution_id`. | Trigger `profiles_guard_privileged_columns` blocks it (service role and SQL editor excepted). |
| Feedback / help could be filed under someone else | Insert policies allowed any `student_id`. | Policies and routes accept only the caller's own id (or none). |
| Feedback listing exposed every candidate's feedback | `GET /api/feedback` with no parameters returned the whole local store. | Removed; a candidate sees only their own feedback. |
| Admin could be signed in by anyone | The cookie secret and the password fell back to values in the repository. | Production refuses admin sign-in until `ADMIN_SECRET` and `ADMIN_PASSWORD` are set (see below). |
| Admin showed a partial list as if it were complete | Without the service key the admin read only what RLS allowed, and filled gaps with local demo rows. | Admin data routes answer `503` with the reason until the service key is set. |
| Hard-coded demo login at assessment start | The start page signed in as `demo@calibiai.local` to obtain a student id. | Removed. The start uses the signed-in student. |
| Browser showed success when the save failed | The client ignored response status. | The client stores the final submission on the device, retries, and moves on only after the server confirms (`lib/submissionOutbox.ts`). |

## Who may touch what

| Caller | Identity | Client used | Can read / write |
|---|---|---|---|
| Student (browser) | Supabase access token, sent as `Authorization: Bearer` | `getUserClient(token)` — row-level security applies | Own rows only |
| Anonymous visitor | none | `getServerClient()` (insert-only policies) | Insert feedback / help with no student attached |
| Admin console | HMAC-signed admin cookie | `getServiceClient()` / `getServerClient()` | All student records (needs the service key) |
| Company assessment | Student token, verified by `resolveStudent` | Service key (results are graded server-side and must not be editable by students) | Own attempt; results written by the server |
| Staff (faculty / institution role) | Supabase access token | `getUserClient` | Students of their own institution only (`is_same_institution_staff`) |

Row-level security is the second, database-enforced layer on every query. The
first layer is the identity check in `lib/studentAuth.ts`.

## Assessment data path

1. **Start** — `POST /api/user/session` → `start_assessment_session()`. Closes the
   student's previous open attempt of the *same* assessment and opens the new one,
   in one transaction. Only one open attempt per assessment exists at a time.
2. **Autosave** — `POST /api/user/assessment` → `save_assessment_progress()`. Refuses
   to change a finished attempt (`409` if the status is final).
3. **Submit** — the browser keeps the final submission on the device, then
   `POST /api/user/assessment/submit` → `submit_assessment()`. One transaction stores
   the session as submitted **and** its result. Retrying the same submit returns the
   stored result. A second, different attempt for the same assessment is refused
   (`409`). If the write cannot complete, nothing is marked submitted, the browser
   keeps the submission, retries, and the dashboard resends it on the next visit.

All three functions take a transaction-scoped advisory lock per student and
assessment, so two requests racing for the same attempt cannot both succeed.

Other student data (profile, resume analysis, WhatsApp / LinkedIn steps) is a single
row per write. Each write reports its outcome; a failed write returns `503` and the
candidate is told it did not save. The tracking rows have a deterministic id per
student and action, so repeating a step updates the same row.

## Configuration the server needs

| Variable | Needed for | Required? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Everything that uses Supabase | Yes, when Supabase is used |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin console (reading all students), company assessment results, queue flush | Yes for the admin console and company assessments |
| `ADMIN_SECRET` | Signs the admin session cookie | **Yes in production** (admin sign-in is refused without it) |
| `ADMIN_PASSWORD` | The admin password | **Yes in production** (admin sign-in is refused without it). Outside production the development value is used. |

Student data does **not** need the service key. Without it, student writes still
reach Supabase, but the admin console and company results do.

**Action for an existing deployment:** set `ADMIN_SECRET` and `ADMIN_PASSWORD` on the
server, then choose a new password. The previous password was in the repository and
should be treated as public. Apply `supabase/migrations/0012_atomic_writes_and_row_security.sql`
(or run the consolidated `supabase/schema.sql` on a fresh project).

## Verifying it

- `npm test` runs the end-to-end suite (`lib/__tests__/supabaseE2E.test.ts`). It starts
  the real route handlers against the repository's SQL on a real Postgres engine
  (PGlite), behind a Supabase-compatible HTTP surface (`scripts/supabase-e2e/`), and
  checks in two configurations (service key present, and anon key only) that every
  student data path is stored, read back after a restart, and not visible to other
  students, and that the admin sees the end-to-end record.
- `lib/__tests__/migration0012.test.ts` checks the database rules directly: atomic
  commit and rollback, ownership, immutability, privilege guard and policies.

## Known limitations (follow-ups)

- **Scores are computed in the browser** (`computeScores`) and stored as submitted.
  The database checks their range and grade, but it cannot check that the score
  matches the answers. Server-side scoring needs the AI-graded parts stored server-side
  as well; this is a larger change.
- **Abandoned attempts** closed by a new start are marked `expired`, and the admin
  view counts `expired` as "attempted". Reporting should distinguish timed-out
  attempts from abandoned ones.
- The local JSON store is still the demo-mode store. When Supabase is configured it is
  no longer written by the student routes.
