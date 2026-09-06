# CALIBIAI SCORE — Folder Structure (Frontend + Backend)

> Modular, cloud-agnostic, horizontally scalable. Each service independently deployable.

```
calibiai-score/
├── app/                          # Next.js 14 App Router (self-hosted, edge-cached)
│   ├── layout.tsx                # Root layout + fonts
│   ├── globals.css
│   ├── page.tsx                  # Landing (hero CalibiAI Score, dashboards)
│   ├── login/page.tsx            # Auth (custom JWT) — sign-up lands on /onboarding
│   ├── onboarding/page.tsx       # 3-step onboarding wizard (new accounts)
│   ├── profile/page.tsx          # Same form in edit mode (tenant-sharded)
│   ├── resume/page.tsx           # Resume upload → MinIO presign → LLaMA analysis
│   ├── tracking/
│   │   ├── whatsapp/page.tsx     # Join WhatsApp (tracking)
│   │   └── linkedin/page.tsx     # Follow LinkedIn (tracking)
│   ├── confirmation/page.tsx     # Pre-assessment confirmation
│   ├── instructions/page.tsx     # Assessment instructions + start timer
│   ├── assessment/page.tsx       # 120-min assessment (6 modules, server timer)
│   ├── result/page.tsx           # CalibiAI Score + PDF generation
│   ├── dashboard/
│   │   ├── student/page.tsx      # Student dashboard
│   │   ├── faculty/page.tsx      # Faculty dashboard
│   │   └── institution/page.tsx  # Institution/Enterprise + hiring pipeline
│   └── api/                      # Next.js API routes (gateway to microservices in prod)
│       ├── auth/login/route.ts
│       ├── profile/route.ts
│       ├── resume/analyze/route.ts
│       ├── tracking/route.ts
│       ├── assessment/start/route.ts
│       ├── assessment/timer/route.ts
│       ├── assessment/submit/route.ts
│       ├── scores/route.ts
│       └── reports/route.ts
├── components/
│   ├── Navbar.tsx
│   ├── Stepper.tsx
│   └── OnboardingFlow.tsx        # 3-step onboarding wizard (used by /onboarding + /profile)
├── lib/
│   ├── store.tsx                 # Global store (JWT, profile, session, scores) — Context + localStorage (prod: httpOnly)
│   ├── validate.ts               # Shared field rules (10-digit mobile, gender dropdown, CGPA, grad year)
│   ├── mockData.ts               # Question banks (deterministic, versioned)
│   └── scoring.ts                # Scoring engine (mirrors server, auditable)
├── services/                     # Production microservices (each Docker + K8s Helm)
│   ├── api-gateway/              # Kong (OSS) — rate limit, JWT, tenant routing
│   │   ├── Dockerfile
│   │   ├── kong.yml
│   │   └── k8s/
│   ├── auth-service/             # Node.js + Argon2id + RS256 JWT + Vault
│   │   ├── src/index.ts
│   │   ├── src/jwt.ts
│   │   └── Dockerfile
│   ├── profile-service/
│   ├── resume-service/           # MinIO presign + queue
│   ├── assessment-service/       # Timer authoritative, answers → Kafka
│   ├── evaluation-worker/        # Python + vLLM + faster-whisper + rule engine
│   │   ├── worker.py
│   │   ├── rule_engine.py
│   │   └── Dockerfile.gpu
│   ├── report-service/           # Puppeteer / jsPDF → MinIO
│   └── storage-service/          # MinIO abstraction
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DATABASE.md
│   ├── API_SPEC.md
│   ├── AI_EVALUATION.md
│   ├── SCORING.md
│   ├── UI_SPEC.md
│   ├── DEPLOYMENT.md
│   ├── FOLDER_STRUCTURE.md
│   └── SAMPLE_RESPONSES.md
├── infra/
│   ├── docker-compose.yml        # Local parity (Kong, Postgres, Redis, Redpanda, MinIO, API, Workers)
│   ├── k8s/                      # Helm charts per service + HPA + PDB
│   └── terraform/
│       ├── modules/k8s/
│       ├── modules/postgres/
│       ├── modules/minio/
│       └── regions/main.tf
├── storage/                      # MinIO buckets (local dev)
├── next.config.js                # Self-hosted config (no external CDN)
├── tailwind.config.js
├── package.json
└── README.md
```

## Service Independence

- Each `services/*` has its own `package.json`/`requirements.txt`, `Dockerfile`, `k8s/deployment.yaml`, `k8s/hpa.yaml`.
- Local: `docker-compose up` runs all + Kong + Postgres + Redis + Redpanda + MinIO.
- Prod: each Helm release scales independently (HPA on CPU, queue depth, GPU util).

## Data Flow Mapping

- `app/resume` → `services/resume-service` (presign) → MinIO → `resume-service` worker → `evaluation-worker` (LLaMA)
- `app/assessment` → `services/assessment-service` (timer + answers) → Redpanda `assessment.events` → `evaluation-worker`
- `app/result` → `services/report-service` (async PDF) → MinIO → CDN

## Why Next.js API Routes in `app/api`

For demo/preview we embed gateway logic in Next.js API routes to run single process on port 3000. In prod, `app/api` is replaced by Kong → dedicated services (no code change for frontend — same path `/api/v1/*`).
