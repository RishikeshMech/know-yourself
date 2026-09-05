# CALIBIAI SCORE — UI Screen Breakdown

> React / Next.js (self-hosted, edge-cached). Flow strictly: Login -> Profile -> Resume -> Resume Analysis -> WhatsApp -> LinkedIn -> Confirmation -> Instructions -> Assessment (120min) -> Submit -> Evaluation -> Score -> PDF -> Dashboards.

---

## 0. Design System

- **Typography:** Inter / JetBrains Mono for code.
- **Palette:** Deep navy #0B1220, Calibi teal #0EA5E9, accent violet #8B5CF6, success #10B981, warning #F59E0B. Dark/light.
- **Components:** Glass cards, progress stepper, tamper-proof timer (red when <10min), audio waveform, code editor (Monaco self-hosted).
- **Responsiveness:** Desktop-first for assessment (proctored), mobile for onboarding.

---

## 1. LOGIN (`/login`)

- Email + password, role tabs (Student / Faculty / Institution)
- "New user? Register" -> modal with institution selector
- JWT stored httpOnly+secure (implemented as localStorage for demo, httpOnly in prod)
- SSO button (institution SSO federation) — mocked, routes to same flow
- Error: invalid credentials, institution inactive

---

## 2. STUDENT PROFILE (`/profile`)

Fields: full name, phone, DOB, gender, degree, college, graduation year, CGPA, skills (chips), LinkedIn, GitHub, avatar upload
- Validation: CGPA 0-10, phone E.164, graduation year 2020-2030
- CTA: Save & Continue
- Progress stepper shows 60% complete

---

## 3. RESUME UPLOAD (`/resume`)

- Drag & drop + browse (PDF/DOCX, <5MB)
- MinIO presigned upload indicator
- On upload: shows file name, size, "Analyzing..." spinner
- **Resume Analysis (AI)** — radial score /100, strengths (green chips), gaps (amber), suggestions list
- CTA: Continue (disabled until analysis done)
- Edge: retry, re-upload

---

## 4. JOIN WHATSAPP (`/tracking/whatsapp`)

- Big WhatsApp card, QR placeholder, "Join Community" button (external link mocked)
- Checkbox: "I have joined"
- On click: POST /tracking/complete {join_whatsapp}
- Tracking: internally logged, audit event
- CTA: Continue -> auto-marks completed, or skip disabled (must complete)

---

## 5. FOLLOW LINKEDIN (`/tracking/linkedin`)

- LinkedIn card, Calibiai LinkedIn page preview
- "Follow" button -> opens linkedin.com/company/calibiai (mock)
- Same tracking pattern: POST /tracking/complete {follow_linkedin}
- CTA: Continue

---

## 6. CONFIRMATION (`/confirmation`)

- Summary: Profile ✓, Resume 78/100 ✓, WhatsApp ✓, LinkedIn ✓
- Consent checkbox: "I confirm details are accurate, agree to 120-min assessment terms"
- CTA: Proceed to Assessment Instructions

---

## 7. ASSESSMENT INSTRUCTIONS (`/instructions`)

- Duration: 120 minutes (7200s) — server-controlled notice
- 6 modules grid with time hints, marks per module
- Rules: no tab switch (>3 => flag), camera optional, timer cannot be paused, submit auto at expiry
- Checkbox: "I have read instructions"
- CTA: **Start Assessment** -> POST /assessment/start -> redirect to `/assessment` with timer

---

## 8. ASSESSMENT (`/assessment`) — Core

**Layout:**
- Top: sticky header — Calibiai logo, **tamper-proof timer** (MM:SS, server-synced, red <10m, pulse), module stepper, Submit button (confirm modal)
- Left: module nav (collapsible), question palette (1..N, color: answered/skipped/flagged)
- Center: question area
- Right: (desktop) code editor / audio player as needed
- Bottom: Prev / Next / Mark for Review / Clear

**Timer behavior:** polls `/assessment/timer` every 5s; if `remaining_sec <=0` auto-submit. Client drift corrected.

**Modules:**

### 8.1 English — Listening (5 MCQs)
- Player: audio stored on MinIO/CDN (self-hosted). Play count limited 2x. Transcript hidden.
- Each: audio clip (30-60s) + question + 4 options
- Example: "What is speaker's main concern?" -> MCQ

### 8.2 English — Speaking (2 prompts)
- Prompt card: "Describe a challenge you overcame..."
- Record button -> MediaRecorder (webm), waveform viz, max 90s, playback, re-record
- On save: uploads to MinIO, shows "Transcribing..." then mock transcript + WPM

### 8.3 English — Reading (passage + 5 MCQs)
- Passage pane (scroll) + questions beside

### 8.4 English — Writing (1 scenario)
- Scenario: "Write an email to client explaining delay..." Textarea 150-300 words, live word count, AI will evaluate clarity/grammar/structure/tone

### 8.5 Problem Solving (10 Qs)
- MCQ + pseudocode: "What does this pseudocode output?" + data interpretation chart
- Example: sequence, syllogism, pseudocode with loops

### 8.6 AI-Assisted Debugging (2 tasks)
- Buggy code pane (Python/JS) + description + hidden tests indicator
- Editor (Monaco) for fix + Run (mock tests) + Submit fix

### 8.7 AI-Assisted Feature Development (1 task)
- Spec: "Build a function to ... + requirements + sample I/O"
- Editor + Run tests

### 8.8 Prompt Engineering (3 tasks)
- Task card + textarea for prompt
- Eg: "Create a prompt to summarize research paper for CEO in 3 bullets"
- Hint: rubric specificity/context/constraints

### 8.9 Cognitive — Motion & Grid (~8 min)
- Interactive 4x4 grid challenge: memorize pattern 3s, reproduce, speed+accuracy tracked
- 5 rounds, each timed

### 8.10 Cognitive — Logical Reasoning (~10 min)
- 6 Qs: sequences, puzzles, pseudocode

### 8.11 Cognitive — Behavioral (~7 min)
- 6 workplace scenarios: "Your teammate missed deadline, you..." Likert + MCQ
- No correct answer; maps to adaptability etc.

**Navigation:** Linear but allow jumping; answered state persisted via `POST /answer` on each change (optimistic + retry queue).

**Submit:** Confirm modal "Are you sure? You have X unanswered." -> POST /submit -> loading "Evaluating... (queue)"

---

## 9. RESULT (`/result/:session_id`)

- Hero: **CALIBIAI SCORE 842 / 1000** large gradient number, Grade A, percentile 92.4
- Breakdown bars: English 172/200, PS 168/200, etc. (animated)
- Cognitive profile radar chart (Logical 85, etc.)
- Behavioral chips
- Strengths & Weaknesses lists
- Hiring recommendation: "Interview-ready — recommended for..."
- CTAs: Download PDF Report, View Dashboard, Share (copy verifiable link)

---

## 10. PDF REPORT (Generated)

One-page + detail:
- Header: Calibiai logo, student name, ID, date, verifiable hash QR
- Section scores table + bars
- Cognitive radar (image)
- Behavioral insights paragraph (LLM-generated)
- Recommendations + Next steps
- Footer: "Verified via api.calibiai.global/verify"

Rendered async via Puppeteer self-hosted (or jsPDF client fallback for demo).

---

## 11. STUDENT DASHBOARD (`/dashboard/student`)

- Top: latest score card + trend sparkline + attempts history
- Tabs: Overview | Scores | Resume | Reports | Improvement Plan
- Scores tab: module-wise line chart across attempts
- Resume: current resume score + re-upload
- Improvement: AI suggestions per weak area with practice links
- Reports: list of PDFs

---

## 12. FACULTY DASHBOARD (`/dashboard/faculty`)

- Filters: cohort, year, module
- KPIs: avg score 712, median, top performer spotlight, grade distribution donut
- Table: students sortable by score, resume, status (search + pagination)
- Row action: view detail, download report
- Analytics: cohort comparison bars, module avg heatmap
- Bulk: export CSV, download all PDFs (zip streaming from MinIO)

---

## 13. INSTITUTION / ENTERPRISE DASHBOARD (`/dashboard/institution` | `/dashboard/enterprise`)

- Global KPIs: total students, avg 720, placement-ready %, institution ranking
- Cross-institution benchmarking: bar chart (your inst vs national avg per module)
- Cohort analytics: time-series, dropout funnel
- Bulk hiring pipeline:
  - Filters: min_score 750, skills Python, institution tier
  - Candidate cards with verifiable hash, quick verify button, "Add to pipeline" -> webhook to ATS
- API access panel: API key, docs link, usage graph, verify endpoint tester
- Audit: recent verifications

---

## 14. Shared Components

- **Stepper:** 8 steps, current highlighted
- **Timer:** server-synced, accessible, announced via aria-live
- **Code Editor:** Monaco, self-hosted, no CDN
- **Audio Player:** custom, no external dependency, stored on MinIO
- **Radar Chart:** SVG custom (no Chart.js CDN? we self-host via npm)
- **PDF Viewer:** embed
- **Proctoring Banner:** "Tab switches: 1/3" warning
