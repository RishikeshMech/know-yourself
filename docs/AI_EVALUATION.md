# CALIBIAI SCORE — AI Evaluation Engine (Self-Hosted, Distributed)

> No external APIs. All models self-hosted on owned GPU fleet. Rule-based + AI fusion.

---

## 1. Pipeline Overview

```
Submission
   │
   ├─► Rule Engine (deterministic, CPU, horizontally scalable, cache-friendly)
   │     • MCQ exact match, time-accuracy, grid accuracy, logical correctness
   │
   ├─► AI Workers (GPU, batched, autoscaled via KEDA on Redpanda depth)
   │     • Resume parsing (LLaMA 8B)
   │     • Writing eval (LLaMA 8B + rubric LoRA)
   │     • Speech eval (Whisper Large v3 -> text -> LLM rubric)
   │     • Debugging quality (LLaMA 8B + code analysis)
   │     • Feature quality (LLaMA + test harness)
   │     • Prompt quality (LLaMA + rubric)
   │     • Behavioral inference (LLaMA)
   │
   └─► Fusion & Weighting -> CALIBIAI /1000
```

All jobs pulled from `evaluation.jobs` Redpanda topic, idempotent via `session_id`.

---

## 2. Rule-Based Evaluation (Deterministic)

Runs first, no GPU.

- **MCQ:** `score = sum(is_correct ? weight : 0)`
- **Grid Challenge:** `accuracy = correct_cells / total_cells`, `speed_bonus = max(0, 1 - avg_time_per_move/5s)`, `score = 0.7*accuracy + 0.3*speed_bonus`
- **Logical Reasoning:** exact answer match; pseudocode output validated via sandboxed execution (isolated Node/Python microVM via gVisor)
- **Time tracking:** `time_spent_ms` per question aggregated; extremely fast (<2s) + correct flagged for anomaly review

```python
# rule_engine.py
def score_mcq(answers, answer_key):
    return sum(1 for a,k in zip(answers, answer_key) if a.choice == k.correct) / len(answer_key)

def score_grid(moves, expected):
    acc = sum(1 for m,e in zip(moves, expected) if m==e)/len(expected)
    speed = 1 - min(sum(m.time_ms for m in moves)/len(moves)/5000, 1)
    return 0.7*acc + 0.3*speed
```

---

## 3. AI Evaluation — Model Serving

| Task | Model | Serving | Batch | Latency SLO |
|------|-------|---------|-------|-------------|
| Resume parsing | LLaMA 3.1 8B + LoRA(resume) | vLLM, Triton | 32 | 2s |
| Writing eval | LLaMA 3.1 8B rubric | vLLM | 32 | 1.5s |
| Speech STT | Whisper Large v3 (faster-whisper) | CTranslate2 | 16 | 3s / 60s audio |
| Speech rubric | LLaMA 8B | vLLM | 32 | 1s |
| Debugging | LLaMA 8B + code LoRA + static analysis | vLLM + sandbox | 16 | 2s |
| Feature dev | LLaMA 8B + unit test harness | vLLM + sandbox | 8 | 4s |
| Prompt eng | LLaMA 8B rubric | vLLM | 32 | 1s |
| Behavioral | LLaMA 8B classifier | vLLM | 32 | 1s |

**Autoscaling:** KEDA `ScaledObject` on `redpanda_lag > 100` OR `gpu_util > 70%`. Pre-warm 3x nodes before exam window (cron). Spot fallback with retry.

**All weights versioned** in MinIO `s3://models/llama/8b/v42`; canary 5% via Triton model config.

---

## 4. Pseudo-Code — Each Module

### 4.1 Resume Analysis
```python
def evaluate_resume(pdf_bytes):
    text = pdfminer.extract_text(pdf_bytes)
    prompt = f"""
    You are a resume parser. Extract JSON:
    {{name, skills[], experience_years, education, projects[], gaps[]}}
    Resume:
    {text}
    Return JSON only.
    """
    parsed = llm.generate(prompt, max_tokens=800, temp=0.1)
    parsed = json.loads(parsed)
    # Score rubric
    score = 0
    score += 20 if len(parsed.skills) >=5 else 10
    score += 20 if parsed.experience_years >1 else 10
    score += 20 if has_quantified_impact(text) else 5
    score += 20 if has_projects(parsed) else 10
    score += 20 if formatting_good(text) else 10
    feedback = llm.generate(f"Give strengths/gaps for: {text} + {parsed}")
    return {"parsed":parsed, "resume_score":score, "feedback":feedback}
```

### 4.2 English — Writing
```python
def evaluate_writing(scenario, response):
    prompt = f"""
    Rubric: Clarity(25), Grammar(25), Structure(25), ProfessionalTone(25) = total 100.
    Scenario: {scenario}
    Response: {response}
    Score JSON: {{clarity, grammar, structure, tone, total, feedback}}
    """
    out = llm.generate(prompt, temp=0.2)
    return json.loads(out)  # validated 0-25 each
```

### 4.3 English — Speaking
```python
def evaluate_speaking(audio_key):
    wav = minio.get(audio_key) # webm -> wav 16k
    transcript = whisper.transcribe(wav, language="en", beam=5)
    # Metrics
    wpm = len(transcript.split()) / (duration_sec/60)
    filler_ratio = count_fillers(transcript)/len(transcript.split())
    # LLM rubric
    prompt = f"""
    Evaluate speaking: Fluency, Pronunciation(proxy via transcript coherence), Confidence, Grammar.
    Transcript: {transcript}
    WPM:{wpm:.1f}, fillers:{filler_ratio:.2f}
    Return JSON {{fluency(0-25), pronunciation(0-25), confidence(0-25), grammar(0-25), total, feedback}}
    """
    scores = json.loads(llm.generate(prompt, temp=0.2))
    return {"transcript":transcript, **scores, "wpm":wpm}
```

### 4.4 Debugging
```python
def evaluate_debugging(question, buggy_code, student_fix):
    # Static + dynamic
    tests_passed = sandbox.run(student_fix, question.hidden_tests) # e.g., 8 tests
    # LLM quality
    prompt = f"""
    Buggy: {buggy_code}
    Fix: {student_fix}
    Rate: Correctness(40), CodeQuality(30), Efficiency(30) = 100
    Return JSON.
    """
    llm_scores = json.loads(llm.generate(prompt))
    dynamic = tests_passed / len(question.hidden_tests) * 40
    # Fusion: dynamic 40 + llm quality 60
    total = dynamic + llm_scores.code_quality*0.3 + llm_scores.efficiency*0.3
    return {"total":int(total), "tests_passed":tests_passed, "llm":llm_scores}
```

### 4.5 Feature Development
```python
def evaluate_feature(spec, student_code):
    # Unit harness
    results = sandbox.run_feature_tests(student_code, spec.test_suite) # functional + edge + perf
    functional = results.passed / results.total
    prompt = f"Spec:{spec}\nCode:{student_code}\nRate Design(30), Completeness(40), EdgeHandling(30)"
    llm = json.loads(llm.generate(prompt))
    total = functional*40 + llm.design*0.3 + llm.edge*0.3 + (30 if functional>0.8 else 0)
    return {"total":int(total*1.0), "functional_rate":functional}
```

### 4.6 Prompt Engineering
```python
def evaluate_prompt(task, student_prompt, model_output_if_any):
    prompt = f"""
    Task: {task} (e.g., 'Summarize this research paper in 3 bullets for a CEO')
    StudentPrompt: {student_prompt}
    Rubric: Specificity(25), Context(25), Constraints(25), OutputQualityProxy(25)
    Return JSON.
    """
    return json.loads(llm.generate(prompt, temp=0.2))
```

### 4.7 Cognitive — Behavioral
```python
def evaluate_behavioral(scenarios_answers):
    # Each scenario maps to Big5 + workplace traits
    prompt = f"""
    Scenarios: {scenarios_answers}
    For each answer, map to: Adaptability, Teamwork, Accountability, DecisionMaking, LearningMindset, ResponsibleAI.
    Return {{adaptability, teamwork, accountability, decision_making, learning_mindset, responsible_ai}} 0-100 plus profile.
    """
    return json.loads(llm.generate(prompt))
```

---

## 5. Fusion — Weighted Scoring

See `SCORING.md` for final weights. Evaluation worker computes section scores then:

```python
def fuse(session_id):
    s = load_scores(session_id) # from rule + AI
    total = (
        s.english_total * 1.0 +
        s.problem_solving *1.0 +
        s.ai_debugging *1.0 +
        s.ai_feature *1.0 +
        s.prompt_engineering *1.0 +
        s.cognitive_total *1.0
    )
    # total already /1000 by design
    grade = "S" if total>=900 else "A" if total>=750 else "B" if total>=600 else "C" if total>=400 else "D"
    percentile = compute_percentile(total, cohort="global") # via ClickHouse approx
    verifiable_hash = sha256(f"{s.user_id}:{total}:{SALT}")
    upsert_calibiai(session_id, total, grade, percentile, verifiable_hash)
```

**Idempotency:** Worker checks `calibiai_scores` existence before compute; uses `INSERT ... ON CONFLICT DO NOTHING`.

**Failure handling:** If LLM timeout, retry 3x exponential; after 3 fails, mark `evaluation_failed` + alert, manual replay via admin API `POST /admin/evaluation/retry`.

---

## 6. Evaluation Cost at Scale

- Avg inference per submission: ~ 2k tokens input + 500 output across 6 LLM calls = ~12k tokens.
- At 1M submissions/day exam window: 12B tokens ~ 200 GPU-hours on A100 (vLLM batched). Fleet sized 50 A100s per region, autoscaled.
- Whisper: 60s audio ×1M = 16k GPU-hours (optimized with faster-whisper int8, 0.1 RTF -> actually 1.6k hrs).

All cost internal, no per-token SaaS margin.

---

## 7. Self-Training Loop (Defensible IP)

- All evaluation data (anonymized) -> owned dataset -> weekly LoRA fine-tune -> canary -> promote.
- Model improvements never leave platform; competitors can't replicate without data flywheel.
