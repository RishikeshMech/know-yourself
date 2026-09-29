/**
 * Round blueprints for the company mock assessments.
 *
 * Each blueprint turns a hiring flow from "Ques/50 Companies Steps Assessment
 * Research.docx" into rounds. A round simulates one assessable step (the
 * `step` number refers to that company's step list) and draws questions from
 * the master-bank sections that step describes — e.g. TCS "Step 2: Foundation
 * Assessment — Numerical, Verbal and Reasoning Ability" → Section 1 by area.
 * Eligibility and final-selection steps are informational, never scored.
 *
 * Client-safe: blueprints reference sections/areas/counts only, never
 * questions. Every blueprint is proven satisfiable against the bank by
 * lib/__tests__/companyPaper.test.ts.
 */
import type { Blueprint, DifficultyMix, PartSpec, RoundSpec } from './types.ts'

const MIX = {
  foundation: { easy: 0.45, medium: 0.4, hard: 0.15 },
  service: { easy: 0.35, medium: 0.45, hard: 0.2 },
  balanced: { easy: 0.3, medium: 0.4, hard: 0.3 },
  product: { easy: 0.15, medium: 0.45, hard: 0.4 },
  advanced: { easy: 0.05, medium: 0.4, hard: 0.55 },
  /** DSA MCQs for product / big-tech style online assessments. */
  dsa: { easy: 0.05, medium: 0.35, hard: 0.6 },
  /** DSA MCQs for service-company technical rounds. */
  dsaService: { easy: 0.15, medium: 0.45, hard: 0.4 },
} satisfies Record<string, DifficultyMix>

// Coding rounds are LeetCode medium/hard only — there are no warm-up problems
// in the pool, and every problem carries stress tests with time limits.
const CODE_ENTRY: DifficultyMix = { easy: 0, medium: 0.8, hard: 0.2 }
const CODE_SERVICE: DifficultyMix = { easy: 0, medium: 0.6, hard: 0.4 }
const CODE_MEDIUM: DifficultyMix = { easy: 0, medium: 0.5, hard: 0.5 }
const CODE_PRODUCT: DifficultyMix = { easy: 0, medium: 0.3, hard: 0.7 }

const mcq = (label: string, sections: PartSpec['sections'], count: number, mix: DifficultyMix, extra: Partial<PartSpec> = {}): PartSpec =>
  ({ kind: 'mcq', label, sections, count, mix, ...extra })
const written = (label: string, sections: PartSpec['sections'], mix: DifficultyMix, extra: Partial<PartSpec> = {}): PartSpec =>
  ({ kind: 'written', label, sections, count: 1, mix, ...extra })
const coding = (count: number, mix: DifficultyMix, label = 'Coding'): PartSpec =>
  ({ kind: 'coding', label, sections: ['s3'], count, mix })

const round = (r: RoundSpec): RoundSpec => r

/* Shared rounds ------------------------------------------------------ */

const hrRound = (step: number, minutes: number, weight: number, label = 'HR / Managerial Discussion'): RoundSpec => round({
  id: 'hr', label, step, minutes, weight,
  about: 'A written behavioural answer, graded on structure (situation → action → result), ownership and communication.',
  parts: [written('Behavioural question', ['s11'], MIX.balanced, { areas: ['behavioral'] })],
})

const BLUEPRINTS_LIST: Blueprint[] = [
  /* ----------------------------- IT services ---------------------------- */
  {
    id: 'tcs', label: 'TCS NQT pattern',
    rounds: [
      round({
        id: 'foundation', label: 'Foundation Assessment', step: 2, minutes: 35, weight: 35, cutoff: 50,
        about: 'Numerical, verbal and reasoning ability — the TCS NQT foundation section.',
        parts: [
          mcq('Numerical Ability', ['s1'], 10, MIX.foundation, { areas: ['quant'] }),
          mcq('Verbal Ability', ['s1'], 8, MIX.foundation, { areas: ['verbal'] }),
          mcq('Reasoning Ability', ['s1'], 10, MIX.foundation, { areas: ['reasoning'] }),
        ],
      }),
      round({
        id: 'advanced', label: 'Advanced Assessment', step: 3, minutes: 35, weight: 30, cutoff: 40,
        about: 'Advanced quantitative & reasoning ability plus an advanced coding problem (Digital / Prime track).',
        parts: [
          mcq('Advanced Quantitative & Reasoning', ['s1'], 6, MIX.advanced, { areas: ['quant', 'reasoning'] }),
          coding(1, CODE_MEDIUM, 'Advanced Coding'),
        ],
      }),
      round({
        id: 'technical', label: 'Technical Interview', step: 4, minutes: 20, weight: 25,
        about: 'Programming, OOP, DBMS, operating systems and networks — as asked in the TCS technical interview.',
        parts: [
          mcq('CS Fundamentals', ['s4'], 5, MIX.balanced),
          mcq('Programming & OOP', ['s2'], 3, MIX.balanced),
          written('Explain a concept', ['s4'], MIX.service),
        ],
      }),
      hrRound(5, 10, 10),
    ],
  },
  {
    id: 'infosys', label: 'Infosys online assessment pattern',
    rounds: [
      round({
        id: 'online', label: 'Online Assessment', step: 2, minutes: 40, weight: 35, cutoff: 50,
        about: 'Reasoning, mathematical ability, verbal ability and pseudocode.',
        parts: [
          mcq('Logical Reasoning', ['s1'], 8, MIX.service, { areas: ['reasoning'] }),
          mcq('Mathematical Ability', ['s1'], 6, MIX.service, { areas: ['quant'] }),
          mcq('Verbal Ability', ['s1'], 8, MIX.service, { areas: ['verbal'] }),
          mcq('Pseudocode', ['s2'], 5, MIX.balanced, { areas: ['output'] }),
        ],
      }),
      round({
        id: 'coding', label: 'Track-Specific Coding', step: 3, minutes: 35, weight: 30, cutoff: 40,
        about: 'Two coding problems — the DSE / Specialist Programmer style coding round.',
        parts: [coding(2, CODE_SERVICE)],
      }),
      round({
        id: 'technical', label: 'Technical Interview', step: 4, minutes: 17, weight: 25,
        about: 'OOP, DBMS and SQL questions from the Infosys technical interview.',
        parts: [
          mcq('OOP & DBMS', ['s4'], 3, MIX.balanced, { areas: ['oop', 'dbms'] }),
          mcq('SQL', ['s5'], 3, MIX.balanced),
          written('Explain or write SQL', ['s5'], MIX.service),
        ],
      }),
      hrRound(5, 8, 10, 'HR Interview'),
    ],
  },
  {
    id: 'wipro', label: 'Wipro NLTH pattern',
    rounds: [
      round({
        id: 'aptitude', label: 'Aptitude Assessment', step: 2, minutes: 32, weight: 30, cutoff: 50,
        about: 'Quantitative aptitude, logical reasoning and verbal ability.',
        parts: [
          mcq('Quantitative Aptitude', ['s1'], 8, MIX.service, { areas: ['quant'] }),
          mcq('Logical Reasoning', ['s1'], 8, MIX.service, { areas: ['reasoning'] }),
          mcq('Verbal Ability', ['s1'], 8, MIX.service, { areas: ['verbal'] }),
        ],
      }),
      round({
        id: 'writing', label: 'Written Communication', step: 3, minutes: 15, weight: 15,
        about: 'An essay graded on structure, argument and language.',
        parts: [written('Essay', ['s11'], MIX.balanced, { areas: ['communication'], topics: ['Essay Writing'] })],
      }),
      round({
        id: 'coding', label: 'Coding Assessment', step: 4, minutes: 35, weight: 30, cutoff: 40,
        about: 'Two coding problems in Python or JavaScript.',
        parts: [coding(2, CODE_SERVICE)],
      }),
      round({
        id: 'technical', label: 'Technical Interview', step: 5, minutes: 12, weight: 17,
        about: 'OOP, DBMS, SQL and operating systems.',
        parts: [
          mcq('Technical concepts', ['s4', 's5', 's2'], 5, MIX.balanced),
          written('Explain a concept', ['s4'], MIX.service),
        ],
      }),
      hrRound(6, 6, 8, 'HR Interview'),
    ],
  },
  {
    id: 'cognizant', label: 'Cognizant GenC pattern',
    rounds: [
      round({
        id: 'aptitude', label: 'Aptitude / Cognitive Assessment', step: 2, minutes: 30, weight: 30, cutoff: 50,
        about: 'Numerical ability, logical reasoning and verbal ability.',
        parts: [
          mcq('Numerical Ability', ['s1'], 8, MIX.service, { areas: ['quant'] }),
          mcq('Logical Reasoning', ['s1'], 8, MIX.service, { areas: ['reasoning'] }),
          mcq('Verbal Ability', ['s1'], 4, MIX.service, { areas: ['verbal'] }),
        ],
      }),
      round({
        id: 'communication', label: 'Communication Assessment', step: 3, minutes: 15, weight: 15,
        about: 'Grammar, vocabulary and comprehension plus a professional email.',
        parts: [
          mcq('Grammar & comprehension', ['s1'], 6, MIX.service, { areas: ['verbal'] }),
          written('Email writing', ['s11'], MIX.service, { areas: ['communication'], topics: ['Email Writing', 'Workplace Writing'] }),
        ],
      }),
      round({
        id: 'coding', label: 'Coding Assessment', step: 4, minutes: 35, weight: 30, cutoff: 40,
        about: 'Two coding problems (GenC Next level).',
        parts: [coding(2, CODE_SERVICE)],
      }),
      round({
        id: 'technical', label: 'Technical Interview', step: 5, minutes: 12, weight: 17,
        about: 'Programming, DBMS, SQL and cloud/DevOps basics.',
        parts: [
          mcq('Technical concepts', ['s4', 's5', 's10'], 5, MIX.balanced),
          written('Explain a concept', ['s4', 's5'], MIX.service),
        ],
      }),
      hrRound(6, 8, 8, 'HR / Behavioural Round'),
    ],
  },
  {
    id: 'accenture', label: 'Accenture ASE pattern',
    rounds: [
      round({
        id: 'cognitive', label: 'Cognitive and Technical Assessment', step: 2, minutes: 35, weight: 35, cutoff: 50,
        about: 'Critical reasoning, numerical and verbal ability, plus networking/cloud concepts and pseudocode.',
        parts: [
          mcq('Numerical Ability', ['s1'], 5, MIX.service, { areas: ['quant'] }),
          mcq('Critical Reasoning', ['s1'], 6, MIX.service, { areas: ['reasoning'] }),
          mcq('Verbal Ability', ['s1'], 5, MIX.service, { areas: ['verbal'] }),
          mcq('Networking, Cloud & Security', ['s4', 's10'], 5, MIX.balanced, { areas: ['cn', 'os', 'devops'] }),
          mcq('Pseudocode', ['s2'], 3, MIX.balanced, { areas: ['output'] }),
        ],
      }),
      round({
        id: 'communication', label: 'Communication Assessment', step: 3, minutes: 12, weight: 12,
        about: 'Grammar and comprehension plus a short professional email.',
        parts: [
          mcq('Grammar & comprehension', ['s1'], 5, MIX.service, { areas: ['verbal'] }),
          written('Email writing', ['s11'], MIX.service, { areas: ['communication'], topics: ['Email Writing'] }),
        ],
      }),
      round({
        id: 'coding', label: 'Coding / Problem-Solving', step: 4, minutes: 30, weight: 30, cutoff: 40,
        about: 'Two coding problems.',
        parts: [coding(2, CODE_ENTRY)],
      }),
      round({
        id: 'technical', label: 'Technical Interview', step: 5, minutes: 15, weight: 15,
        about: 'Programming, OOP, DBMS, SQL and basic networking.',
        parts: [
          mcq('Technical concepts', ['s4', 's5'], 4, MIX.balanced),
          written('Explain a concept', ['s4', 's5'], MIX.service),
        ],
      }),
      hrRound(6, 8, 8, 'HR / Communication Interview'),
    ],
  },
  {
    id: 'service', label: 'IT services campus pattern',
    rounds: [
      round({
        id: 'aptitude', label: 'Online Aptitude Assessment', step: 2, minutes: 30, weight: 30, cutoff: 50,
        about: 'Quantitative aptitude, logical reasoning and verbal ability.',
        parts: [
          mcq('Quantitative Aptitude', ['s1'], 8, MIX.service, { areas: ['quant'] }),
          mcq('Logical Reasoning', ['s1'], 8, MIX.service, { areas: ['reasoning'] }),
          mcq('Verbal Ability', ['s1'], 6, MIX.service, { areas: ['verbal'] }),
        ],
      }),
      round({
        id: 'technical-mcq', label: 'Technical & Pseudocode Assessment', step: 3, minutes: 20, weight: 20,
        about: 'Pseudocode, programming fundamentals, CS fundamentals and SQL.',
        parts: [
          mcq('Pseudocode & output', ['s2'], 5, MIX.balanced, { areas: ['output'] }),
          mcq('CS fundamentals & SQL', ['s4', 's5', 's2'], 7, MIX.balanced),
        ],
      }),
      round({
        id: 'coding', label: 'Coding Assessment', step: 4, minutes: 30, weight: 25, cutoff: 40,
        about: 'Two coding problems.',
        parts: [coding(2, CODE_SERVICE)],
      }),
      round({
        id: 'technical', label: 'Technical Interview', step: 5, minutes: 12, weight: 17,
        about: 'Projects, OOP, DBMS and SDLC concepts.',
        parts: [
          mcq('Technical concepts', ['s4', 's10'], 3, MIX.balanced),
          written('Explain a concept', ['s4', 's10'], MIX.service),
        ],
      }),
      hrRound(6, 8, 8, 'HR Interview'),
    ],
  },
  {
    id: 'service-digital', label: 'IT services digital-track pattern',
    rounds: [
      round({
        id: 'aptitude', label: 'Online Aptitude Assessment', step: 2, minutes: 25, weight: 25, cutoff: 50,
        about: 'Quantitative aptitude, logical reasoning and verbal ability at a digital-track level.',
        parts: [
          mcq('Quantitative Aptitude', ['s1'], 7, MIX.balanced, { areas: ['quant'] }),
          mcq('Logical Reasoning', ['s1'], 7, MIX.balanced, { areas: ['reasoning'] }),
          mcq('Verbal Ability', ['s1'], 5, MIX.balanced, { areas: ['verbal'] }),
        ],
      }),
      round({
        id: 'technical-mcq', label: 'Technical & Pseudocode Assessment', step: 3, minutes: 22, weight: 20,
        about: 'Programming output, DSA, CS fundamentals, web and cloud basics.',
        parts: [
          mcq('Programming & DSA', ['s2', 's3'], 6, MIX.dsaService),
          mcq('CS, Web & Cloud', ['s4', 's7', 's10'], 6, MIX.balanced),
        ],
      }),
      round({
        id: 'coding', label: 'Coding Assessment', step: 4, minutes: 35, weight: 30, cutoff: 40,
        about: 'Two coding problems at a digital / specialist level.',
        parts: [coding(2, CODE_MEDIUM)],
      }),
      round({
        id: 'technical', label: 'Technical Interview', step: 5, minutes: 12, weight: 17,
        about: 'Architecture, databases and engineering practices.',
        parts: [
          mcq('Technical concepts', ['s5', 's8', 's10'], 3, MIX.balanced),
          written('Discuss a technical topic', ['s4', 's7', 's10'], MIX.balanced),
        ],
      }),
      hrRound(6, 6, 8, 'HR Interview'),
    ],
  },

  /* ------------------------------ Product ------------------------------- */
  {
    id: 'product', label: 'Product company pattern',
    rounds: [
      round({
        id: 'oa', label: 'Online Assessment', step: 2, minutes: 50, weight: 40, cutoff: 40,
        about: 'DSA and CS-fundamentals MCQs plus two timed coding problems.',
        parts: [
          mcq('Data Structures & Algorithms', ['s3'], 6, MIX.dsa),
          mcq('CS Fundamentals', ['s4'], 3, MIX.product),
          coding(2, CODE_PRODUCT),
        ],
      }),
      round({
        id: 'screening', label: 'Technical Screening', step: 3, minutes: 15, weight: 15,
        about: 'Rapid-fire code tracing and complexity reasoning, as in a first technical call.',
        parts: [
          mcq('Complexity & tracing', ['s3'], 3, MIX.dsa, { areas: ['analysis'] }),
          mcq('Code output', ['s2'], 3, MIX.product, { areas: ['output'] }),
        ],
      }),
      round({
        id: 'interviews', label: 'Technical Interviews', step: 4, minutes: 20, weight: 20,
        about: 'OOP, DBMS, operating systems and networking depth.',
        parts: [
          mcq('CS depth', ['s4'], 5, MIX.product),
          mcq('Programming concepts', ['s2'], 2, MIX.product, { areas: ['concepts'] }),
          written('Explain in depth', ['s4'], MIX.product),
        ],
      }),
      round({
        id: 'design', label: 'Design Round', step: 5, minutes: 22, weight: 15,
        about: 'Low-level and high-level design trade-offs.',
        parts: [
          mcq('LLD', ['s8'], 2, MIX.product),
          mcq('System design', ['s9'], 3, MIX.product),
          written('Design question', ['s9', 's8'], MIX.product),
        ],
      }),
      hrRound(6, 13, 10, 'Behavioural / Hiring Manager Round'),
    ],
  },
  {
    id: 'product-lp', label: 'Product pattern with leadership-principles focus',
    rounds: [
      round({
        id: 'oa', label: 'Online Assessment', step: 2, minutes: 50, weight: 35, cutoff: 40,
        about: 'DSA MCQs plus two coding problems, followed by work-style judgement in later rounds.',
        parts: [
          mcq('Data Structures & Algorithms', ['s3'], 6, MIX.dsa),
          mcq('Debugging judgement', ['s6'], 3, MIX.product, { areas: ['debugging', 'review'] }),
          coding(2, CODE_PRODUCT),
        ],
      }),
      round({
        id: 'screening', label: 'Technical Screening', step: 3, minutes: 15, weight: 15,
        about: 'Code tracing and complexity reasoning.',
        parts: [
          mcq('Complexity & tracing', ['s3'], 3, MIX.dsa, { areas: ['analysis'] }),
          mcq('Code output', ['s2'], 3, MIX.product, { areas: ['output'] }),
        ],
      }),
      round({
        id: 'interviews', label: 'Technical Interviews', step: 4, minutes: 18, weight: 20,
        about: 'CS fundamentals depth.',
        parts: [
          mcq('CS depth', ['s4'], 5, MIX.product),
          written('Explain in depth', ['s4'], MIX.product),
        ],
      }),
      round({
        id: 'design', label: 'Design Round', step: 5, minutes: 17, weight: 15,
        about: 'System design trade-offs.',
        parts: [
          mcq('System design', ['s9'], 3, MIX.product),
          written('Design question', ['s9'], MIX.product),
        ],
      }),
      round({
        id: 'hr', label: 'Behavioural / Hiring Manager Round', step: 6, minutes: 20, weight: 15,
        about: 'Two leadership-principle style stories: ownership, customer obsession, dive deep, bias for action.',
        parts: [
          written('Leadership story', ['s11'], MIX.balanced, { areas: ['behavioral'] }),
          written('Technical ownership story', ['s11'], MIX.balanced, { areas: ['technical'] }),
        ],
      }),
    ],
  },
  {
    id: 'product-systems', label: 'Systems / hardware-software product pattern',
    rounds: [
      round({
        id: 'oa', label: 'Online Assessment', step: 2, minutes: 45, weight: 40, cutoff: 40,
        about: 'C-level programming output, OS/architecture concepts, DSA and one coding problem.',
        parts: [
          mcq('DSA', ['s3'], 4, MIX.dsa),
          mcq('C & code output', ['s2'], 4, MIX.product, { areas: ['output'] }),
          mcq('OS & computer organisation', ['s4'], 3, MIX.product, { areas: ['os', 'coa'] }),
          coding(1, CODE_PRODUCT),
        ],
      }),
      round({
        id: 'screening', label: 'Technical Screening', step: 3, minutes: 15, weight: 15,
        about: 'Operating systems, networking and architecture fundamentals.',
        parts: [
          mcq('Systems fundamentals', ['s4'], 5, MIX.product, { areas: ['os', 'cn', 'coa'] }),
          mcq('Complexity & tracing', ['s3'], 2, MIX.dsa, { areas: ['analysis'] }),
        ],
      }),
      round({
        id: 'interviews', label: 'Technical Interviews', step: 4, minutes: 20, weight: 20,
        about: 'Concurrency, memory, compilers and language semantics.',
        parts: [
          mcq('Systems depth', ['s4'], 4, MIX.product, { areas: ['os', 'compilers', 'coa'] }),
          mcq('Language semantics', ['s2'], 2, MIX.product, { areas: ['concepts'] }),
          written('Explain in depth', ['s4'], MIX.product, { areas: ['os', 'compilers', 'coa'] }),
        ],
      }),
      round({
        id: 'design', label: 'Design Round', step: 5, minutes: 20, weight: 15,
        about: 'Object-oriented and system design.',
        parts: [
          mcq('Design', ['s8', 's9'], 4, MIX.product),
          written('Design question', ['s8', 's9'], MIX.product),
        ],
      }),
      hrRound(6, 10, 10, 'Behavioural / Hiring Manager Round'),
    ],
  },
  {
    id: 'product-enterprise', label: 'Enterprise software pattern',
    rounds: [
      round({
        id: 'oa', label: 'Online Assessment', step: 2, minutes: 50, weight: 40, cutoff: 40,
        about: 'DSA and SQL MCQs plus two coding problems.',
        parts: [
          mcq('DSA', ['s3'], 5, MIX.dsaService),
          mcq('SQL & databases', ['s5'], 3, MIX.balanced),
          coding(2, CODE_MEDIUM),
        ],
      }),
      round({
        id: 'screening', label: 'Technical Screening', step: 3, minutes: 15, weight: 15,
        about: 'Programming output and SQL query reasoning.',
        parts: [
          mcq('Code output', ['s2'], 3, MIX.balanced, { areas: ['output'] }),
          mcq('SQL queries', ['s5'], 3, MIX.balanced, { areas: ['query'] }),
        ],
      }),
      round({
        id: 'interviews', label: 'Technical Interviews', step: 4, minutes: 20, weight: 20,
        about: 'CS fundamentals, web APIs and databases.',
        parts: [
          mcq('CS & web', ['s4', 's7'], 6, MIX.balanced),
          written('Explain in depth', ['s5', 's7'], MIX.balanced),
        ],
      }),
      round({
        id: 'design', label: 'Design Round', step: 5, minutes: 20, weight: 15,
        about: 'Object-oriented and system design.',
        parts: [
          mcq('Design', ['s8', 's9'], 4, MIX.balanced),
          written('Design question', ['s8', 's9'], MIX.balanced),
        ],
      }),
      hrRound(6, 10, 10, 'Behavioural / Hiring Manager Round'),
    ],
  },
  {
    id: 'product-devtools', label: 'Developer-tools product pattern',
    rounds: [
      round({
        id: 'oa', label: 'Online Assessment', step: 2, minutes: 45, weight: 40, cutoff: 40,
        about: 'DSA and API MCQs plus two coding problems.',
        parts: [
          mcq('DSA', ['s3'], 4, MIX.dsaService),
          mcq('HTTP & APIs', ['s7'], 3, MIX.balanced),
          coding(2, CODE_MEDIUM),
        ],
      }),
      round({
        id: 'screening', label: 'Technical Screening', step: 3, minutes: 15, weight: 15,
        about: 'Debugging AI-generated and hand-written code.',
        parts: [
          mcq('Debugging', ['s6'], 3, MIX.balanced),
          mcq('Code output', ['s2'], 3, MIX.balanced, { areas: ['output'] }),
        ],
      }),
      round({
        id: 'interviews', label: 'Technical Interviews', step: 4, minutes: 20, weight: 20,
        about: 'APIs, testing and delivery practices.',
        parts: [
          mcq('APIs, testing & DevOps', ['s7', 's10'], 6, MIX.balanced),
          written('Explain in depth', ['s7', 's10'], MIX.balanced),
        ],
      }),
      round({
        id: 'design', label: 'Design Round', step: 5, minutes: 20, weight: 15,
        about: 'Object-oriented and system design.',
        parts: [
          mcq('Design', ['s8', 's9'], 4, MIX.balanced),
          written('Design question', ['s9', 's8'], MIX.balanced),
        ],
      }),
      hrRound(6, 10, 10, 'Behavioural / Hiring Manager Round'),
    ],
  },

  /* ------------------------------ Startups ------------------------------ */
  {
    id: 'startup', label: 'Product startup pattern',
    rounds: [
      round({
        id: 'online', label: 'Online Test', step: 2, minutes: 40, weight: 30, cutoff: 40,
        about: 'Aptitude, DSA and debugging MCQs plus one coding problem.',
        parts: [
          mcq('Aptitude', ['s1'], 5, MIX.balanced, { areas: ['quant', 'reasoning'] }),
          mcq('DSA', ['s3'], 5, MIX.dsaService),
          mcq('Debugging', ['s6'], 3, MIX.balanced, { areas: ['debugging'] }),
          coding(1, CODE_PRODUCT),
        ],
      }),
      round({
        id: 'screening', label: 'Technical Screening', step: 3, minutes: 20, weight: 20,
        about: 'A second coding problem and complexity reasoning.',
        parts: [
          coding(1, CODE_MEDIUM),
          mcq('Complexity & tracing', ['s3'], 3, MIX.dsaService, { areas: ['analysis'] }),
        ],
      }),
      round({
        id: 'practical', label: 'Practical Technical Round', step: 4, minutes: 25, weight: 25,
        about: 'Real-world APIs, databases and debugging.',
        parts: [
          mcq('Web & APIs', ['s7'], 4, MIX.balanced),
          mcq('SQL', ['s5'], 3, MIX.balanced),
          mcq('Debugging & AI review', ['s6'], 2, MIX.balanced, { areas: ['review'] }),
          written('Practical question', ['s7', 's5', 's6'], MIX.balanced),
        ],
      }),
      round({
        id: 'design', label: 'Design / Architecture Round', step: 5, minutes: 17, weight: 15,
        about: 'Low-level design, system design and product thinking.',
        parts: [
          mcq('Design', ['s8', 's9'], 4, MIX.balanced),
          written('Design question', ['s9', 's8'], MIX.balanced),
        ],
      }),
      hrRound(6, 8, 10, 'Managerial / Behavioural Round'),
    ],
  },
  {
    id: 'startup-fintech', label: 'Fintech startup pattern',
    rounds: [
      round({
        id: 'online', label: 'Online Test', step: 2, minutes: 40, weight: 30, cutoff: 40,
        about: 'Aptitude, DSA and debugging MCQs plus one coding problem.',
        parts: [
          mcq('Aptitude', ['s1'], 5, MIX.balanced, { areas: ['quant', 'reasoning'] }),
          mcq('DSA', ['s3'], 5, MIX.dsaService),
          mcq('Debugging', ['s6'], 3, MIX.balanced, { areas: ['debugging'] }),
          coding(1, CODE_PRODUCT),
        ],
      }),
      round({
        id: 'screening', label: 'Technical Screening', step: 3, minutes: 20, weight: 20,
        about: 'A second coding problem and complexity reasoning.',
        parts: [
          coding(1, CODE_MEDIUM),
          mcq('Complexity & tracing', ['s3'], 3, MIX.dsaService, { areas: ['analysis'] }),
        ],
      }),
      round({
        id: 'practical', label: 'Practical Technical Round', step: 4, minutes: 25, weight: 25,
        about: 'Transactional databases, API security and reliability — core to payments.',
        parts: [
          mcq('SQL & transactions', ['s5'], 3, MIX.balanced),
          mcq('API security', ['s7'], 3, MIX.balanced, { areas: ['security', 'api'] }),
          mcq('Reliability', ['s9'], 3, MIX.balanced, { areas: ['reliability', 'data'] }),
          written('Practical question', ['s5', 's7'], MIX.balanced),
        ],
      }),
      round({
        id: 'design', label: 'Design / Architecture Round', step: 5, minutes: 17, weight: 15,
        about: 'Design for correctness under concurrency and failure.',
        parts: [
          mcq('Design', ['s8', 's9'], 4, MIX.balanced),
          written('Design question', ['s9', 's8'], MIX.balanced),
        ],
      }),
      hrRound(6, 8, 10, 'Managerial / Behavioural Round'),
    ],
  },

  /* ------------------------------- BFSI --------------------------------- */
  {
    id: 'bfsi', label: 'Banking & financial services pattern',
    rounds: [
      round({
        id: 'oa', label: 'Online Assessment', step: 2, minutes: 45, weight: 35, cutoff: 45,
        about: 'Numerical and logical reasoning, CS fundamentals and one coding problem.',
        parts: [
          mcq('Numerical reasoning', ['s1'], 5, MIX.balanced, { areas: ['quant'] }),
          mcq('Logical reasoning', ['s1'], 4, MIX.balanced, { areas: ['reasoning'] }),
          mcq('CS fundamentals', ['s4'], 3, MIX.balanced),
          coding(1, CODE_MEDIUM),
        ],
      }),
      round({
        id: 'screening', label: 'Technical Screening', step: 3, minutes: 20, weight: 20,
        about: 'Programming, SQL, DSA and debugging.',
        parts: [
          mcq('Programming', ['s2'], 3, MIX.balanced),
          mcq('SQL', ['s5'], 3, MIX.balanced),
          mcq('DSA', ['s3'], 3, MIX.dsaService),
          mcq('Debugging', ['s6'], 2, MIX.balanced),
        ],
      }),
      round({
        id: 'interviews', label: 'Technical Interviews', step: 4, minutes: 22, weight: 20,
        about: 'Databases, systems, security and reliability.',
        parts: [
          mcq('Databases & systems', ['s5', 's9'], 4, MIX.balanced),
          mcq('Security & reliability', ['s7', 's10'], 4, MIX.balanced, { areas: ['security', 'devops', 'testing'] }),
          written('Explain in depth', ['s9', 's5'], MIX.balanced),
        ],
      }),
      round({
        id: 'domain', label: 'Domain / Business Round', step: 5, minutes: 15, weight: 15,
        about: 'Finance, risk and data interpretation.',
        parts: [
          mcq('Business & financial awareness', ['s1'], 6, MIX.balanced, { areas: ['finance'] }),
          mcq('Data interpretation', ['s1'], 2, MIX.balanced, { topics: ['Data Interpretation', 'Percentages', 'Compound Interest'] }),
        ],
      }),
      hrRound(6, 8, 10, 'Behavioural / HR Round'),
    ],
  },

  /* ---------------------------- Engineering ----------------------------- */
  {
    id: 'engineering', label: 'Engineering & embedded software pattern',
    rounds: [
      round({
        id: 'oa', label: 'Online Assessment', step: 2, minutes: 45, weight: 35, cutoff: 40,
        about: 'Aptitude, C-level programming output, OS/architecture and one coding problem.',
        parts: [
          mcq('Aptitude', ['s1'], 6, MIX.service, { areas: ['quant', 'reasoning'] }),
          mcq('C & code output', ['s2'], 4, MIX.balanced, { areas: ['output'] }),
          mcq('OS & computer organisation', ['s4'], 3, MIX.balanced, { areas: ['os', 'coa'] }),
          coding(1, CODE_SERVICE),
        ],
      }),
      round({
        id: 'screening', label: 'Technical Screening', step: 3, minutes: 15, weight: 15,
        about: 'Programming concepts and DSA.',
        parts: [
          mcq('Programming concepts', ['s2'], 3, MIX.balanced, { areas: ['concepts'] }),
          mcq('DSA', ['s3'], 3, MIX.dsaService),
        ],
      }),
      round({
        id: 'interviews', label: 'Technical Interviews', step: 4, minutes: 20, weight: 25,
        about: 'Operating systems, networks and testing discipline.',
        parts: [
          mcq('Systems', ['s4'], 4, MIX.balanced, { areas: ['os', 'cn', 'coa', 'compilers'] }),
          mcq('Testing', ['s10'], 2, MIX.balanced, { areas: ['testing'] }),
          written('Explain in depth', ['s4'], MIX.balanced),
        ],
      }),
      round({
        id: 'design', label: 'Design Round', step: 5, minutes: 17, weight: 15,
        about: 'Object-oriented design.',
        parts: [
          mcq('Object-oriented design', ['s8'], 3, MIX.balanced),
          written('Design question', ['s8'], MIX.balanced),
        ],
      }),
      hrRound(6, 8, 10, 'Behavioural / Hiring Manager Round'),
    ],
  },
]

export const BLUEPRINTS: Record<string, Blueprint> = Object.fromEntries(BLUEPRINTS_LIST.map((b) => [b.id, b]))

export function getBlueprint(id: string): Blueprint | undefined {
  return BLUEPRINTS[id]
}

export function blueprintMinutes(b: Blueprint): number {
  return b.rounds.reduce((s, r) => s + r.minutes, 0)
}

export function blueprintItemCount(b: Blueprint): number {
  return b.rounds.reduce((s, r) => s + r.parts.reduce((t, p) => t + p.count, 0), 0)
}

export function defaultMarks(kind: PartSpec['kind']): number {
  return kind === 'coding' ? 20 : kind === 'written' ? 10 : 1
}
