# CalibiAI Score, admin console & AI engine

## 1. The CalibiAI Score = the average of every assessment

The student's headline **CalibiAI Score** is the average of *every* assessment
they have completed. Assessments use different scales, so each result is first
normalised to a percentage and the mean is reported on the 1000-point scale:

```
CalibiAI Score = round( mean(percent_i) × 10 )        0 – 1000

  CalibiAI assessment (assessment 1)   total / 1000  → percent = total / 10
  Capgemini 2027 mock (assessment 2)   total / 1000  → percent = total / 10
  each company mock                    score / 100   → percent = score
```

- Every completed assessment counts once (equal weight).
- Only finished, graded attempts count: an in-progress company mock or a
  "taken · result pending" attempt is excluded until it is graded.
- No graded assessment → no CalibiAI Score yet.
- Grade bands match the platform assessments: S ≥ 900 · A ≥ 750 · B ≥ 600 ·
  C ≥ 400 · D.

**Example** — CalibiAI assessment 720, Capgemini mock 640, Amazon 82.5,
TCS 50 (expired), Infosys in progress → (72 + 64 + 82.5 + 50) / 4 = 67.125 →
**671 (B)**, "average of 4 assessments".

One implementation, `lib/calibiScore.ts`, is used by the student dashboard,
the profile page, the admin console and every export. Its SQL mirror (used
only for sorting the admin table and the stat cards) is the view
`student_calibiai_scores` in `supabase/migrations/0010_calibiai_average.sql`;
`lib/__tests__/calibiMigration.test.ts` runs the real migrations on PostgreSQL
(PGlite) and proves the SQL value equals the TypeScript value for 40 random
students.

Where it appears:

| Surface | What is shown |
|---|---|
| Student dashboard | "Your CalibiAI Score" card: score, grade, *average of N assessments*, category averages and a per-assessment breakdown (score, 1000-scale bar, grade/verdict). The CalibiAI assessment keeps its own card with module scores and the PDF report. |
| Profile | Hero shows the CalibiAI Score (average) with the tier; the "Why?" note lists every assessment counted. |
| Admin | "CalibiAI avg" column (sortable), "Tests" count, per-assessment breakdown in the expanded row, "Avg CalibiAI Score" stat card, every export. |

## 2. Admin console (`/admin`)

**Table** — one row per student: identity, PRN, mobile, college, degree,
skills, resume score, **CalibiAI avg** (default sort), **Tests** (completed
assessments; hover lists them; "+N live" = company mocks in progress),
**Assessment 1** score, grade, percentile, feedback, date.

**Expanded row** — personal & college details, CalibiAI assessment modules,
behavioural traits, skills, and **Assessments taken**: every assessment with
its category (Platform assessments / the company's tag), raw score, score on
the 1000 scale, grade or verdict, company round breakdown (with cut-off
misses), Capgemini module scores, integrity (proctoring strikes, camera, auto
submission) and date; category averages; in-progress mocks. Buttons:
**Full record (JSON)** and **Profile + scores (CSV)** for that student.

**Company-wise results** panel — per company: attempts, completed, average,
best, interview-ready count and "ready + almost" rate, filterable by category;
CSV download per company or category.

**AI engine (LLM)** panel — see §3.

### Downloads

| Button / endpoint | Contents |
|---|---|
| **All student profiles (CSV)** — `GET /api/admin/export?kind=students&scope=all` | One row per student, 137 columns: full profile (name, email, PRN, mobile, DOB, gender, degree, college, year, CGPA, skills, LinkedIn/GitHub), resume score, **CalibiAI Score (average)**, grade, number of assessments, **list of assessments taken with their category**, CalibiAI assessment score + all module/trait/detail scores, Capgemini mock score + modules, company-mock count/average/best/results, **category averages** (platform + 6 company tags), feedback, hash, dates, and **one column per company (company-wise scores)**. |
| **Filtered students CSV** — same with `scope=filtered` + the table filters | Same columns, only the students matching college/search/"assessed only". |
| **All assessment attempts (CSV)** — `kind=attempts` | One row per attempt (CalibiAI assessment, Capgemini mock, every company mock): student identity, assessment, type, **category**, status, score, out of, percent, 1000-scale score, grade/verdict, rounds, proctoring strikes, camera, auto-submitted, submit reason, started/submitted, time allowed, the student's CalibiAI Score. |
| **Everything (JSON)** — `kind=json` | Every student row with the per-assessment breakdown and company attempts, plus the company-wise summary. |
| Per student — `GET /api/admin/student?id=…&format=json\|csv` | JSON: the admin row plus the raw stored data from both stores — profile, resume analysis, both platform results (with AI feedback), session metadata, every company attempt with graded items, feedback and proctoring log. CSV: the profile row + that student's attempts. |
| Company results — `GET /api/admin/company-results?tag=&company=&format=json\|csv` | Aggregates per company/category, or the matching attempts as CSV. |

Every admin endpoint requires the admin session cookie (401 otherwise).
Exports are always computed fresh from both stores (Supabase + local JSON).

### Data loading (egress-conscious)

`lib/adminAssessmentData.ts` reads the Capgemini mock results and company
attempts for **the page's student ids only** (chunked `.in()` filters) with
narrow JSON-path projections (e.g. `strikes:proctoring->strikes`,
`rounds:result->rounds`) — never whole JSONB blobs, never a full table on a
page request (exports paginate). Everything degrades to a warning banner:
without migration 0009 company results are simply absent; without 0010 the
CalibiAI sort falls back to the assessment-1 score (with a notice) and the
stat card shows the assessment-1 average.

The loader also repairs rows from databases whose `student_profiles_full`
view predates 0008 (it picked the newest result regardless of assessment
number, so a Capgemini result could appear as the CalibiAI assessment score).

### Migrations to apply (Supabase SQL editor, in order)

1. `0008_assessment_no.sql` — **re-run it**: it previously failed on any
   database with migration 0006 ("cannot drop view student_profiles_full
   because other objects depend on it"). It now drops/recreates `admin_stats`.
2. `0009_company_assessments.sql` — company mock attempts.
3. `0010_calibiai_average.sql` — `student_calibiai_scores`, the superset
   `student_profiles_full` (assessment 1 strictly `assessment_no = 1`,
   assessment 2 columns, `calibi_score`, `assessments_taken`), `admin_stats`
   (+ average CalibiAI, completed company mocks) and `admin_change_probe`
   (+ company counters so the live admin refreshes). Idempotent and
   self-sufficient (adds `assessment_no` itself if 0008 never applied).

`supabase/schema.sql` (fresh installs) contains all of the above.

## 3. AI engine (DeepSeek) — verifying it in production

All AI surfaces use `lib/llm.ts` (DeepSeek, OpenAI-compatible). Configure the
server `.env`:

```
DEEPSEEK_API_KEY=sk-…            # or CALIBIAI_API_KEY
# optional: DEEPSEEK_BASE_URL=https://api.deepseek.com  DEEPSEEK_MODEL=deepseek-chat
```

Restart the app, open **/admin → AI engine (LLM)**:

- **Status** — configured or not, endpoint, model, which variable holds the key
  and its last 4 characters (the key itself is never returned).
- **Test connection** — one tiny JSON-mode completion; shows latency or the
  HTTP status with a fix hint (401 bad key, 402 balance, 429 rate limit,
  timeouts/DNS).
- **Usage since start** — successful model calls vs fallbacks, per surface:
  "✨ Evaluate with AI" grader (writing, speaking, debugging, feature, prompt),
  in-exam assistant, company written-answer grader, resume analysis,
  feedback suggestions.

Without a working key every surface falls back to CalibiAI's rule-based
graders, so assessments never break — answers are then scored heuristically.

**Speaking:** the model grades a transcript. The exam captures one live with
the browser's speech recognition (Chrome/Edge) while recording; the transcript
is sent with "Evaluate with AI". Browsers without speech recognition keep the
recording-evidence grade (shown to the candidate).
