# CALIBIAI SCORE — Sample JSON Responses

> Consistent envelope, versioned (`v1`), tenant-aware.

---

## Auth

### POST /api/v1/auth/login — 200
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "v2.local....",
  "expires_in": 900,
  "user": { "id":"u_4f3a9", "email":"priya@iitm.ac.in", "role":"student", "institution_id":"inst_iitm" }
}
```

### GET /api/v1/auth/me — 200
```json
{ "id":"u_4f3a9", "email":"priya@iitm.ac.in", "role":"student", "institution_id":"inst_iitm", "shard": 412 }
```

---

## Profile

### PUT /api/v1/profile — 200
```json
{ "user_id":"u_4f3a9", "full_name":"Priya Sharma", "college":"IIT Madras", "graduation_year":2026, "skills":["Python","React"] }
```

---

## Resume

### POST /api/v1/resume/presign — 200
```json
{ "url":"https://storage.calibiai.global/resumes", "fields":{"key":"resumes/u_4f3a9/8f3a.pdf","policy":"..."}, "resume_id":"r_9a1c", "expires_in":300 }
```

### GET /api/v1/resume/r_9a1c — 200
```json
{
  "id":"r_9a1c", "status":"analyzed", "resume_score":78,
  "parsed":{"name":"Priya Sharma","skills":["Python","React","SQL"],"experience_years":1.2},
  "feedback":{
    "strengths":["Strong project section","Clear formatting"],
    "gaps":["Missing quantified impact","No certifications"],
    "suggestions":["Add metrics to internships","Include GitHub links"]
  }
}
```

---

## Tracking

### POST /api/v1/tracking/complete — 200
```json
{ "action":"join_whatsapp", "completed":true, "completed_at":"2026-09-04T10:05:00Z" }
```

### GET /api/v1/tracking/status — 200
```json
{ "join_whatsapp":true, "follow_linkedin":true, "all_completed":true }
```

---

## Assessment

### POST /api/v1/assessment/start — 201
```json
{
  "session_id":"sess_8f3a1b",
  "started_at":"2026-09-04T10:00:00Z",
  "expires_at":"2026-09-04T12:00:00Z",
  "server_time":"2026-09-04T10:00:00Z",
  "duration_sec":7200,
  "modules":["english_listening","english_speaking","english_reading","english_writing","problem_solving","ai_debugging","ai_feature","prompt_engineering","cognitive_motion","cognitive_logical","cognitive_behavioral"]
}
```

### GET /api/v1/assessment/timer?session_id=sess_8f3a1b — 200
```json
{ "server_time":"2026-09-04T10:15:00Z", "expires_at":"2026-09-04T12:00:00Z", "remaining_sec":6300, "status":"in_progress", "tab_switch_count":1 }
```

### POST /api/v1/assessment/sess_8f3a1b/answer — 200
```json
{ "saved":true, "answered_at":"2026-09-04T10:16:00Z" }
```

### POST /api/v1/assessment/sess_8f3a1b/submit — 200
```json
{ "session_id":"sess_8f3a1b", "status":"submitted", "submitted_at":"2026-09-04T11:58:00Z" }
```

---

## Scores

### GET /api/v1/scores/sess_8f3a1b — 200
```json
{
  "session_id":"sess_8f3a1b",
  "calibiai_score":842,
  "grade":"A",
  "percentile":92.4,
  "verifiable_hash":"sha256:8f3a...9c1b",
  "breakdown":{
    "english":{"total":172,"max":200,"listening":42,"speaking":45,"reading":43,"writing":42},
    "problem_solving":168,
    "ai_debugging":132,
    "ai_feature":128,
    "prompt_engineering":88,
    "cognitive":{"total":154,"cognitive_score":78,"behavioral_total":76,
      "behavioral":{"logical_thinking":85,"problem_solving":82,"adaptability":88,"teamwork":76,"accountability":91,"learning_mindset":84,"responsible_ai":79}
    }
  },
  "issued_at":"2026-09-04T12:05:00Z"
}
```

---

## Reports

### POST /api/v1/reports/sess_8f3a1b/generate — 202
```json
{ "report_id":"rep_4f2a", "status":"rendering" }
```

### GET /api/v1/reports/sess_8f3a1b — 200
```json
{ "report_id":"rep_4f2a", "status":"ready", "url":"https://cdn.calibiai.global/reports/sess_8f3a1b.pdf", "storage_key":"reports/sess_8f3a1b.pdf" }
```

---

## Dashboards

### GET /api/v1/dashboard/student — 200
```json
{
  "latest_score":842,
  "attempts":2,
  "history":[{"session_id":"sess_1","total":790,"date":"2026-07-01"},{"session_id":"sess_8f3a1b","total":842,"date":"2026-09-04"}],
  "resume_feedback":{"score":78,"suggestions":["Add metrics"]},
  "strengths":["Accountability","Adaptability"],
  "weaknesses":["Teamwork","Prompt specificity"],
  "recommendations":["Collaborative scenarios","Prompt constraints drills"]
}
```

### GET /api/v1/dashboard/faculty?cohort_id=cse2026 — 200
```json
{
  "cohort":"CSE 2026",
  "stats":{"avg_score":712,"median":720,"top_performer":{"name":"Ananya Singh","score":884},"distribution":{"S":2,"A":3,"B":3,"C":1}},
  "students":[{"user_id":"u_1","name":"Priya","score":842,"grade":"A","resume_score":78}]
}
```

### GET /api/v1/enterprise/candidates?min_score=750 — 200
```json
{
  "candidates":[{"user_id":"u_1","name":"Priya Sharma","calibiai_score":842,"verifiable_hash":"sha256:...","skills":["Python","React"],"resume_url":"https://cdn.../resumes/..."}],
  "total":124
}
```

### POST /api/v1/enterprise/verify — 200
```json
{ "valid":true, "score":842, "issued_at":"2026-09-04T12:05:00Z" }
```

---

## Errors

### 409 Session Expired
```json
{ "error":{"code":"SESSION_EXPIRED","message":"Assessment window closed","details":{"expires_at":"2026-09-04T12:00:00Z"}}, "request_id":"req_8f3a", "region":"ap-south-1" }
```

### 429 Rate Limited
```json
{ "error":{"code":"RATE_LIMITED","message":"Too many requests","details":{"retry_after":2}}, "request_id":"req_9b1a", "region":"ap-south-1" }
```
