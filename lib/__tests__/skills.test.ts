import test from 'node:test'
import assert from 'node:assert/strict'

import { SKILL_GROUPS, TOP_SKILLS } from '../skills.ts'

test('skills catalogue is grouped and non-empty', () => {
  assert.ok(SKILL_GROUPS.length >= 3)
  for (const g of SKILL_GROUPS) {
    assert.ok(g.label.length > 0, 'every group has a label')
    assert.ok(g.skills.length > 0, 'every group has skills')
  }
})

test('trending skills include the most common languages/tools', () => {
  for (const s of ['Python', 'Java', 'C', 'C++', 'JavaScript', 'React', 'SQL', 'AWS']) {
    assert.ok(TOP_SKILLS.includes(s), `missing ${s}`)
  }
})

test('trending skills are unique (case-insensitive)', () => {
  const seen = new Set<string>()
  for (const s of TOP_SKILLS) {
    const key = s.toLowerCase()
    assert.ok(!seen.has(key), `duplicate skill: ${s}`)
    seen.add(key)
  }
})
