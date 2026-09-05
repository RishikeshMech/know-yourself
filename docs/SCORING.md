# CALIBIAI SCORE — Scoring Formula (Portable, Trusted, /1000)

> The "credit score for employability." Weighted, auditable, verifiable.

---

## 1. Philosophy

- **Unified & Portable:** One number (0-1000) + verifiable hash, recognized by universities, staffing, enterprises.
- **Weighted by Employability Signal:** AI skills and problem solving weighted higher than pure aptitude — aligned to hiring outcomes, validated against placement data.
- **Sub-scores Transparent:** Every module maps to 0-max, sum = 1000. No black box.

---

## 2. Weight Distribution (Final)

| Module | Sub-modules | Max | % | Rationale |
|--------|-------------|-----|---|-----------|
| **English Communication** | Listening 50, Speaking 50, Reading 50, Writing 50 | **200** | 20% | Gateway to global hiring; 4-skill avg predicts onsite success. |
| **Problem Solving** | MCQ + pseudocode + data interpretation (10 sections) | **200** | 20% | Core engineering signal |
| **AI-Assisted Debugging** | Fix buggy code (hidden tests + quality) | **150** | 15% | Real-world AI-augmented work |
| **AI-Assisted Feature Dev** | Build feature from spec (test harness) | **150** | 15% | End-to-end delivery |
| **Prompt Engineering** | 3 tasks: summarization, code gen, analysis | **100** | 10% | AI-native productivity |
| **Cognitive Assessment** | Cognitive 100 + Behavioral 100 | **200** | 20% | Adaptability, teamwork predict retention |
| **TOTAL** | | **1000** | 100% | |

**Cognitive split:**
- Cognitive Score (Motion Grid 30 + Logical 70) = 100
- Behavioral (7 traits avg) = 100

---

## 3. Formula

```
CALIBIAI = E + PS + AD + AF + PE + C

where
  E  = E_listening + E_speaking + E_reading + E_writing           (0-200)
  PS = sum(problem_solving_answers_correct / total * 200)          (0-200)
  AD = ai_debugging_total                                          (0-150)
  AF = ai_feature_total                                            (0-150)
  PE = prompt_engineering_total                                    (0-100)
  C  = cognitive_score (0-100) + behavioral_total (0-100)          (0-200)
```

### Normalization (handles module not attempted)

All modules required for certification; if missing, score = 0 for that module (no re-normalization) — prevents gaming.

### Sub-module Computation

**English — Listening/Reading (MCQ):**
```
score = (correct / total) * 50
```

**English — Speaking (AI):**
```
fluency(0-25) + pronunciation(0-25) + confidence(0-25) + grammar(0-25) = 50 * (total/100)
```

**English — Writing (AI rubric):**
```
clarity(25) + grammar(25) + structure(25) + tone(25) = 50 * (total/100)
```

**Problem Solving:**
```
PS = (correct_mcq / total_mcq)*120 + (pseudocode_tests_passed / total_tests)*80
```

**AI Debugging:**
```
AD = dynamic_tests(40%) + code_quality(30%) + efficiency(30%)  [0-150 scaled]
```

**AI Feature:**
```
AF = functional_tests(40%) + design(30%) + edge_handling(30%) [0-150 scaled]
```

**Prompt Engineering:**
```
PE = avg(task1,task2,task3) where each = specificity25+context25+constraints25+output25 [0-100]
```

**Cognitive:**
```
motion_grid = 0.7*accuracy + 0.3*speed_bonus  -> *30
logical = (correct/total)*70
cognitive_score = motion_grid + logical  (0-100)

behavioral_total = avg(logical_thinking, problem_solving, adaptability, teamwork, accountability, learning_mindset, responsible_ai)  (0-100)
```

---

## 4. Grade & Percentile

| Total | Grade | Label | Hiring Recommendation |
|-------|-------|-------|-----------------------|
| 900-1000 | S | Exceptional | Top 5% — Fast-track to final rounds |
| 750-899 | A | Strong | Interview-ready — recommended |
| 600-749 | B | Proficient | Trainable — 4-6 week bridge |
| 400-599 | C | Developing | Needs structured upskilling |
| 0-399 | D | Foundation | Intensive program required |

**Percentile:** `percentile = (rank / cohort_size)*100` computed via ClickHouse `quantile` over last 90 days global cohort; updated hourly, stored with score.

---

## 5. Verifiability

```python
verifiable_hash = SHA256(f"{user_id}:{total}:{issued_at}:{SALT}")
# Enterprise verifies via POST /enterprise/verify {user_id, hash} -> valid/invalid + score
```

No external credential; hash is portable and tamper-evident.

---

## 6. Example

Student Priya:

- English: L42 + S45 + R43 + W42 = 172
- Problem Solving: 168
- AI Debugging: 132
- AI Feature: 128
- Prompt Eng: 88
- Cognitive: 78 + 76 = 154

**CALIBIAI = 172+168+132+128+88+154 = 842 → Grade A (92.4 percentile)**

Report: Strengths in Accountability (91), Adaptability (88); gap Teamwork (76).

---

## 7. Calibration & Audit

- Weights calibrated against placement outcomes (logistic regression of score vs offer rate) — re-tuned quarterly via owned data.
- All sub-scores stored immutably; re-scoring possible if rubric version changes (versioned in `scores.evaluation_version`).
