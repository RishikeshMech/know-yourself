# CALIBIAI SCORE — Deployment Strategy (Self-Hosted, Multi-Region, Zero-Downtime)

> From thousands to hundreds of millions. No managed SaaS. Cloud-agnostic infra.

---

## 1. Infrastructure Stack (Owned)

| Layer | Tool | Why |
|-------|------|-----|
| **Orchestration** | Kubernetes 1.30 (kubeadm + Kubespray) | Cloud-agnostic, bare-metal ready |
| **GitOps** | ArgoCD self-hosted | Declarative, audited |
| **IaC** | Terraform + Terragrunt | Multi-region, reproducible |
| **Registry** | Harbor (self-hosted) | No DockerHub dependency |
| **Network** | Cilium (eBPF), Linkerd mTLS | Fast, secure |
| **Gateway** | Kong Gateway (OSS) | Rate limit, JWT, sharding |
| **DB** | PostgreSQL 16 + Patroni + etcd | HA, streaming replication |
| **Cache** | Redis Cluster 7 | Sharded, persisted |
| **Queue** | Redpanda (Kafka API) | 10x lighter than Kafka |
| **Storage** | MinIO (S3) + Rook/Ceph fallback | Erasure coded, CDN-fronted |
| **Search/Analytics** | ClickHouse + Trino | Audit, cohort analytics |
| **GPU** | NVIDIA GPU Operator + vLLM + Triton | Autoscaling inference |
| **Observability** | Prometheus + Mimir + Loki + Jaeger + Grafana | Self-hosted |
| **CI** | Woodpecker CI / Drone (self-hosted) | No GitHub Actions SaaS lock |
| **CDN** | Nginx + Varnish + Anycast BGP | Owned edge |

---

## 2. Multi-Region Topology (Day-1: 3 regions)

- **Regions:** `ap-south-1` (Mumbai, primary for India), `eu-west-1` (Frankfurt, GDPR), `us-east-1` (Virginia)
- **DNS:** PowerDNS self-hosted + Anycast BGP (or Route53 if cloud, but self-hosted fallback ready). Health checks every 10s.
- **Replication:**
  - Postgres: Patroni async logical replication cross-region (WAL streaming). RPO <5s, RTO 60s via promotion.
  - MinIO: site replication active-active.
  - Redis: CRDT not used; timer in Postgres authoritative, Redis ephemeral.
  - Redpanda: MirrorMaker 2 cross-region for `audit.log` only; evaluation topics region-local.

**Placement:** API Gateway in each region serves global; sticky not required because JWT + shard map routes correctly.

---

## 3. Deployment Pipelines

### 3.1 CI (Woodpecker)
```
push -> lint (eslint, go vet) -> test (jest, k6 smoke) -> build Docker -> push Harbor -> Trivy scan -> Helm lint -> ArgoCD sync (dev)
```

### 3.2 CD (ArgoCD)
- Environments: `dev` (single region) -> `staging` (3 regions, 10% traffic) -> `prod` (100%)
- Strategy: **Blue-Green** for stateless services, **RollingUpdate + PDB** for DB, **Canary 5%** for ML models (Triton model config).
- Zero-downtime: `maxUnavailable: 0`, `maxSurge: 50%`, preStop hooks drain connections, Kong health checks.

### 3.3 Database Migrations
- Tool: `golang-migrate` self-hosted, run as K8s Job with advisory lock (`pg_advisory_lock`).
- Expand/contract pattern for zero-downtime schema changes. Sharded migrations fan-out via script.

---

## 4. Scaling Strategy (K8s HPA + KEDA)

| Service | Baseline | Peak (exam window) | Scaler |
|---------|----------|--------------------|--------|
| API Gateway (Kong) | 10 pods | 200 pods | CPU 60% + RPS |
| Assessment Service | 20 | 500 | KEDA on Redpanda lag + CPU |
| Evaluation Workers (CPU) | 10 | 300 | KEDA `lag > 100` |
| GPU Fleet (A100) | 5 nodes (40 GPUs) | 60 nodes (480 GPUs) | KEDA `gpu_util >70` + scheduled pre-warm |
| Report Service | 5 | 50 | Queue depth |
| Postgres | 1 primary +3 RR per shard (32 shards) | Auto-read scaling (+RR) | Manual + Patroni |
| MinIO | 4 nodes | 24 nodes | erasure coding scales |

**Pre-warm:** CronJob 30min before national exam windows scales GPU nodes via Cluster Autoscaler (self-hosted on bare metal with IPMI, or cloud ASG).

**Load test gates:** k6 runs with 5M VUs before each window; if p95 >300ms, block release.

---

## 5. Sharding Ops

- 1024 logical shards map to 32 physical clusters via consistent hash ring stored in `shard_map` ConfigMap + Redis.
- Adding a shard: Terraform spins new Patroni cluster, logical replication slots, then re-balance via `pg_shardman` online move (no downtime).
- Queries that cross shards (global percentile) go to ClickHouse replica, not Postgres.

---

## 6. Security & Compliance

- **mTLS** everywhere (Linkerd).
- **Secrets:** Vault self-hosted (integrated with K8s).
- **Images:** signed with Cosign, verified by Kyverno.
- **Data residency:** admission webhook denies cross-region reads if `institution.data_residency != region` unless `allow_cross_region=true`.
- **Backups:** Velero + pgBackRest to MinIO, cross-region copied, 7-year WORM for audit.
- **DDoS:** self-hosted CrowdSec + rate limits at Kong (100 req/s IP, 1000/s API key).

---

## 7. Observability (No Datadog)

- **Metrics:** Prometheus federated per region -> Mimir global.
- **Logs:** Vector -> Loki, retention 30d hot / S3 cold.
- **Traces:** Jaeger (sampling 1% prod, 100% on errors).
- **Alerts:** AlertManager -> self-hosted n8n -> PagerDuty alternative (Grafana OnCall).
- **SLOs:** 99.95% API availability, p95 <200ms, evaluation <30s, report <60s.

---

## 8. Disaster Recovery

| Scenario | Playbook |
|----------|----------|
| **Region loss** | GeoDNS drains, Patroni promotes replica in survivor region, MinIO continues (active-active), restore from backup if both primaries lost |
| **DB corruption** | PitR via WAL-G to last 5s, logical replica lag monitored |
| **GPU fleet outage** | Degrade to CPU-only rule-based scoring (Bill still generated, AI scores marked pending, re-evaluated when fleet recovers) |
| **Queue overflow** | Backpressure: 429 with Retry-After, client queues answers locally (IndexedDB) and retries |

**RTO/RPO:** RTO 60s region, 5min full platform; RPO 5s.

---

## 9. Cost & Efficiency (No SaaS Margin)

- Self-hosting saves ~$0.40 per assessment at 100M scale vs OpenAI/Whisper SaaS.
- GPU utilization target 75% via batching + bin packing; spot instances for 30% of fleet (workers checkpoint).
- Storage: MinIO erasure 8+4 = 1.5x overhead vs 3x replication.

---

## 10. Local Dev Parity

```bash
docker-compose up --build  # Kong, Postgres 16, Redis, Redpanda, MinIO, API, Frontend, Workers
```

One command brings full stack with seed data (10 institutions, 1000 students, sample assessments). Used for Series-A diligence demos.

---

## 11. Day-0 Bootstrap (Terraform)

```hcl
# infra/terraform/regions/main.tf (sketch)
module "region" {
  source = "../modules/k8s"
  for_each = toset(["us-east-1","eu-west-1","ap-south-1"])
  region = each.key
  node_groups = {
    general = { type="c2-standard-8", count=10 }
    gpu     = { type="a2-highgpu-1g", count=5, taint="gpu=true" }
  }
}
module "postgres_shards" { count=32 ... }
module "minio" { ... }
module "redpanda" { ... }
```

**Cloud-agnostic:** swap module source from `aws` to `gcp` or `baremetal` with same interface.

---

## 12. Roadmap to IPO Scale

- **Now:** 3 regions, 32 shards, 40 GPUs.
- **10M users:** 6 regions, 64 shards, 200 GPUs, ClickHouse federation.
- **100M users:** 10 regions, 128 shards, 1000 GPUs, edge inference (distilled 1B models on CDN edge for instant feedback).
