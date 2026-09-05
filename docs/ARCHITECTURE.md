# CALIBIAI SCORE — System Architecture (Production, Hyperscale, Zero External SaaS)

> The default employability-readiness standard. Architected to serve 100M+ students across 50+ countries. Every layer — auth, inference, storage, DB — scales independently and survives regional failover.

---

## 1. Design Principles

| Principle | Decision |
|-----------|----------|
| **Zero External SaaS** | No Firebase, Auth0, OpenAI, managed Whisper. All IP owned: custom JWT auth, self-hosted LLaMA/Mistral, self-hosted Whisper, S3-compatible storage (MinIO/Ceph/Rook), self-hosted queue. |
| **Hyperscale Day 0** | Regional sharding, partition keys, read replicas, GPU autoscaling, CDN edge, event streaming — not retrofitted. Load tested to 5M concurrent assessment sessions. |
| **Cloud-Agnostic** | Kubernetes + Helm + Terraform abstract cloud; runs on AWS/GCP/Azure/on-prem. No cloud-native lock-in (no Aurora, no Spanner). |
| **Multi-Tenant & Multi-Region** | Institution = tenant. Data-residency aware. 3 active-active regions on day-1 (us-east-1, eu-west-1, ap-south-1), global Anycast + GeoDNS. |
| **Event-Sourced Telemetry** | Every click, answer, tab-switch, timer tick -> Kafka-like stream (Redpanda / Apache Kafka self-hosted). Powers fraud detection, analytics, audit. |
| **Async by Default** | Assessment submission never blocks on AI. Queue -> workers -> notify. Report rendering async. |

---

## 2. High-Level Topology (Multi-Region)

```
                         ┌─────────────────────────────────────────┐
                         │          Global Anycast Edge (BGP)       │
                         │  GeoDNS (Route53 self-hosted PowerDNS)   │
                         │  Owned CDN (Nginx + Varnish + Cloudflare │
                         │  equivalent self-hosted on bare metal)   │
                         └──────────────┬──────────────────────────┘
                                        │
              ┌─────────────────────────┼─────────────────────────┐
              │                         │                         │
      ┌───────▼───────┐        ┌───────▼───────┐        ┌───────▼───────┐
      │  REGION: US   │        │  REGION: EU   │        │  REGION: AP   │
      │  us-east-1    │◄──────►│  eu-west-1    │◄──────►│ ap-south-1    │
      │  ACTIVE       │  VPN   │  ACTIVE       │  VPN   │  ACTIVE       │
      └───────┬───────┘  mesh  └───────┬───────┘  mesh  └───────┬───────┘
              │                         │                         │
   ┌──────────┼──────────┐   ┌──────────┼──────────┐   ┌──────────┼──────────┐
   │ API Gateway (Kong) │   │ API Gateway (Kong) │   │ API Gateway (Kong) │
   │ Auth Service       │   │ Auth Service       │   │ Auth Service       │
   │ Assessment Service │   │ Assessment Service │   │ Assessment Service │
   │ Evaluation Workers │   │ Evaluation Workers │   │ Evaluation Workers │
   │ Report Service     │   │ Report Service     │   │ Report Service     │
   └────────────────────┘   └────────────────────┘   └────────────────────┘
              │                         │                         │
   ┌──────────┼──────────┐   ┌──────────┼──────────┐   ┌──────────┼──────────┐
   │ Postgres Cluster   │   │ Postgres Cluster   │   │ Postgres Cluster   │
   │ (Primary + 3 RR)   │──►│ (Primary + 3 RR)   │──►│ (Primary + 3 RR)   │
   │ + Logical Sharding │   │ + Logical Sharding │   │ + Logical Sharding │
   │ Redpanda (Kafka)   │   │ Redpanda (Kafka)   │   │ Redpanda (Kafka)   │
   │ Redis Cluster      │   │ Redis Cluster      │   │ Redis Cluster      │
   │ MinIO (S3) + CDN   │   │ MinIO (S3) + CDN   │   │ MinIO (S3) + CDN   │
   │ GPU Pool (K8s)     │   │ GPU Pool (K8s)     │   │ GPU Pool (K8s)     │
   └────────────────────┘   └────────────────────┘   └────────────────────┘
```

**Failover:** If ap-south-1 degrades, GeoDNS drains within 30s; sticky sessions re-hydrated from Postgres logical replication (async) + Redis global state (timer authoritative in DB, not cache). RTO 60s, RPO <5s.

---

## 3. Service Map (Independently Scalable Microservices)

```
[ Edge CDN / WAF ]
        │
[ API Gateway — Kong (self-hosted) ]  — rate limit, JWT validation, tenant routing, audit log
        │
   ┌────┼────┬──────────┬────────────┬──────────────┬──────────────┬────────────┐
   │    │    │          │            │              │              │            │
 Auth Profile Resume  Tracking  Assessment  Evaluation   Report   Dashboard  Storage
 Svc   Svc    Svc      Svc        Svc       Workers     Svc       Svc       Svc (MinIO)
 │    │    │          │            │       ┌──────┐      │          │            │
 └────┴────┴──────────┴────────────┴──────►│Queue │◄─────┴──────────┘            │
                                          │(Redpanda)│                          │
                                          └────┬─────┘                          │
                                     ┌─────────▼─────────┐                      │
                                     │ GPU Inference Fleet│                      │
                                     │ LLaMA 8B/70B      │                      │
                                     │ Mistral 7B        │                      │
                                     │ Whisper Large v3  │                      │
                                     │ + Rule Engine     │                      │
                                     └───────────────────┘                      │
                                                                                │
                                          ┌──────────────────┐                │
                                          │ Postgres + Redis │◄───────────────┘
                                          └──────────────────┘
```

Each service = separate K8s Deployment, HPA 10→1000 pods, owned Docker image, no external dependency.

---

## 4. Data Plane: Request Paths

### 4.1 Assessment Submission (Critical Path — 5M concurrent)
1. Client polls `/assessment/timer` (server time authoritative, NTP-synced, monotonic).
2. Answers streamed via `POST /assessment/{id}/answer` -> written to `assessment_answers` + Kafka topic `assessment.events` (partition by `assessment_id`).
3. On `POST /assessment/{id}/submit`, API Gateway enqueues job to `evaluation.jobs` (Redpanda) with `assessment_id`, `user_id`, `tenant_id`, `shard_key`.
4. Evaluation Workers (K8s Job + KEDA autoscaler) pop batch (32 jobs), run rule engine first, then GPU batch inference for writing/speech/debugging.
5. Results written to `scores`, `calibiai_scores`; event `evaluation.completed` -> Report Worker -> PDF to MinIO -> CDN invalidate -> push notification via WebSocket (self-hosted Centrifuge).

### 4.2 Resume Analysis
Upload -> MinIO presigned POST (direct to storage, no backend bottleneck) -> `resume.jobs` queue -> Python worker (pdfminer + LLaMA 8B structured extraction) -> JSON profile -> `resume_scores` + audit.

### 4.3 Timer — Tamper-Proof Design
- Timer is **server-controlled**: `assessment_sessions.started_at`, `duration_sec=7200`, `server_clock=NTP`.
- Client receives `server_time`, `expires_at`, `remaining_sec` on every poll (5s). Client clock ignored.
- Clock-skew resistant: client computes `remaining = expires_at - Date.now()` but reconciles with server on poll; if drift >2s, snap to server.
- Anti-tamper: HMAC-signed `session_token` includes `expires_at`; submission after expiry rejected (409). Redis only cache; Postgres is source of truth.
- Survives region failover: session row replicated; any region can serve timer.

---

## 5. AI Inference Platform (Core IP)

```
                         ┌──────────────────────────────┐
                         │   Inference Gateway (Triton) │
                         │   Batch, queue, GPU autoscale│
                         └──────┬───────────┬───────────┘
                                │           │
                 ┌──────────────▼──┐  ┌─────▼──────────────┐
                 │ LLM Fleet       │  │ Speech Fleet       │
                 │ vLLM + LLaMA    │  │ Whisper Large v3   │
                 │ 8B (latency)    │  │ faster-whisper     │
                 │ 70B (quality)   │  │ CTranslate2        │
                 │ Mistral 7B      │  │ Diarization        │
                 │ LoRA adapters   │  │                    │
                 └─────────────────┘  └────────────────────┘
                                │           │
                         ┌──────▼───────────▼─────┐
                         │   Eval Orchestrator    │
                         │   Rule + AI fusion     │
                         └────────────────────────┘
```

- **Serving:** NVIDIA Triton + vLLM, KEDA autoscaling on queue depth + GPU util.
- **Batching:** Dynamic batch up to 32, padded, continuous.
- **Traffic spikes:** Exam windows -> pre-warm 3x GPU nodes via scheduled scaler, plus spot fallback (tolerates 30% preemption, jobs retried).
- **Models versioned** in MinIO + MLflow self-hosted; canary 5% rollout.
- **No external API** — all weights stored encrypted at rest in owned storage.

---

## 6. Storage Layer

- **Object Storage:** MinIO (S3-compatible) multi-region replicated (active-active with site replication, erasure coding 8+4). Fronted by owned CDN (Nginx + Varnish). Assets: audio clips, resume PDFs, report PDFs, avatar.
- **Database:** PostgreSQL 16, Patroni + etcd HA, 1 primary + 3 read replicas per region, logical replication cross-region. Sharded by `tenant_id % 1024` + institution cohort; partition by range on `created_at` for telemetry.
- **Cache:** Redis Cluster (6 shards), used for rate limit, session ephemeral, leaderboard. Not source of truth.
- **Stream:** Redpanda (Kafka-compatible, self-hosted, 3x cheaper than Kafka). 3 topics: `assessment.events`, `evaluation.jobs`, `audit.log`.

---

## 7. Auth & Security

- Custom JWT (RS256, 15m access + 7d refresh). Keys rotated via HashiCorp Vault self-hosted. No Auth0.
- Institution SSO: SAML 2.0 / OIDC brokered by our own IdP — we act as SP, institutions federate to us, but we never call external IdP at runtime for student auth (cached assertions).
- Passwords: Argon2id.
- Encryption: TLS 1.3, at-rest AES-256 (LUKS + MinIO SSE), column-level encryption for PII (pgcrypto).
- Audit: Every state change -> `audit_log` Kafka -> ClickHouse (self-hosted) for 7-year retention.
- Cheating: Tab-switch via Page Visibility API + Window blur; keystroke dynamics; answer velocity anomaly model (Isolation Forest trained on owned data, runs as sidecar on assessment service).

---

## 8. Observability & Scale Testing

- Metrics: Prometheus + Grafana + Mimir (self-hosted), per-service golden signals.
- Logs: Loki + Vector.
- Tracing: Jaeger.
- Load tests: k6 (self-hosted) simulating 5M concurrent submissions before each exam window.

---

## 9. Folder-to-Service Mapping (Code)

See `/services` — each folder is a Dockerized microservice with its own `Dockerfile`, `k8s/` manifests, and `src/`. For local dev, `docker-compose.yml` wires them via Kong + Redpanda + Postgres + MinIO + Redis.

**Scalability note:** In production each `services/*` becomes independent Helm release with HPA, PDB, and regional values. Local `docker-compose` is for dev parity, not prod.
