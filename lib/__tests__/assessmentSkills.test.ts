import test from 'node:test'
import assert from 'node:assert/strict'
import { companyAssessmentSkills, companySkillForArea, platformAssessmentSkills, rollupAssessmentSkills } from '../assessmentSkills.ts'
import { SECTIONS } from '../company/sections.ts'
import { loadBank } from '../company/bank.ts'
import type { SectionId } from '../company/types.ts'

test('platform assessment skill mapping normalises modules, communication subskills and behavioural traits', () => {
  const evidence = platformAssessmentSkills({
    created_at: '2026-09-29T10:00:00.000Z',
    english: { listening: 40, speaking: 35, reading: 50, writing: 25, total: 150 },
    problem_solving: 160,
    ai_debugging: 120,
    ai_feature: 75,
    prompt_engineering: 80,
    cognitive: {
      grid: 24,
      logical: 56,
      behavioral: { teamwork: 80, accountability: 90 },
    },
  }, 1)
  const byKey = new Map(evidence.map((skill) => [skill.key, skill]))
  assert.equal(byKey.get('listening-comprehension')?.score, 80)
  assert.equal(byKey.get('written-communication')?.score, 50)
  assert.equal(byKey.get('problem-solving')?.score, 80)
  assert.equal(byKey.get('ai-debugging')?.score, 80)
  assert.equal(byKey.get('ai-feature-development')?.score, 50)
  assert.equal(byKey.get('prompt-engineering')?.score, 80)
  assert.equal(byKey.get('visual-spatial-reasoning')?.score, 80)
  assert.equal(byKey.get('logical-reasoning')?.score, 80)
  assert.equal(byKey.get('teamwork')?.score, 80)
  assert.equal(byKey.get('accountability')?.score, 90)
  assert.ok(evidence.every((skill) => skill.source === 'CalibiAI Assessment' && skill.sourceType === 'platform'))
})

test('Capgemini assessment maps AI literacy, debugging, coding and cognitive modules', () => {
  const evidence = platformAssessmentSkills({
    english: { total: 160 },
    ai_literacy: 200,
    debug_mcq: 90,
    debug_lab: 60,
    ai_coding: 150,
    cognitive: { grid: 30, logical: 40, behavioural: 45, behavioral: { adaptability: 75 } },
  }, 2)
  const byKey = new Map(evidence.map((skill) => [skill.key, skill]))
  assert.equal(byKey.get('english-communication')?.score, 80)
  assert.equal(byKey.get('ai-literacy')?.score, 80)
  assert.equal(byKey.get('code-debugging-concepts')?.score, 75)
  assert.equal(byKey.get('practical-code-debugging')?.score, 75)
  assert.equal(byKey.get('ai-assisted-coding')?.score, 75)
  assert.equal(byKey.get('visual-spatial-reasoning')?.score, 75)
  assert.equal(byKey.get('logical-reasoning')?.score, 80)
  assert.equal(byKey.get('adaptability')?.score, 75)
})

test('company results map section areas to safe, scored skill evidence without exposing item data', () => {
  const evidence = companyAssessmentSkills({
    gradedAt: '2026-09-29T10:00:00.000Z',
    items: [
      { id: 'hidden-id-1', kind: 'mcq', section: 's9', area: 'scale', earned: 8, marks: 10, correct: true },
      { id: 'hidden-id-2', kind: 'written', section: 's9', area: 'scale', earned: 6, marks: 10, correct: true },
      { id: 'hidden-id-3', kind: 'coding', section: 's3', area: 'coding', earned: 15, marks: 20, correct: false },
    ],
  }, 'google')
  const byKey = new Map(evidence.map((skill) => [skill.key, skill]))
  assert.equal(byKey.get('scalable-system-design')?.name, 'Scalable System Design')
  assert.equal(byKey.get('scalable-system-design')?.score, 70)
  assert.equal(byKey.get('coding-problems')?.score, 75)
  assert.ok(evidence.every((skill) => skill.source === 'Google' && skill.sourceType === 'company'))
  assert.ok(evidence.every((skill) => !('correct' in skill) && !('id' in skill) && !('answers' in skill)))
})

test('skill rollup averages repeat evidence and preserves all assessment sources', () => {
  const rollup = rollupAssessmentSkills([
    { key: 'sql', name: 'SQL', score: 80, source: 'TCS', sourceType: 'company' },
    { key: 'sql', name: 'SQL', score: 60, source: 'Infosys', sourceType: 'company' },
    { key: 'teamwork', name: 'Teamwork', score: 90, source: 'CalibiAI Assessment', sourceType: 'platform' },
  ])
  assert.deepEqual(rollup.find((skill) => skill.key === 'sql'), {
    key: 'sql', name: 'SQL', score: 70, assessmentCount: 2, sources: ['TCS', 'Infosys'],
  })
  assert.equal(rollup[0].key, 'sql')
})

test('every master-bank section/area has an explicit candidate-facing skill mapping', () => {
  const bankAreas = new Set(loadBank().questions.map((question) => `${question.section}/${question.area || 'general'}`))
  for (const section of SECTIONS) {
    for (const area of Object.keys(section.areas)) bankAreas.add(`${section.id}/${area}`)
  }
  for (const entry of bankAreas) {
    const [section, area] = entry.split('/') as [SectionId, string]
    const skill = companySkillForArea(section, area)
    assert.ok(skill.key && skill.name, entry)
    assert.notEqual(skill.key, `${section}-${area}`, `${entry} should use a canonical mapping`)
  }
  assert.equal(companySkillForArea('s8', 'data-structures').key, 'data-structures')
  assert.equal(companySkillForArea('s9', 'architecture').key, 'system-architecture')
})
