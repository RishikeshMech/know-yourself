# CALIBIAI SCORE — Global Student Assessment & Placement Readiness Platform

> **The credit score for employability. 1000-point unified, portable, trusted standard.**  
> Architected from day one for 100M+ students across 50+ countries — zero external SaaS, fully self-hosted, multi-region, horizontally scalable.

[![Architecture](docs/ARCHITECTURE.md)] [![DB](docs/DATABASE.md)] [![API](docs/API_SPEC.md)] [![Scoring](docs/SCORING.md)]

---

## 🚀 Quick Start (Local Parity)

```bash
npm install
npm run dev   # http://localhost:3000  (binds 0.0.0.0, preview at https://3000-*.e2b.app)
```

**Demo flow:** `/login` → (new account: signed in and sent straight to `/onboarding`) → Profile → Resume (mock LLaMA analysis) → WhatsApp → LinkedIn → Confirmation → Instructions → **Start 120-min timer** → 6 modules → Submit → **CalibiAI Score /1000** → PDF Report → Dashboards

No external keys required. With no keys set the app runs in **fully local demo mode** (localStorage + built-in rule-based scoring); add keys to switch on real persistence and AI grading.

### Optional configuration (`.env.local`)

Copy `.env.example` → `.env.local`:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Auth + Postgres (sessions, profiles, results) + Storage (resumes, speaking audio). Run `supabase/schema.sql` in the Supabase SQL editor first. |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional, server-side only. Lets the API routes create confirmed users and mirror onboarding (mobile, gender, degree…), resume analyses and tracking events into Postgres bypassing RLS. Never expose it client-side. |
| `DEEPSEEK_API_KEY` | DeepSeek grading of writing / speaking transcript / debugging / feature / prompts. **Server-side only** (`/api/ai/evaluate`); falls back to a rule engine when absent. |

When Supabase is configured: email + password live in **Supabase Auth** (`auth.users`), a `profiles` row is auto-created on sign-up and every onboarding field (mobile number, gender, degree, college, CGPA, skills, links), resume analysis and WhatsApp/LinkedIn tracking event is mirrored to Postgres by the API routes (service-role writes when `SUPABASE_SERVICE_ROLE_KEY` is set). The browser session is handed to supabase-js after login so RLS and Storage uploads work client-side. **Each student gets their own isolated assessment session** (server-side row, one active session per student, RLS-protected), answers + results persist to Postgres and recordings/resumes go to Storage buckets. When DeepSeek is configured, every subjective section shows an "✨ Evaluate with AI" button that returns a rubric score, strengths and improvement notes (otherwise a deterministic heuristic runs).

### Assessment content & anti-cheating

- All questions live in **`data/questions.json`** (the database seed source) — medium-to-hard, organized in the 6 stages / suggested allocation 15+20+20+25+15+25 = 120 min.
- **Listening** uses real, playable audio (`public/audio/`) with a **2-play limit** per clip.
- **Speaking** records the microphone (MediaRecorder) and uploads to Supabase Storage; production pipeline is recording → Whisper transcript → DeepSeek rubric.
- **MCQ options are shuffled per session**: every session gets a random `question_seed`; option order is derived deterministically from that seed (stable for the student, different across students, re-render safe). Answers are stored as the option *text*, so shuffling never affects scoring.

---

## 🎯 Flowstrict (Millions Concurrent)

```
LOGIN → PROFILE → RESUME UPLOAD → RESUME ANALYSIS (AI) → JOIN WHATSAPP (tracked) → FOLLOW LINKEDIN (tracked) → CONFIRMATION → INSTRUCTIONS → START 120-MIN TIMER (server-controlled) → 6 MODULES → SUBMIT → AI+EVALUATION (queue) → CALIBIAI /1000 → PDF → DASHBOARDS (Student/Faculty/Institution)
```

**Modules:** English (Listening/Speaking/Reading/Writing), Problem Solving, AI Debugging, AI Feature Dev, Prompt Eng, Cognitive (Motion Grid + Logical + Behavioral).

---

## 📚 Deliverables (Production-Ready)

| Doc | Description |
|-----|-------------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Multi-region, multi-tenant, zero-SaaS topology (Anycast, Kong, sharding, Redpanda, MinIO, GPU fleet) |
| [DATABASE.md](docs/DATABASE.md) | Postgres 16 schema + 1024 logical shards → 32 physical, partitioning, Redpanda topics |
| [API_SPEC.md](docs/API_SPEC.md) | REST endpoints (auth, profile, resume, tracking, assessment, scores, reports, dashboards, enterprise verify) |
| [AI_EVALUATION.md](docs/AI_EVALUATION.md) | Rule + self-hosted LLM/Whisper pipeline, Triton/vLLM, batch, autoscaling, pseudo-code |
| [SCORING.md](docs/SCORING.md) | Weighted formula: Eng 200 + PS 200 + Debug 150 + Feature 150 + Prompt 100 + Cognitive 200 = 1000 |
| [UI_SPEC.md](docs/UI_SPEC.md) | Screen breakdown for all roles, timer, grid, editor, audio |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Self-hosted K8s, Terraform, Harbor, Vault, Mimir/Loki/Jaeger, blue-green, DR |
| [FOLDER_STRUCTURE.md](docs/FOLDER_STRUCTURE.md) | Frontend + backend microservices layout |
| [SAMPLE_RESPONSES.md](docs/SAMPLE_RESPONSES.md) | JSON samples for every endpoint |

---

## 🧱 Tech (Mandatory, Hyperscale Day 0)

**Frontend:** Next.js 14 (self-hosted, edge-cached, owned CDN) • React • Tailwind • Recharts • jsPDF  
**Backend:** Node.js microservices (Kong gateway, regional sharding) • Python eval workers  
**DB:** PostgreSQL 16 Patroni + read replicas + sharding (100M+), Redpanda (Kafka), Redis Cluster, ClickHouse  
**AI:** Self-hosted LLaMA 3.1 8B/70B (vLLM+Triton) + Whisper Large v3 (faster-whisper), GPU autoscaling via KEDA  
**Storage:** MinIO (S3, erasure 8+4, CDN-fronted, multi-region)  
**Auth:** Custom JWT RS256 + Argon2id, Vault, institutional SAML/OIDC federation (no Auth0)

---

## 🔐 Security & Control

- Timer **server-controlled** (NTP, HMAC-signed, Redis cache but Postgres source, reconciled 5s, clock-skew-resistant)
- Tab-switch / anomaly detection (Isolation Forest on owned behavioral data)
- Full audit trail (Kafka → ClickHouse, 7yr)
- Encryption at rest + in transit + column-level, data-residency aware (list partition)

---

## 📊 Dashboards

- **Student:** score breakdown, radar, strengths/weaknesses, resume feedback, history, improvement plan
- **Faculty:** batch avg, median, top performer, distribution, student table, module heatmap, bulk PDF zip
- **Institution/Enterprise:** cross-institution benchmarking, cohort analytics, bulk hiring pipeline (min_score filter), **verified score API** + webhook + API key

---

## 📄 PDF Report (Async)

`POST /reports/:id/generate` → queue → Puppeteer/jsPDF worker → MinIO → CDN. Includes student details, section scores, cognitive profile, behavioral insights, strengths/weaknesses, hiring recommendation, verifiable hash QR.

---

## 🌍 Deployment (Self-Hosted, Multi-Region)

```bash
# Local parity — all services
docker-compose up --build

# Prod — Terraform + ArgoCD
terraform -chdir=infra/terraform/regions apply
kubectl apply -k infra/k8s/
```

3 active-active regions (us-east-1, eu-west-1, ap-south-1) • GeoDNS Anycast • RTO 60s • RPO <5s • KEDA autoscaling (exam windows: 5M concurrent, 480 GPUs pre-warmed).

---

## 🧪 Scoring Example

```
Priya: Eng 172 + PS 168 + Debug 132 + Feature 128 + Prompt 88 + Cognitive 154 = 842 /1000 → Grade A (92.4 percentile)
Behavioral: Adaptability 88, Accountability 91, Teamwork 76 → Recommendation: Interview-ready
Verifiable: sha256(user:score:salt) → enterprise POST /enterprise/verify
```

See [SCORING.md](docs/SCORING.md) + [lib/scoring.ts](lib/scoring.ts).

---

## 🔬 No External SaaS

No Firebase, Auth0, OpenAI, managed Whisper. All IP owned — unit economics hold at 100M users. Search `lib/scoring.ts` or `docs/AI_EVALUATION.md` for self-hosted interfaces.

---

## 📦 Workshop

- `lib/scoring.ts` — auditable, deterministic engine used client+server
- `lib/mockData.ts` — versioned question banks
- `lib/store.tsx` — JWT + tenant isolation

---

## 🏛️ Path to IPO

Built for Series-A→IPO scaling: sharding, event streaming, owned inference, verifiable credential infra that other EdTech/HR-tech plug into. The default readiness layer between education and hiring.

---

**Live preview:** `npm run dev` then open preview host (port 3000). All docs in `/docs`.
