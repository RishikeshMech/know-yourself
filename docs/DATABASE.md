# CALIBIAI SCORE — Database Schema & Sharding Strategy

> PostgreSQL 16, multi-region, 100M+ users. All tables tenant-aware. Shard key: `tenant_id` (institution). Partition keys noted.

---

## 1. Entity Relationship (simplified)

```
institutions 1──∞ users 1──1 profiles 1──∞ resumes
     │               │
     │               ├──∞ assessment_sessions 1──∞ assessment_answers
     │               │         │
     │               │         └──1 calibiai_scores 1──1 reports
     │               │
     │               └──∞ tracking_events (whatsapp/linkedin)
     │
     └──∞ cohorts 1──∞ cohort_members
               └──∞ faculty
```

---

## 2. Core Tables (DDL sketch)

### 2.1 institutions (tenant)
```sql
CREATE TABLE institutions (
  id UUID PRIMARY KEY, -- tenant_id = shard key
  name TEXT NOT NULL,
  domain TEXT UNIQUE,
  tier TEXT CHECK (tier IN ('university','enterprise','government')),
  data_residency_region TEXT NOT NULL, -- us-east-1 / eu-west-1 / ap-south-1
  sso_config JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
) PARTITION BY LIST (data_residency_region);
```

### 2.2 users
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  institution_id UUID REFERENCES institutions(id),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL, -- Argon2id
  role TEXT CHECK (role IN ('student','faculty','institution_admin','enterprise_admin','super_admin')) NOT NULL,
  tenant_shard INT GENERATED ALWAYS AS (hashtext(institution_id::text) % 1024) STORED,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_login_at TIMESTAMPTZ
);
CREATE INDEX ON users (institution_id);
-- Sharding: hash(institution_id) % 1024 -> 1024 logical shards -> mapped to 32 physical shards
```

### 2.3 profiles
```sql
CREATE TABLE profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id),
  full_name TEXT NOT NULL,
  phone TEXT,
  dob DATE,
  gender TEXT,
  degree TEXT, college TEXT, graduation_year INT,
  cgpa NUMERIC(3,2),
  skills TEXT[], -- normalized
  linkedin_url TEXT, github_url TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 2.4 resumes
```sql
CREATE TABLE resumes (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  institution_id UUID NOT NULL,
  storage_key TEXT NOT NULL, -- minio://resumes/{user_id}/{uuid}.pdf
  mime TEXT, size_bytes INT,
  parsed_json JSONB, -- structured extraction
  resume_score INT CHECK (resume_score BETWEEN 0 AND 100),
  feedback JSONB, -- strengths, gaps
  created_at TIMESTAMPTZ DEFAULT now()
) PARTITION BY RANGE (created_at);
```

### 2.5 tracking_events (WhatsApp / LinkedIn)
```sql
CREATE TABLE tracking_events (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  action TEXT CHECK (action IN ('join_whatsapp','follow_linkedin')),
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  ip INET, user_agent TEXT,
  UNIQUE(user_id, action)
);
```

### 2.6 assessment_sessions (tamper-proof timer source)
```sql
CREATE TABLE assessment_sessions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  institution_id UUID NOT NULL,
  status TEXT CHECK (status IN ('not_started','in_progress','submitted','evaluated','expired')) DEFAULT 'not_started',
  started_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ, -- started_at + 7200
  submitted_at TIMESTAMPTZ,
  client_ip INET,
  tab_switch_count INT DEFAULT 0,
  anomaly_score NUMERIC,
  duration_sec INT DEFAULT 7200,
  shard_key INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
) PARTITION BY RANGE (created_at);
CREATE INDEX ON assessment_sessions (user_id, status);
-- Timer: expires_at is source of truth. Never trust client.
```

### 2.7 assessment_answers (high volume — partitioned)
```sql
CREATE TABLE assessment_answers (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES assessment_sessions(id),
  user_id UUID NOT NULL,
  module TEXT CHECK (module IN ('english_listening','english_speaking','english_reading','english_writing','problem_solving','ai_debugging','ai_feature','prompt_engineering','cognitive_motion','cognitive_logical','cognitive_behavioral')),
  question_id TEXT NOT NULL,
  answer JSONB NOT NULL, -- MCQ choice, text, code, audio storage_key
  time_spent_ms INT,
  answered_at TIMESTAMPTZ DEFAULT now(),
  evaluation JSONB -- filled by worker
) PARTITION BY RANGE (answered_at);
-- 100M users × ~80 answers avg = 8B rows -> monthly partitions, TTL 2 years hot, then to ClickHouse cold
CREATE INDEX ON assessment_answers (session_id, module);
```

### 2.8 scores (section-wise)
```sql
CREATE TABLE scores (
  id UUID PRIMARY KEY,
  session_id UUID UNIQUE REFERENCES assessment_sessions(id),
  user_id UUID NOT NULL,
  english_listening INT, english_speaking INT, english_reading INT, english_writing INT,
  english_total INT, -- /200
  problem_solving INT, -- /200
  ai_debugging INT, -- /150
  ai_feature INT, -- /150
  prompt_engineering INT, -- /100
  cognitive_score INT, -- /100
  behavioral JSONB, -- {logical_thinking, problem_solving, adaptability, teamwork, accountability, ...}
  behavioral_total INT, -- /100
  cognitive_total INT, -- /200
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 2.9 calibiai_scores (portable, verifiable)
```sql
CREATE TABLE calibiai_scores (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  session_id UUID UNIQUE REFERENCES assessment_sessions(id),
  total INT CHECK (total BETWEEN 0 AND 1000) NOT NULL,
  percentile NUMERIC(5,2),
  grade TEXT CHECK (grade IN ('S','A','B','C','D')),
  verifiable_hash TEXT NOT NULL, -- SHA256(total+user_id+salt) for enterprise verification
  issued_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ -- scores valid 2 years
);
CREATE INDEX ON calibiai_scores (user_id, issued_at DESC);
```

### 2.10 reports
```sql
CREATE TABLE reports (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES assessment_sessions(id),
  storage_key TEXT NOT NULL, -- minio://reports/{session_id}.pdf
  status TEXT CHECK (status IN ('pending','rendering','ready','failed')),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 2.11 audit_log (append-only, streamed to ClickHouse)
```sql
CREATE TABLE audit_log (
  id UUID PRIMARY KEY,
  user_id UUID, institution_id UUID,
  action TEXT NOT NULL, -- login, profile.update, resume.upload, tracking.complete, assessment.start, answer.save, submit, evaluation.complete
  payload JSONB,
  ip INET, region TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
) PARTITION BY RANGE (created_at);
```

### 2.12 cohorts & faculty
```sql
CREATE TABLE cohorts (id UUID PRIMARY KEY, institution_id UUID, name TEXT, year INT);
CREATE TABLE cohort_members (cohort_id UUID REFERENCES cohorts(id), user_id UUID REFERENCES users(id), PRIMARY KEY(cohort_id,user_id));
CREATE TABLE faculty (user_id UUID PRIMARY KEY REFERENCES users(id), institution_id UUID, department TEXT);
```

---

## 3. Sharding & Partitioning Strategy (100M+)

| Table | Strategy | Key | Physical Layout |
|-------|----------|-----|-----------------|
| **users, profiles, assessment_sessions, scores, calibiai_scores, resumes** | **Hash sharding** | `hash(institution_id) % 1024` logical -> 32 physical Postgres clusters (32 shards × 32 logical each). | Application-level routing via shard map in Redis (cached) + Citus/pg_shardman for cross-shard queries. |
| **assessment_answers, audit_log, tracking_events** | **Range partitioning** by `created_at` (monthly) + hash sub-partition by `shard_key` | Time + tenant | Hot partitions on NVMe, cold (>6mo) tiered to ClickHouse / S3 Parquet for analytics. |
| **institutions** | List partition by `data_residency_region` | Region | Ensures EU data never leaves EU primary unless replicated with consent; app enforces read-from-local-region. |

**Why hash on institution, not user?** Queries are institution-scoped (faculty dashboard, cohort analytics) — keeps those local to one shard, avoiding scatter-gather. User dashboard hits one shard deterministically.

**Read replicas:** Each physical shard has 1 primary + 3 async read replicas (one in each region for cross-region reads). Writes always go to home region primary (determined by `data_residency_region`).

**Sequence generation:** Snowflake IDs (timestamp + shard + seq) for high-write tables (`assessment_answers`) to avoid UUID hotspots; UUID v7 alternative.

---

## 4. Event Streaming (Redpanda/Kafka)

Topics:
- `assessment.events` — partition by `session_id`, retention 7d, consumers: fraud detector, live proctoring
- `evaluation.jobs` — partition by `shard_key`, batch size 32
- `report.jobs` — single partition per region
- `audit.log` — infinite retention via tiered storage to S3

---

## 5. Caching (Redis Cluster)

- `timer:{session_id}` -> `{expires_at, remaining}` TTL 2h (ephemeral; Postgres authoritative)
- `score:{user_id}:latest` -> denormalized calibre score
- `ratelimit:{ip}` -> token bucket
- `shardmap:{institution_id}` -> physical shard

---

## 6. Data Residency & Encryption

- **At rest:** LUKS + MinIO SSE-S3 + pgcrypto for `phone`, `email`
- **In transit:** mTLS between services (Linkerd)
- **Residency:** Row-level `data_residency_region` enforced by RLS policies; cross-region replication encrypted and opt-in per institution contract.

---

## 7. Retention

- Hot assessment data: 2 years in Postgres
- Cold: archived to ClickHouse + Parquet on MinIO after 6 months (queryable via Trino)
- Audit: 7 years
- Reports: indefinite (immutable PDFs, versioned)
