# AI Mock Interview — Production Implementation

> Implements `AI_Mock_Interview_Feature_Requirements.docx` v0.1

## Overview

Real-time AI mock interview with **Sam**, a friendly but professional interviewer powered by **DeepSeek API** (`deepseek-chat` / `deepseek-v4-flash` via OpenAI-compatible gateway). The feature is embedded in the student dashboard as a tab **“AI Mock Interview — Schedule & Attempts”** with a strict **3-attempt limit** per student (server-enforced).

End-to-end simulation: 15 min (Quick), 35 min (Standard, default), 45 min (Full). Includes:
- Camera preview (getUserMedia, preview only — not stored per G9)
- Mic + real voice STT (Web Speech API, `en-IN`) + TTS (speechSynthesis) — separate services because DeepSeek is text-only (Section 10.1 constraint)
- Live coding editor (Python/JS/Java/C++ via existing `company/codeRunner` sandbox)
- Explainable, rubric-anchored scoring (server-side weighted sum, never trusted from LLM)
- Evidence-backed report with strengths/gaps citing transcript quotes, code review, integrity signals, 2-week learning plan, trend

## Tracks & Blueprint (Section 7)

- **SWE**: OOP, arrays/strings, recursion, stack/queue, trees, graphs, DP, DBMS/SQL, OS (process/thread, deadlock), CN (DNS/TCP/TLS/HTTP), design-lite (URL shortener), project deep-dive, behavioural (STAR)
- **AI/ML**: Python/NumPy, gradient descent, overfitting/underfitting, precision/recall/F1, data preprocessing & leakage, random forest, backprop & activations, transformers & attention, RAG vs fine-tuning, embeddings & ANN, pandas DAU/retention, k-NN from scratch, metrics implementation, case study (student dropout), responsible AI

Sections: `warmup` (1 Q), `fundamentals` (2-4 Q), `problem_solving` (1-2 Q, coding), `project_or_design` (0-1 Q), `behavioural` (1-2 Q), `wrap_up` (1 Q). Time budgets per mode from Section 6.1.

Blueprint builder: `lib/interview/blueprint.ts`
- `buildBlueprint({track,year,mode,excludeQuestionIds})` selects from `QUESTION_BANK`, shuffles, sorts by difficulty proximity, avoids repetition within last 3 sessions (FR-18)
- `advanceBlueprint`, `adaptDifficulty` (FR-13: step up after strong answer, down after weak)

Question bank: `lib/interview/questionBank.ts` — ~40 grounded questions v1 (expandable to 150 per track). Each entry follows Appendix A: `prompt`, `reference_answer`, `key_points`, `common_mistakes`, `follow_ups`, `hint_ladder` (3 levels), `time_limit_min`, optional `coding_spec` with `fn_name`, `starter_code`, `tests`, `sample_input_output`, `target_complexity`.

## State Machine (Section 11.2)

```
SCHEDULED -> CREATED -> CONSENTED -> SETUP_CHECK -> WARMUP -> FUNDAMENTALS
  -> PROBLEM_SOLVING -> PROJECT_OR_DESIGN -> BEHAVIOURAL -> WRAP_UP
  -> EVALUATING -> REPORT_READY
  Any active state may go to:
    PAUSED (max 1, 5 min) -> resume same state
    DISCONNECTED (auto-resume within 30 min)
    ABANDONED (timeout) / TERMINATED (policy breach)
```

Implemented in `lib/interview/types.ts` and enforced in API routes.

## Core Data Model (Section 11.3)

Extended `lib/db.ts` with concurrency-safe collections:
- `interview_sessions`: full `InterviewSession` (blueprint, turns, evaluations, code submissions, integrity events, token usage, consent, device check)
- `interview_reports`: `InterviewReport`
- `interview_feedback_flags`: unfair score flags (FR-46) for golden set

`InterviewSession` fields:
- `attempt_number` 1..3, `track`, `year`, `mode`, `language_style` (`en` / `hinglish`)
- `blueprint`: sections, active indices, current question, follow-ups, running difficulty
- `consent`, `device_check`, `turns` (interviewer/student with hint_level, input_mode, code_snapshot, latency_ms)
- `hints_by_question`, `skipped_questions`, `code_submissions`, `evaluations`, `integrity_events`, `abuse_strikes`, `pause_count`, `total_paused_sec`, `token_usage`, `model_versions`

## AI Design with DeepSeek (Section 10)

### Logical Agents (10.2)

| Agent | Job | Model (recommended) | Notes |
|-------|-----|---------------------|-------|
| Interviewer | Asks question, follow-ups, hints, transitions | `deepseek-v4-flash` / `deepseek-chat`, streaming, temp 0.5-0.7 | Low latency, sees current Q, reference, rubric, transcript summary |
| Evaluator | Scores each answer against rubric, JSON with evidence | `deepseek-v4-flash` per-answer, `deepseek-v4-pro` thinking for final report | Async, temp 0-0.2, strict JSON schema |
| Planner / variant generator | Chooses Qs, generates variants, project Qs from resume | `deepseek-v4-flash` | Validated against schema, cached per template |
| Report writer | Turns scores + evidence into student-friendly feedback + learning plan | `deepseek-v4-pro` thinking | Once per session at end |

### Grounding (10.3)

- Each bank Q stores reference answer, key points checklist, common mistakes, follow-ups, tests
- Evaluator marks each key point as `covered|partially|missing` with quote evidence
- Code correctness from test results, not LLM opinion
- Variant Qs checked against template reference solution

### Cost Control (10.4)

- Static prefix identical across turns for prefix caching
- Current Q block + last N turns full, older summarized
- Max output tokens per turn (250 interviewer, 900 evaluator), per-session token budget
- Cost estimation: `lib/interview/llmGateway.ts` `estimateCostInr`

### Prompt-Injection Defences (10.5)

- `lib/interview/redaction.ts`: `wrapStudentAnswerDelimiter` wraps in `<student_answer>` tags, neutralizes breakout tags, scans for injection patterns (`ignore instructions`, `give me 5/5`, `reveal reference answer`, `you are now in developer mode`)
- Separate evaluator call, schema validation, server-side scoring, hidden key points
- PII redaction: email, phone, PRN, Aadhaar, PAN, social URLs before LLM

### Prompts (10.6, 10.7)

`lib/interview/prompts.ts` versioned `v1.0.0-2026-09-29`:
- Interviewer system prompt: Sam, one Q at a time, <80 words, hidden KEY_POINTS, hint ladder, time cues, adaptive difficulty, language tolerance
- Evaluator system prompt: strict JSON schema with `competency_scores` 1-5, `key_points` with evidence, `strengths`, `gaps`, `student_quote`, `confidence`, `code_review`
- Report writer prompt: JSON with `ai_summary` + `learning_plan` (4-6 items)

## LLM Gateway (11.1)

`lib/interview/llmGateway.ts` — provider-agnostic wrapper:
- Resolves config via `lib/llm.ts` `resolveLlmConfig` (CALIBIAI_* wins over DEEPSEEK_*)
- `gatewayCallLlm` with retries (2), timeouts (15s), cost tracking
- `gatewayCallLlmJson` with `parseJsonLoose` (fenced JSON extraction)
- `gatewayStreamLlm` async generator for SSE streaming (OpenAI-compatible `stream:true`)
- `collectStream` collects while invoking `onChunk` for real-time UI
- Fallback to heuristic when no key or failure — interview never breaks

## Scoring Model (Section 9)

`lib/interview/scoring.ts`:

- Competencies: Technical 30%/40%, Problem Solving 25%/30%, Communication 20%, Code Quality 15%/0%, Behavioural 10%
- Anchored 1-5 scale descriptors
- Hint penalty: L1 -0.25, L2 -0.5, L3 -1.0 (min 1) — Section 9.4
- Skipped scores 1 flagged separately
- Overall = weighted sum of competency averages scaled 0-100, computed server-side only
- Bands: <40 Getting started, 40-59 Developing, 60-79 Interview-ready, 80+ Strong
- Evidence extraction: every strength/gap must include quoted snippet (G5)
- Low-confidence flag when evaluator confidence <0.6, excluded from cohort analytics

Evaluator: `lib/interview/evaluator.ts`
- `evaluateAnswer(question, studentAnswer, hintsUsed, {codeSubmission, testResults})`
- Tries DeepSeek JSON first, validates & clamps 1-5, applies hint penalty server-side
- Heuristic fallback: keyword coverage of key points, length, structure, common mistakes detection, code test ratio for code_quality

Report: `lib/interview/reportGenerator.ts`
- `generateInterviewReport({session, previousReports})` computes breakdown, overall, band, strengths/improvements with quotes, trend, cohort percentile
- Tries AI report writer for summary & learning plan, falls back to heuristic templates per competency

## API Sketch (Section 11.4)

| Endpoint | Purpose |
|----------|---------|
| POST /v1/interviews (our `/api/interviews`) | Create session from launch token/options, returns session id + plan summary, enforces 3-attempt quota |
| GET /api/interviews?student_id | List sessions |
| GET /api/interviews/quota?student_id | Quota + reports + trend |
| GET /api/interviews/{id} | Session + safe current question (prompt only) |
| POST /api/interviews/{id}/consent | Record consent + device check, moves to WARMUP |
| POST /api/interviews/{id}/turns | Submit answer, streams interviewer reply, evaluates, advances blueprint |
| POST /api/interviews/{id}/hint | Next hint level, penalty disclosed |
| POST /api/interviews/{id}/code/run | Run code against hidden tests, returns results |
| POST /api/interviews/{id}/pause and /resume | Pause once 5m, resume, disconnect 30m window |
| POST /api/interviews/{id}/end | End session, trigger evaluation -> REPORT_READY |
| GET /api/interviews/{id}/report | Final report (poll) |
| POST /api/interviews/{id}/feedback | Flag unfair score (golden set) or star rating |

All routes: `runtime=nodejs`, `dynamic=force-dynamic`, no-store cache, concurrency-safe via `lib/db.ts` atomic writes + lockfile.

## UI Components

- `components/interview/ScheduleInterviewTab.tsx`: Student dashboard tab — shows quota (used/remaining/max), trend, past sessions table, schedule form (track, year, mode, language style, optional project context with PII redaction note), enforces 3 attempts client + server
- `components/interview/ConsentAndDeviceCheck.tsx`: Transparency notice (G3), consent checkboxes (AI notice, record, share with faculty, camera/mic), device checks (network, camera via `CameraPreview`, mic/speaker via getUserMedia), voice mode toggle
- `components/interview/CameraPreview.tsx`: getUserMedia video preview, status, “preview only (not stored)”
- `components/interview/VoiceControls.tsx`: STT via `webkitSpeechRecognition` (`en-IN`, continuous, interim), TTS via `speechSynthesis` for Sam’s replies, push-to-talk + hands-free, live captions, transcript edit before submit
- `components/interview/CodeEditorPanel.tsx`: Language switch (Python/JS/Java/C++), textarea (dark theme), Run tests -> calls `/code/run`, shows passed/total + per-test ms
- `components/interview/LiveInterview.tsx`: Main interview screen — Sam avatar, timer (elapsed / total), pause/end, transcript (interviewer/student bubbles), current question card, voice controls, code editor when coding Q, session progress (sections with time budgets), integrity signals, token cost
- `components/interview/ReportView.tsx`: Appendix B layout — header (score/band/mode/date/duration), competencies bars, top 3 strengths/improvements with quotes, question-by-question review (scores, key points covered/missing with evidence, model answer, code review, flag as unfair), learning plan (day ranges, actions, platform links), trend bar chart, integrity events neutral, star rating

Pages:
- `/interviews` — list all attempts, quota, reports table
- `/interviews/schedule` — schedule form (also embedded in student dashboard)
- `/interviews/[id]` — consent + device check -> live interview
- `/interviews/[id]/report` — report view

Integration in `app/dashboard/student/page.tsx`: new section `id="ai-mock-interview"` before company assessments, with `ScheduleInterviewTab`.

## Non-Functional Requirements (Section 12)

- Latency: first token under 2s typical, p95 under 4s (text), streaming via SSE, evaluation never blocks conversation (async)
- Scale: stateless API, queue-based evaluation, horizontally scalable, target 500 concurrent (to be confirmed)
- Availability: retries, fallback model, autosave every turn, resume after disconnect 30m
- Low bandwidth: text mode <100 kbps, resumable
- Security: TLS, PII redaction before LLM, per-tenant isolation, sandbox hardening for code execution (reuse `company/codeRunner` with `runStdin` timeout, marked JSON)
- Privacy: consent logs, 12m retention default, delete on request, no training on student data without opt-in
- Accessibility: keyboard nav, captions, adjustable pace (voice rate 0.95)
- Observability: token usage + cost tracking per session, latency_ms per turn, evaluation confidence distribution
- Model governance: versioned prompts (`PROMPT_VERSION`), question bank versioning, canary rollouts via feature flags

## Voice & Camera (FR-30..33)

- Text chat baseline fully functional
- Voice mode: STT + TTS with Indian English (`en-IN`), live captions, push-to-talk + hands-free, edit transcript before submit (FR-32)
- Camera preview for comfort only, no video analyzed/stored unless proctoring enabled later (FR-33, G2)
- Falls back to text automatically when device checks fail (FR-03)

## Integrity & Safety (FR-60..63, G7, G10)

- Integrity signals: tab switches, large pastes, fast answers, repeated answers, prompt injection, camera off, off-topic — logged, shown neutrally in report, never auto-fail (G7)
- Prompt injection detection: patterns for `ignore instructions`, `give me 5/5`, `reveal reference answer`, delimiter breakout, DAN jailbreak — flagged, sanitized, logged
- Content safety: abusive language filter, session termination after 3 strikes (policy breach -> TERMINATED)
- Rate limiting: per user via existing `rateLimit.ts` pattern (to be added per institution)

## Cost

Per Standard interview (35 min, 20-25 turns):
- Flash model for live turns (fast, cheap), Pro for final report
- Roughly Rs 3-6 LLM cost before caching at V4-Pro list prices, target under Rs 10 (Section 2.3 metric)
- Tracked via `token_usage.estimated_cost_inr` in session

## Testing

- `lib/__tests__/interview.test.ts`: 17 tests covering bank grounded fields, blueprint building per mode, anti-repetition, difficulty adaptation, scoring bands & hint penalties, PII redaction, injection detection, safety, heuristic evaluator
- Existing 393 tests still pass
- Manual E2E via curl verified: quota enforcement (3 max), blueprint generation, consent, turns with evaluation, report generation with server-side scoring

## Environment

Reuse existing `.env.example`:
```
DEEPSEEK_API_KEY=sk-... (or CALIBIAI_API_KEY)
DEEPSEEK_BASE_URL=https://api.deepseek.com (optional)
DEEPSEEK_MODEL=deepseek-chat (or deepseek-v4-flash)
```

When no key: heuristic fallback — interview still works end-to-end, scores via grounded keyword coverage + test results.

## Future Phases (Section 14)

- Phase 2: AI/ML track expansion, Quick/Full modes already implemented, resume-based project Qs (partially done via redacted project context), trend charts, PDF export, faculty dashboard
- Phase 3: STT/TTS service hardening (choose provider with good Indian-English, e.g. Deepgram, Sarvam), accent testing, voice-specific UX
- Phase 4: Integrity signals dashboard, optional proctored assessment mode, LTI, multilingual UI (Hindi/Marathi), cost optimization (prefix caching)

## Files Added

- `lib/interview/types.ts`, `redaction.ts`, `questionBank.ts`, `scoring.ts`, `blueprint.ts`, `prompts.ts`, `llmGateway.ts`, `evaluator.ts`, `reportGenerator.ts`, `store.ts`
- `app/api/interviews/*` (10 routes)
- `components/interview/*` (6 components)
- `app/interviews/*` (3 pages)
- `docs/AI_MOCK_INTERVIEW.md`
- Extended `lib/db.ts` with `interview_sessions`, `interview_reports`, `interview_feedback_flags`
- Integrated into `app/dashboard/student/page.tsx` + `components/admin/AdminPanels.tsx`

## How to Use

1. Student logs in → Dashboard → AI Mock Interview tab
2. Choose track (SWE/AI/ML), year (2/3), mode (Quick/Standard/Full), language style, optional project context
3. Schedule — server checks quota (3 max), builds blueprint avoiding last 3 sessions’ questions
4. Consent & device check — camera/mic/speaker/network, voice mode toggle
5. Live interview with Sam — real voice Q&A, camera on, timer, hints (penalty disclosed), code editor with hidden tests, pause once 5m, auto-save every turn, resume within 30m
6. End → report generated server-side with overall 0-100, band, competency breakdown, evidence quotes, code review, integrity info, 2-week learning plan, trend
7. View report at `/interviews/{id}/report`, rate usefulness, flag unfair scores for human review & golden set
