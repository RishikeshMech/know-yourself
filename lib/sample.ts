// Static sample used by /sample-report ("See a sample report") so visitors can
// preview the CalibiAI Scorecard without taking the assessment. Shapes match
// lib/scoring.ts computeScores() output exactly, so the report renders the
// same way for real results and the sample.
export const SAMPLE_SCORES = {
  session_id: 'sample-report-2026',
  total: 842,
  grade: 'A',
  percentile: 92,
  verifiable_hash: 'sha256:9f4c2e8a71b6d3c05e8f2a7b91c4e6d8',
  english: { listening: 43, speaking: 41, reading: 45, writing: 43, total: 172, max: 200 },
  problem_solving: 168,
  ai_debugging: 132,
  ai_feature: 128,
  prompt_engineering: 88,
  cognitive: {
    grid: 24,
    logical: 52,
    cognitive_score: 76,
    behavioral_total: 78,
    total: 154,
    max: 200,
    behavioral: {
      teamwork: 74,
      accountability: 82,
      adaptability: 71,
      responsible_ai: 86,
      decision_making: 77,
      learning_mindset: 90,
    },
    traitLabels: {
      teamwork: 'Teamwork',
      accountability: 'Accountability',
      adaptability: 'Adaptability',
      responsible_ai: 'Responsible AI',
      decision_making: 'Decision Making',
      learning_mindset: 'Learning Mindset',
    },
  },
  detail: {
    listeningCorrect: 8,
    listeningTotal: 10,
    readingCorrect: 8,
    readingTotal: 9,
    problemCorrect: 17,
    problemTotal: 20,
    logicalCorrect: 10,
    logicalTotal: 12,
    speakingCount: 2,
  },
  ai_results: {
    WRITING: {
      score: 86,
      engine: 'deepseek',
      summary: 'Clear professional structure with a strong opening, specific client context and a well-scoped call to action.',
      rubric: { clarity: 88, structure: 90, grammar: 84, tone: 86, completeness: 82 },
      strengths: ['Strong client-first opening', 'Concise, actionable recommendations'],
      improvements: ['Add a measurable success metric', 'Tighten the closing paragraph'],
    },
    SP_speaking: {
      score: 82,
      engine: 'deepseek',
      summary: 'Confident delivery with good pacing; a few long pauses and filler words reduce fluency slightly.',
      rubric: { fluency: 80, pronunciation: 86, grammar: 82, confidence: 84, relevance: 90 },
      strengths: ['Clear articulation', 'Relevant, well-structured answer'],
      improvements: ['Reduce filler words ("um", "like")', 'Pause deliberately between ideas'],
    },
    AF1: {
      score: 84,
      engine: 'deepseek',
      summary: 'Produces correctly ordered middleware with sensible defaults and a clean retry/backoff approach.',
      rubric: { correctness: 88, design: 82, edge_cases: 80, testing: 78 },
      strengths: ['Handles the rate-limit window correctly', 'Readable, well-commented code'],
      improvements: ['Add tests for the 429 + Retry-After path', 'Extract magic numbers into constants'],
    },
    PE1: {
      score: 88,
      engine: 'deepseek',
      summary: 'Excellent prompt: explicit role, constraints, output format and evaluation criteria all present.',
      rubric: { role: 90, context: 85, constraints: 88, format: 92, specificity: 86 },
      strengths: ['Defines a clear output schema', 'Includes success criteria for self-checking'],
      improvements: ['Add an example input/output pair', 'Mention edge cases in the constraints'],
    },
  },
}

export const SAMPLE_PROFILE = {
  full_name: 'Priya Sharma',
  email: 'priya@iitm.ac.in',
  college: 'IIT Madras',
  degree: 'B.Tech — Computer Science',
  graduation_year: 2026,
  cgpa: 8.7,
  skills: 'Python, React, SQL',
}

export const SAMPLE_USER = {
  name: 'Priya Sharma',
  email: 'priya@iitm.ac.in',
}
