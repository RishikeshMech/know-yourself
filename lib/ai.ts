// Server-side AI evaluation layer.
// Uses DeepSeek (deepseek-chat) when DEEPSEEK_API_KEY is set; otherwise falls
// back to a deterministic rule-based heuristic so the flow always works.
// Never imported by client components directly — go through /api/ai/evaluate.

export type AiKind = 'writing' | 'speaking' | 'debugging' | 'feature' | 'prompt'

export interface AiEval {
  score: number                 // 0..100
  rubric: Record<string, number> // criterion -> 0..100
  strengths: string[]
  improvements: string[]
  summary: string
  engine: 'deepseek' | 'heuristic'
}

const DEEPSEEK_BASE = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat'

export function isDeepSeekConfigured(): boolean {
  return !!process.env.DEEPSEEK_API_KEY
}

function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, Math.round(n)))
}

// ---------------------------------------------------------------------------
// DeepSeek call
// ---------------------------------------------------------------------------
async function callDeepSeek(systemPrompt: string, userPrompt: string): Promise<any | null> {
  const key = process.env.DEEPSEEK_API_KEY
  if (!key) return null
  try {
    const res = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    })
    if (!res.ok) {
      console.error('DeepSeek error', res.status, await res.text().catch(() => ''))
      return null
    }
    const data = await res.json()
    const content: string = data?.choices?.[0]?.message?.content
    if (!content) return null
    return JSON.parse(content)
  } catch (e) {
    console.error('DeepSeek call failed', e)
    return null
  }
}

const JSON_CONTRACT = `Respond ONLY with a JSON object of exactly this shape:
{
  "score": <integer 0-100, overall>,
  "rubric": { "<criterion>": <integer 0-100>, ... },
  "strengths": ["<short bullet>", ...],
  "improvements": ["<short, actionable bullet>", ...],
  "summary": "<one sentence overall judgement>"
}
Be strict but fair. Do not inflate scores. Empty or trivial submissions must score below 40.`

// ---------------------------------------------------------------------------
// Per-kind evaluation
// ---------------------------------------------------------------------------
export async function evaluateWriting(text: string, scenario: string): Promise<AiEval> {
  const sys = `You are an expert IELTS/Cambridge-certified English assessor for a graduate hiring assessment.
Evaluate the candidate's email against the scenario on four criteria, each 0-100:
clarity, grammar, structure, professional_tone. Also judge whether it addresses impact, mitigation and a revised timeline.
${JSON_CONTRACT}`
  const ai = await callDeepSeek(sys, `Scenario:\n${scenario}\n\nCandidate's email:\n"""\n${text}\n"""`)
  if (ai) return normalize(ai, 'deepseek', ['clarity', 'grammar', 'structure', 'professional_tone'])

  // heuristic fallback
  const words = (text.trim().match(/\S+/g) || []).length
  const clarity = words >= 150 && words <= 300 ? 82 : words >= 90 ? 70 : words > 0 ? 52 : 20
  const grammar = text.length ? clamp(60 + Math.min(25, words / 10)) : 15
  const structure = /dear|hi|hello|regards|sincerely|thanks/i.test(text) ? 80 : text.length > 200 ? 66 : 45
  const tone = /please|thank|apolog|regret|understand|committed/i.test(text) ? 82 : 55
  return {
    score: avg([clarity, grammar, structure, tone]),
    rubric: { clarity, grammar, structure, professional_tone: tone },
    strengths: words >= 150 ? ['Meets the target length (150–300 words)'] : ['Attempts a professional response'],
    improvements: words < 150 ? ['Expand to 150–300 words covering impact, mitigation and timeline'] : ['Tighten tone and proofread for grammar'],
    summary: 'Rule-based evaluation (connect DeepSeek for full AI grading).',
    engine: 'heuristic',
  }
}

export async function evaluateSpeaking(_transcript: string | null, recordingCount: number): Promise<AiEval> {
  // Production pipeline: recorded webm -> self-hosted Whisper transcript ->
  // DeepSeek rubric. Without a transcript we score on submission evidence.
  if (!recordingCount) {
    return {
      score: 0, rubric: { fluency: 0, pronunciation: 0, confidence: 0, grammar: 0 },
      strengths: [], improvements: ['Record both speaking tasks'], summary: 'No recording submitted.',
      engine: 'heuristic',
    }
  }
  const base = recordingCount >= 2 ? 80 : 66
  const rubric = {
    fluency: clamp(base + 4), pronunciation: clamp(base - 2),
    confidence: clamp(base + 2), grammar: clamp(base - 1),
  }
  return {
    score: avg(Object.values(rubric)),
    rubric,
    strengths: recordingCount >= 2 ? ['Both speaking tasks recorded and uploaded'] : ['One speaking task recorded'],
    improvements: ['Speak for the full 60–90 seconds', 'Structure answers: situation → action → result'],
    summary: 'Recording captured. In production, Whisper transcribes it and DeepSeek grades the transcript (heuristic score shown).',
    engine: 'heuristic',
  }
}

export async function evaluateDebugging(taskId: string, buggy: string, prompt: string, fix: string): Promise<AiEval> {
  const sys = `You are a senior software engineer grading an "AI-assisted debugging" task in a hiring assessment.
The candidate was given buggy code and asked to fix it (they may use AI). Grade 0-100 on:
correctness (does the fix actually solve the bug), root_cause_understanding, edge_cases, code_quality, test_awareness.
Inspect the submitted code carefully; partial fixes get partial credit.
${JSON_CONTRACT}`
  const ai = await callDeepSeek(sys, `Task id: ${taskId}\n\nBuggy code:\n"""\n${buggy}\n"""\n\nRequirement:\n${prompt}\n\nCandidate's fixed code:\n"""\n${fix}\n"""`)
  if (ai) return normalize(ai, 'deepseek', ['correctness', 'root_cause_understanding', 'edge_cases', 'code_quality', 'test_awareness'])

  const f = fix.toLowerCase()
  let correctness = 30
  if (taskId === 'AD1' && /page\s*-\s*1|page\s*-\s*size|max\(0/.test(f) && /size\s*<=?\s*0|page\s*<\s*1|isinstance|int\(/.test(f)) correctness = 88
  else if (taskId === 'AD1' && /page\s*-\s*1/.test(f)) correctness = 70
  if (taskId === 'AD2' && /promise|inflight|in-flight|pending/.test(f)) correctness = 85
  if (taskId === 'AD3' && /\[.*for.*in.*if.*active|not u\[|reversed|copy\(|\[:\]/.test(f)) correctness = 84
  if (fix.trim().length < 25) correctness = 25
  const rubric = {
    correctness,
    root_cause_understanding: clamp(correctness - 6),
    edge_cases: clamp(correctness - 12 + (/(edge|invalid|negative|beyond|empty|retry|fail)/.test(f) ? 10 : 0)),
    code_quality: clamp(55 + Math.min(30, fix.length / 12)),
    test_awareness: /test|assert|pytest|console\.log/.test(f) ? 72 : 48,
  }
  return {
    score: avg(Object.values(rubric)),
    rubric,
    strengths: correctness >= 70 ? ['Core bug appears fixed'] : ['A fix was attempted'],
    improvements: ['Add explicit handling for invalid inputs and boundary cases', 'Include tests proving the fix'],
    summary: 'Rule-based static heuristic (connect DeepSeek for semantic grading of the fix).',
    engine: 'heuristic',
  }
}

export async function evaluateFeature(spec: string, code: string): Promise<AiEval> {
  const sys = `You are a staff engineer grading an "AI-assisted feature development" task in a hiring assessment.
Grade the candidate's implementation against the spec, 0-100 on:
requirement_understanding, functional_correctness, edge_cases, code_quality, api_integration (the Express middleware / 429 + Retry-After wiring).
Working, complete implementations score 75-95; stubs or partial logic score lower.
${JSON_CONTRACT}`
  const ai = await callDeepSeek(sys, `Spec:\n${spec}\n\nCandidate's implementation:\n"""\n${code}\n"""`)
  if (ai) return normalize(ai, 'deepseek', ['requirement_understanding', 'functional_correctness', 'edge_cases', 'code_quality', 'api_integration'])

  const c = code.toLowerCase()
  let functional = /isallowed|is_allowed/.test(c) ? 62 : 30
  if (/filter|timestamp|date\.now|performance\.now/.test(c)) functional += 18
  if (/429|retry-after|retryafter|middleware/.test(c)) functional += 12
  functional = clamp(functional)
  const rubric = {
    requirement_understanding: clamp(functional + 4),
    functional_correctness: functional,
    edge_cases: clamp(functional - 14 + (/clean|prune|shift|splice|delete/.test(c) ? 8 : 0)),
    code_quality: clamp(50 + Math.min(35, code.length / 14)),
    api_integration: /429|retry-after|app\.(use|get|post)|middleware/.test(c) ? 80 : 40,
  }
  return {
    score: avg(Object.values(rubric)),
    rubric,
    strengths: functional >= 75 ? ['Sliding-window logic and HTTP wiring present'] : ['Attempts the limiter logic'],
    improvements: ['Wire the 429 response with a Retry-After header in middleware', 'Add tests for window expiry and concurrent calls'],
    summary: 'Rule-based static heuristic (connect DeepSeek for semantic grading).',
    engine: 'heuristic',
  }
}

export async function evaluatePrompt(task: string, hint: string, prompt: string): Promise<AiEval> {
  const sys = `You are an expert prompt engineer grading a "prompt engineering" hiring task.
Grade the candidate's prompt 0-100 on: role_definition, context, constraints, output_format, specificity, task_decomposition.
A strong prompt names a role, gives context/audience, states constraints, pins the output format, and prevents hallucination.
${JSON_CONTRACT}`
  const ai = await callDeepSeek(sys, `Task:\n${task}\n\nHint: ${hint}\n\nCandidate's prompt:\n"""\n${prompt}\n"""`)
  if (ai) return normalize(ai, 'deepseek', ['role_definition', 'context', 'constraints', 'output_format', 'specificity', 'task_decomposition'])

  const p = prompt.toLowerCase()
  const rubric = {
    role_definition: /act as|you are|role|as an? /.test(p) ? 85 : 45,
    context: /audience|ceo|context|background|given|scenario/.test(p) ? 78 : 50,
    constraints: /constraint|limit|must|only|without|no more than|under \d|memory/.test(p) ? 80 : 45,
    output_format: /json|format|bullet|table|exactly \d|fields?|return/.test(p) ? 82 : 40,
    specificity: prompt.length > 180 ? 80 : prompt.length > 90 ? 62 : 35,
    task_decomposition: /step|first|then|finally|break down|numbered/.test(p) ? 74 : 48,
  }
  return {
    score: avg(Object.values(rubric)),
    rubric,
    strengths: ['Prompt includes several effective elements'],
    improvements: ['Pin the exact output format (e.g. strict JSON)', 'Add explicit constraints and a hallucination guardrail'],
    summary: 'Rule-based rubric heuristic (connect DeepSeek for semantic grading).',
    engine: 'heuristic',
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function avg(nums: number[]) {
  return clamp(nums.reduce((a, b) => a + b, 0) / Math.max(1, nums.length))
}

function normalize(ai: any, engine: AiEval['engine'], criteria: string[]): AiEval {
  const rubric: Record<string, number> = {}
  criteria.forEach((c) => {
    rubric[c] = clamp(Number(ai?.rubric?.[c] ?? ai?.rubric?.[c.toLowerCase()] ?? 60))
  })
  const score = clamp(Number(ai?.score ?? avg(Object.values(rubric))))
  return {
    score,
    rubric,
    strengths: Array.isArray(ai?.strengths) ? ai.strengths.slice(0, 5).map(String) : [],
    improvements: Array.isArray(ai?.improvements) ? ai.improvements.slice(0, 5).map(String) : [],
    summary: String(ai?.summary || 'AI evaluation complete.'),
    engine,
  }
}
