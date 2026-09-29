/**
 * The 11 sections of the CalibiAI master question bank (the `Ques/` folder).
 *
 * Client-safe metadata only — no questions. The question bank itself is built
 * from these documents by `scripts/company-bank/build.mjs` into
 * `data/company/bank.json`, which is read exclusively on the server.
 */
import type { SectionId } from './types.ts'

export interface SectionMeta {
  id: SectionId
  no: number
  title: string
  short: string
  icon: string
  /** Source document in `Ques/`. */
  file: string
  /** Question count the document claims (before de-duplication). */
  claimed: number
  /** Areas used by blueprints to target sub-topics. */
  areas: Record<string, string>
}

export const SECTIONS: SectionMeta[] = [
  {
    id: 's1', no: 1, title: 'Aptitude and Cognitive Ability', short: 'Aptitude', icon: '🧮',
    file: 'Section_1_Aptitude_and_Cognitive_Ability_450_Questions.docx', claimed: 450,
    areas: { quant: 'Quantitative Aptitude', reasoning: 'Logical Reasoning', verbal: 'Verbal Ability', finance: 'Business & Financial Aptitude' },
  },
  {
    id: 's2', no: 2, title: 'Programming Fundamentals', short: 'Programming', icon: '💻',
    file: 'Section_2_Programming_Fundamentals_250_Questions.docx', claimed: 250,
    areas: { concepts: 'Core Concepts', output: 'Code Output & Pseudocode' },
  },
  {
    id: 's3', no: 3, title: 'Data Structures and Algorithms', short: 'DSA', icon: '🧩',
    file: 'Section_3_Data_Structures_and_Algorithms_700_Questions.docx', claimed: 700,
    areas: { concepts: 'DSA Concepts', analysis: 'Complexity & Tracing', coding: 'Coding Problems' },
  },
  {
    id: 's4', no: 4, title: 'Computer Science Fundamentals', short: 'CS Fundamentals', icon: '🖥️',
    file: 'Section_4_-_Computer_Science_Fundamentals.docx', claimed: 350,
    areas: { os: 'Operating Systems', dbms: 'DBMS', cn: 'Computer Networks', oop: 'OOP', coa: 'Computer Organisation', compilers: 'Compilers & Runtimes' },
  },
  {
    id: 's5', no: 5, title: 'SQL and Databases', short: 'SQL & DB', icon: '🗄️',
    file: 'Section_5_-_SQL_and_Databases.docx', claimed: 200,
    areas: { query: 'SQL Queries', concepts: 'Database Concepts' },
  },
  {
    id: 's6', no: 6, title: 'AI-Assisted Coding and Debugging', short: 'AI Coding', icon: '🤖',
    file: 'Section_6_-_AI-Assisted_Coding_and_Debugging.docx', claimed: 200,
    areas: { debugging: 'Debugging', prompting: 'Prompting', review: 'Reviewing AI Output' },
  },
  {
    id: 's7', no: 7, title: 'Web Development and APIs', short: 'Web & APIs', icon: '🌐',
    file: 'Section_7_-_Web_Development_and_APIs.docx', claimed: 200,
    areas: { http: 'HTTP & REST', security: 'Web Security', frontend: 'Frontend & Rendering', api: 'API Design' },
  },
  {
    id: 's8', no: 8, title: 'LLD and OOP Design', short: 'LLD', icon: '🧱',
    file: 'Section_8_-_LLD_and_OOP_Design.docx', claimed: 150,
    areas: { principles: 'Design Principles', patterns: 'Design Patterns', modeling: 'Object Modelling' },
  },
  {
    id: 's9', no: 9, title: 'System Design and HLD', short: 'System Design', icon: '🏗️',
    file: 'Section_9_-_System_Design_and_HLD.docx', claimed: 150,
    areas: { scale: 'Scalability', data: 'Data & Storage', messaging: 'Messaging & Async', reliability: 'Reliability' },
  },
  {
    id: 's10', no: 10, title: 'Software Engineering, Testing and DevOps', short: 'SE & DevOps', icon: '⚙️',
    file: 'Section_10_-_Software_Engineering,_Testing_and_DevOps.docx', claimed: 150,
    areas: { testing: 'Testing', process: 'Process & Delivery', devops: 'DevOps & Cloud' },
  },
  {
    id: 's11', no: 11, title: 'Technical and Behavioral Interviews', short: 'Interviews', icon: '🎤',
    file: 'Section_11_-_Technical_and_Behavioral_Interviews.docx', claimed: 200,
    areas: { behavioral: 'Behavioural', technical: 'Technical Discussion', communication: 'Written Communication' },
  },
]

export const SECTION_BY_ID: Record<SectionId, SectionMeta> = Object.fromEntries(
  SECTIONS.map((s) => [s.id, s]),
) as Record<SectionId, SectionMeta>

export function sectionTitle(id: SectionId): string {
  return SECTION_BY_ID[id]?.title ?? id
}
