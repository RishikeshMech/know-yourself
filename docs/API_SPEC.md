# CALIBIAI SCORE — API Design

> Base URL: `https://api.calibiai.{region}.internal` (regional) + `https://api.calibiai.global` (GeoDNS). All endpoints behind Kong gateway. JWT in `Authorization: Bearer <access_token>`.

---

## 1. Auth (Custom JWT, No External IdP)

### POST /api/v1/auth/register
Register student/faculty/institution_admin.
```json
// Request
{ "email":"a@uni.edu", "password":"...", "role":"student", "institution_id":"uuid", "full_name":"..." }
// Response 201
{ "user_id":"uuid", "access_token":"eyJ...", "refresh_token":"...", "expires_in":900 }
```

### POST /api/v1/auth/login
```json
{ "email":"a@uni.edu", "password":"..." }
// 200
{ "access_token":"...", "refresh_token":"...", "user":{ "id":"uuid","role":"student","institution_id":"uuid" } }
```

### POST /api/v1/auth/refresh
```json
{ "refresh_token":"..." } // 200 -> new access_token
```

### POST /api/v1/auth/logout
Invalidates refresh token (Redis denylist).

### GET /api/v1/auth/me
Returns caller profile + institution + shard.

---

## 2. Profile

### PUT /api/v1/profile
Upsert student profile.
```json
{
  "full_name":"Priya Sharma", "phone":"+91...", "dob":"2003-04-12",
  "degree":"B.Tech CSE", "college":"IIT Madras", "graduation_year":2026,
  "cgpa":8.7, "skills":["Python","React"], "linkedin_url":"...", "github_url":"..."
}
```

### GET /api/v1/profile/:user_id
Faculty/institution can fetch if same tenant.

---

## 3. Resume

### POST /api/v1/resume/presign
Get MinIO presigned POST for direct upload (avoids backend bottleneck).
```json
// Response
{ "url":"https://storage.calibiai.../resumes/...", "fields":{ "key":"...","policy":"..."}, "resume_id":"uuid", "expires_in":300 }
```

### POST /api/v1/resume/:id/analyze
Enqueue analysis (or auto-triggered on upload complete webhook from MinIO).
```json
// 202 Accepted
{ "resume_id":"uuid", "status":"queued", "estimated_sec":8 }
```

### GET /api/v1/resume/:id
```json
{
  "id":"uuid", "status":"analyzed",
  "resume_score":78,
  "parsed":{ "name":"Priya","skills":["Python"],"experience_years":1.5 },
  "feedback":{
    "strengths":["Strong project section","Clear formatting"],
    "gaps":["Missing quantified impact","No certifications"],
    "suggestions":["Add metrics to internships","Include GitHub links"]
  }
}
```

---

## 4. Tracking (Join WhatsApp / Follow LinkedIn)

### POST /api/v1/tracking/complete
```json
{ "action":"join_whatsapp" } // or follow_linkedin
// 200
{ "action":"join_whatsapp", "completed":true, "completed_at":"2026-09-04T..." }
```

### GET /api/v1/tracking/status
```json
{ "join_whatsapp":true, "follow_linkedin":false, "all_completed":false }
```

Frontend also fires this on button click + verifies via redirect + callback token.

---

## 5. Assessment Lifecycle (Server-Controlled Timer)

### POST /api/v1/assessment/start
Creates session, sets `started_at=now()`, `expires_at=now()+7200`. Idempotent per user (one active session).
```json
// 201
{
  "session_id":"uuid",
  "started_at":"2026-09-04T10:00:00Z",
  "expires_at":"2026-09-04T12:00:00Z",
  "server_time":"2026-09-04T10:00:00Z",
  "duration_sec":7200,
  "modules":["english_listening","english_speaking","english_reading","english_writing","problem_solving","ai_debugging","ai_feature","prompt_engineering","cognitive_motion","cognitive_logical","cognitive_behavioral"]
}
```

### GET /api/v1/assessment/timer?session_id=uuid
Poll every 5s. Authoritative.
```json
{
  "server_time":"2026-09-04T10:15:00Z",
  "expires_at":"2026-09-04T12:00:00Z",
  "remaining_sec":6300,
  "status":"in_progress",
  "tab_switch_count":1
}
```

### POST /api/v1/assessment/:id/answer
```json
{
  "module":"english_listening",
  "question_id":"EL_L_03",
  "answer":{ "choice":"B" },
  "time_spent_ms": 42000
}
// 200 { "saved":true, "answered_at":"..." }
```
Audio answers: `answer: { "storage_key":"minio://audio/...webm" }`

### POST /api/v1/assessment/:id/heartbeat
Sends client telemetry (tab hidden, blur, copy attempt).
```json
{ "event":"tab_hidden", "at":"2026-09-04T10:16:00Z" }
```

### POST /api/v1/assessment/:id/submit
```json
// 200 if before expires_at, 409 if expired
{ "session_id":"uuid", "status":"submitted", "submitted_at":"..." }
```
Enqueues evaluation.

### GET /api/v1/assessment/:id/status
```json
{ "status":"evaluated", "scores_ready":true }
```

---

## 6. Evaluation & Scores

### GET /api/v1/scores/:session_id
```json
{
  "session_id":"uuid",
  "calibiai_score": 842,
  "grade":"A",
  "percentile": 92.4,
  "verifiable_hash":"sha256:...",
  "breakdown":{
    "english": { "total":172, "max":200, "listening":42, "speaking":45, "reading":43, "writing":42 },
    "problem_solving": 168,
    "ai_debugging": 132,
    "ai_feature": 128,
    "prompt_engineering": 88,
    "cognitive": { "total":154, "cognitive_score":78, "behavioral_total":76, "behavioral":{
      "logical_thinking":85, "problem_solving":82, "adaptability":88, "teamwork":76, "accountability":91, "learning_mindset":84, "responsible_ai":79
    }}
  },
  "issued_at":"2026-09-04T12:05:00Z"
}
```

### GET /api/v1/scores/history?user_id=uuid
Paginated attempt history.

---

## 7. Reports (Async)

### POST /api/v1/reports/:session_id/generate
```json
// 202
{ "report_id":"uuid", "status":"rendering" }
```

### GET /api/v1/reports/:session_id
```json
{
  "report_id":"uuid",
  "status":"ready",
  "url":"https://cdn.calibiai.global/reports/uuid.pdf",
  "storage_key":"reports/uuid.pdf",
  "expires_at": null
}
```
PDF is immutable, CDN-cached 1 year.

---

## 8. Dashboards

### Student: GET /api/v1/dashboard/student
```json
{
  "latest_score":842,
  "attempts":2,
  "history":[
    {"session_id":"...","total":790,"date":"2026-07-01"},
    {"session_id":"...","total":842,"date":"2026-09-04"}
  ],
  "resume_feedback":{ "score":78, "suggestions":[...] },
  "strengths":["Accountability","Adaptability"],
  "weaknesses":["Teamwork","Prompt Engineering"],
  "recommendations":["Practice collaborative scenarios","Refine prompt specificity"]
}
```

### Faculty: GET /api/v1/dashboard/faculty?cohort_id=...
```json
{
  "cohort":"CSE 2026",
  "stats":{ "avg_score":712, "median":720, "top_performer":{"name":"Priya","score":842}, "distribution":{"S":12,"A":34,"B":40} },
  "students":[
    {"user_id":"...","name":"Priya","score":842,"grade":"A","resume_score":78},
    {"user_id":"...","name":"Rohan","score":610}
  ]
}
```

### Institution / Enterprise:

#### GET /api/v1/dashboard/institution/overview
Cross-cohort benchmarking.

#### GET /api/v1/enterprise/candidates?min_score=750&skills=Python
Bulk query for hiring pipelines (API key + signed request).
```json
{
  "candidates":[
    {"user_id":"...","name":"Priya","calibiai_score":842,"verifiable_hash":"...","skills":["Python","React"],"resume_url":"..."}
  ],
  "total": 124
}
```

#### POST /api/v1/enterprise/verify
Verify a candidate's score portably.
```json
{ "user_id":"...", "verifiable_hash":"sha256:..." }
// 200 { "valid":true, "score":842, "issued_at":"..." }
```

---

## 9. Enterprise Bulk & Webhooks

### POST /api/v1/enterprise/bulk/query
```json
{ "institution_ids":["uuid"], "min_score":700, "limit":100, "offset":0 }
```

### Webhooks (self-hosted, signed with HMAC)
- `evaluation.completed` -> POST to enterprise callback URL
- `report.ready`

---

## 10. System & Health

### GET /healthz, GET /readyz
### GET /metrics (Prometheus)

---

## 11. Error Envelope (consistent)
```json
{
  "error": { "code":"SESSION_EXPIRED", "message":"Assessment window closed", "details":{ "expires_at":"..." } },
  "request_id":"uuid",
  "region":"ap-south-1"
}
```

Rate limits: 100 req/s per IP, 1000 req/s per API key (enterprise), enforced at Kong + Redis token bucket.

All endpoints audited to `audit_log` Kafka; PII encrypted.
