import { getCompany } from './company/catalog.ts'
import { SECTION_BY_ID } from './company/sections.ts'
import type { SectionId } from './company/types.ts'

/** A score-backed skill observation; scores are always percentages (0–100). */
export interface AssessmentSkillEvidence {
  key: string
  name: string
  score: number
  source: string
  sourceType: 'platform' | 'company'
  assessedAt?: string | null
}

/** A canonical skill rolled up across the assessments that measured it. */
export interface AssessmentSkillRollup {
  key: string
  name: string
  score: number
  assessmentCount: number
  sources: string[]
}

interface SkillDefinition { key: string; name: string }

/** Map the bank's internal area ids to stable, candidate-facing skill names. */
const COMPANY_AREA_SKILLS: Partial<Record<SectionId, Record<string, SkillDefinition>>> = {
  s1: {
    quant: { key: 'quantitative-aptitude', name: 'Quantitative Aptitude' },
    reasoning: { key: 'logical-reasoning', name: 'Logical Reasoning' },
    verbal: { key: 'verbal-ability', name: 'Verbal Ability' },
    finance: { key: 'business-finance', name: 'Business & Financial Aptitude' },
  },
  s2: {
    concepts: { key: 'programming-fundamentals', name: 'Programming Fundamentals' },
    output: { key: 'code-tracing', name: 'Code Tracing & Pseudocode' },
  },
  s3: {
    concepts: { key: 'dsa-concepts', name: 'Data Structures & Algorithms' },
    analysis: { key: 'algorithm-analysis', name: 'Algorithm Analysis' },
    coding: { key: 'coding-problems', name: 'Coding Problems' },
  },
  s4: {
    os: { key: 'operating-systems', name: 'Operating Systems' },
    dbms: { key: 'dbms', name: 'Database Management (DBMS)' },
    cn: { key: 'computer-networks', name: 'Computer Networks' },
    oop: { key: 'oop', name: 'Object-Oriented Programming' },
    coa: { key: 'computer-architecture', name: 'Computer Architecture' },
    compilers: { key: 'compilers-runtimes', name: 'Compilers & Runtimes' },
  },
  s5: {
    query: { key: 'sql', name: 'SQL' },
    concepts: { key: 'database-concepts', name: 'Database Concepts' },
  },
  s6: {
    debugging: { key: 'code-debugging', name: 'Code Debugging' },
    prompting: { key: 'prompt-engineering', name: 'Prompt Engineering' },
    review: { key: 'ai-output-review', name: 'AI Output Review' },
  },
  s7: {
    http: { key: 'http-rest', name: 'HTTP & REST' },
    security: { key: 'web-security', name: 'Web Security' },
    frontend: { key: 'frontend-development', name: 'Frontend Development' },
    api: { key: 'api-design', name: 'API Design' },
  },
  s8: {
    principles: { key: 'design-principles', name: 'Software Design Principles' },
    patterns: { key: 'design-patterns', name: 'Design Patterns' },
    modeling: { key: 'object-modeling', name: 'Object Modelling' },
    'data-structures': { key: 'data-structures', name: 'Data Structures' },
  },
  s9: {
    scale: { key: 'scalable-system-design', name: 'Scalable System Design' },
    data: { key: 'system-data-storage', name: 'System Data & Storage' },
    messaging: { key: 'messaging-async', name: 'Messaging & Async Systems' },
    reliability: { key: 'system-reliability', name: 'System Reliability' },
    architecture: { key: 'system-architecture', name: 'System Architecture' },
  },
  s10: {
    testing: { key: 'software-testing', name: 'Software Testing' },
    process: { key: 'software-delivery', name: 'Software Delivery' },
    devops: { key: 'devops-cloud', name: 'DevOps & Cloud' },
  },
  s11: {
    behavioral: { key: 'behavioral-interviewing', name: 'Behavioural Interviewing' },
    technical: { key: 'technical-communication', name: 'Technical Communication' },
    communication: { key: 'written-communication', name: 'Written Communication' },
  },
}

const PLATFORM_SKILLS = {
  listening: { key: 'listening-comprehension', name: 'Listening Comprehension' },
  speaking: { key: 'spoken-communication', name: 'Spoken Communication' },
  reading: { key: 'reading-comprehension', name: 'Reading Comprehension' },
  writing: { key: 'written-communication', name: 'Written Communication' },
  problemSolving: { key: 'problem-solving', name: 'Problem Solving' },
  aiDebugging: { key: 'ai-debugging', name: 'AI-assisted Debugging' },
  aiFeature: { key: 'ai-feature-development', name: 'AI Feature Development' },
  promptEngineering: { key: 'prompt-engineering', name: 'Prompt Engineering' },
  visual: { key: 'visual-spatial-reasoning', name: 'Visual-spatial Reasoning' },
  logical: { key: 'logical-reasoning', name: 'Logical Reasoning' },
  aiLiteracy: { key: 'ai-literacy', name: 'AI Literacy' },
  debugConcepts: { key: 'code-debugging-concepts', name: 'Code Debugging Concepts' },
  practicalDebugging: { key: 'practical-code-debugging', name: 'Practical Code Debugging' },
  aiCoding: { key: 'ai-assisted-coding', name: 'AI-assisted Coding' },
} satisfies Record<string, SkillDefinition>

const TRAITS: Record<string, SkillDefinition> = {
  teamwork: { key: 'teamwork', name: 'Teamwork' },
  accountability: { key: 'accountability', name: 'Accountability' },
  adaptability: { key: 'adaptability', name: 'Adaptability' },
  responsible_ai: { key: 'responsible-ai', name: 'Responsible AI' },
  decision_making: { key: 'decision-making', name: 'Decision Making' },
  learning_mindset: { key: 'learning-mindset', name: 'Learning Mindset' },
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function addEvidence(
  out: AssessmentSkillEvidence[],
  skill: SkillDefinition,
  value: unknown,
  maximum: number,
  source: string,
  assessedAt?: string | null,
  sourceType: AssessmentSkillEvidence['sourceType'] = 'platform',
) {
  const score = numberOrNull(value)
  if (score === null || maximum <= 0) return
  out.push({
    ...skill,
    score: Math.round(Math.max(0, Math.min(100, (score / maximum) * 100)) * 10) / 10,
    source,
    sourceType,
    ...(assessedAt ? { assessedAt } : {}),
  })
}

function addEnglishEvidence(out: AssessmentSkillEvidence[], english: any, source: string, at?: string | null) {
  if (!english || typeof english !== 'object') return
  const parts = [
    ['listening', PLATFORM_SKILLS.listening],
    ['speaking', PLATFORM_SKILLS.speaking],
    ['reading', PLATFORM_SKILLS.reading],
    ['writing', PLATFORM_SKILLS.writing],
  ] as const
  const hasParts = parts.some(([field]) => numberOrNull(english[field]) !== null)
  if (hasParts) {
    for (const [field, skill] of parts) addEvidence(out, skill, english[field], 50, source, at)
  } else {
    addEvidence(out, { key: 'english-communication', name: 'English Communication' }, english.total, 200, source, at)
  }
}

function addCognitiveEvidence(out: AssessmentSkillEvidence[], cognitive: any, assessmentNo: 1 | 2, source: string, at?: string | null) {
  if (!cognitive || typeof cognitive !== 'object') return
  const gridMax = assessmentNo === 1 ? 30 : 40
  const logicalMax = assessmentNo === 1 ? 70 : 50
  const gridBefore = out.length
  addEvidence(out, PLATFORM_SKILLS.visual, cognitive.grid, gridMax, source, at)
  addEvidence(out, PLATFORM_SKILLS.logical, cognitive.logical, logicalMax, source, at)

  const traits = cognitive.behavioral && typeof cognitive.behavioral === 'object' ? cognitive.behavioral : {}
  let traitCount = 0
  for (const [key, skill] of Object.entries(TRAITS)) {
    const value = numberOrNull(traits[key])
    if (value === null) continue
    addEvidence(out, skill, value, 100, source, at)
    traitCount++
  }
  if (!traitCount) {
    const behavioralTotal = assessmentNo === 1 ? cognitive.behavioral_total : cognitive.behavioural
    addEvidence(out, { key: 'workplace-competencies', name: 'Workplace Competencies' }, behavioralTotal, assessmentNo === 1 ? 100 : 60, source, at)
  }
  if (out.length === gridBefore) {
    addEvidence(out, { key: 'cognitive-ability', name: 'Cognitive Ability' }, cognitive.total, cognitive.max || (assessmentNo === 1 ? 200 : 150), source, at)
  }
}

/** Map one stored/flattened platform assessment result to its assessed skills. */
export function platformAssessmentSkills(
  scores: any,
  assessmentNo: 1 | 2,
  assessedAt?: string | null,
): AssessmentSkillEvidence[] {
  if (!scores || typeof scores !== 'object') return []
  const source = assessmentNo === 1 ? 'CalibiAI Assessment' : 'Capgemini 2027 Mock'
  const at = assessedAt || scores.created_at || null
  const out: AssessmentSkillEvidence[] = []
  addEnglishEvidence(out, scores.english, source, at)

  if (assessmentNo === 1) {
    addEvidence(out, PLATFORM_SKILLS.problemSolving, scores.problem_solving, 200, source, at)
    addEvidence(out, PLATFORM_SKILLS.aiDebugging, scores.ai_debugging, 150, source, at)
    addEvidence(out, PLATFORM_SKILLS.aiFeature, scores.ai_feature, 150, source, at)
    addEvidence(out, PLATFORM_SKILLS.promptEngineering, scores.prompt_engineering, 100, source, at)
  } else {
    addEvidence(out, PLATFORM_SKILLS.aiLiteracy, scores.ai_literacy, 250, source, at)
    if (numberOrNull(scores.debug_mcq) !== null || numberOrNull(scores.debug_lab) !== null) {
      addEvidence(out, PLATFORM_SKILLS.debugConcepts, scores.debug_mcq, 120, source, at)
      addEvidence(out, PLATFORM_SKILLS.practicalDebugging, scores.debug_lab, 80, source, at)
    } else {
      addEvidence(out, { key: 'code-debugging', name: 'Code Debugging' }, scores.debugging_total, 200, source, at)
    }
    addEvidence(out, PLATFORM_SKILLS.aiCoding, scores.ai_coding, 200, source, at)
  }

  addCognitiveEvidence(out, scores.cognitive, assessmentNo, source, at)
  return out
}

function companySkillName(sectionValue: unknown, areaValue: unknown): SkillDefinition {
  const section = String(sectionValue || '') as SectionId
  const area = String(areaValue || 'general')
  const mapped = COMPANY_AREA_SKILLS[section]?.[area]
  if (mapped) return mapped
  const title = SECTION_BY_ID[section]?.title || 'Assessment Skill'
  return { key: `${section || 'unknown'}-${area}`, name: title }
}

/**
 * Map a persisted company result to safe section/area-level skill evidence.
 * Raw answers, item ids and MCQ correctness are deliberately not included.
 */
export function companyAssessmentSkills(result: any, companySlug: string, assessedAt?: string | null): AssessmentSkillEvidence[] {
  if (!result || typeof result !== 'object') return []
  const company = getCompany(companySlug)
  const source = company?.name || companySlug
  const at = assessedAt || result.gradedAt || null
  const bySkill = new Map<string, { skill: SkillDefinition; earned: number; possible: number }>()

  if (Array.isArray(result.areas)) {
    for (const area of result.areas) {
      const skill = companySkillName(area?.section, area?.area)
      const percent = numberOrNull(area?.percent)
      if (percent === null) continue
      const key = skill.key
      const current = bySkill.get(key) || { skill, earned: 0, possible: 0 }
      // Public area projections already contain the precise percentage.
      current.earned += percent
      current.possible += 100
      bySkill.set(key, current)
    }
  } else if (Array.isArray(result.items)) {
    for (const item of result.items) {
      if (!item || typeof item !== 'object') continue
      const skill = companySkillName(item.section, item.kind === 'coding' ? 'coding' : item.area)
      const possible = numberOrNull(item.marks) ?? 0
      if (possible <= 0) continue
      const earned = numberOrNull(item.earned) ?? 0
      const current = bySkill.get(skill.key) || { skill, earned: 0, possible: 0 }
      current.earned += earned
      current.possible += possible
      bySkill.set(skill.key, current)
    }
  } else if (Array.isArray(result.sections)) {
    for (const section of result.sections) {
      const skill = companySkillName(section?.section, 'general')
      const percent = numberOrNull(section?.percent)
      if (percent === null) continue
      bySkill.set(skill.key, { skill, earned: percent, possible: 100 })
    }
  }

  return [...bySkill.values()].map(({ skill, earned, possible }) => ({
    ...skill,
    score: Math.round(Math.max(0, Math.min(100, possible ? (earned / possible) * 100 : 0)) * 10) / 10,
    source,
    sourceType: 'company' as const,
    ...(at ? { assessedAt: at } : {}),
  }))
}

/** Merge repeated observations into one candidate-facing skill summary. */
export function rollupAssessmentSkills(evidence: AssessmentSkillEvidence[]): AssessmentSkillRollup[] {
  const byKey = new Map<string, { name: string; scoreTotal: number; count: number; sources: Set<string> }>()
  for (const item of evidence) {
    if (!item?.key || !item.name || !Number.isFinite(Number(item.score))) continue
    const current = byKey.get(item.key) || { name: item.name, scoreTotal: 0, count: 0, sources: new Set<string>() }
    current.scoreTotal += Math.max(0, Math.min(100, Number(item.score)))
    current.count++
    current.sources.add(item.source)
    byKey.set(item.key, current)
  }
  return [...byKey.entries()]
    .map(([key, value]) => ({
      key,
      name: value.name,
      score: Math.round((value.scoreTotal / value.count) * 10) / 10,
      assessmentCount: value.count,
      sources: [...value.sources],
    }))
    .sort((a, b) => b.assessmentCount - a.assessmentCount || b.score - a.score || a.name.localeCompare(b.name))
}

/** Public taxonomy accessor for coverage tests and other profile surfaces. */
export function companySkillForArea(section: SectionId, area: string): SkillDefinition {
  return companySkillName(section, area)
}
