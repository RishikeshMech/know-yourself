import test from 'node:test'
import assert from 'node:assert/strict'

import { loadBank } from '../company/bank.ts'
import { COMPANIES, getCompany } from '../company/catalog.ts'
import { BLUEPRINTS } from '../company/blueprints.ts'
import { allocate, buildPaper, partPool, toClientPaper } from '../company/paper.ts'
import { mulberry32 } from '../shuffle.ts'

const bank = loadBank()
const SEEDS = [1, 42, 7777, 123456789, 4294967295]

test('paper: every blueprint is fully satisfiable for many seeds (no short papers)', () => {
  for (const bp of Object.values(BLUEPRINTS)) {
    const expected = bp.rounds.map((r) => r.parts.reduce((s, p) => s + p.count, 0))
    for (const seed of [...SEEDS, ...Array.from({ length: 20 }, (_, i) => i * 7919 + 3)]) {
      const paper = buildPaper(bp, seed, bank)
      paper.rounds.forEach((r, i) => assert.equal(r.items.length, expected[i], `${bp.id}/${r.id} seed ${seed}`))
    }
  }
})

test('paper: each part has enough distinct groups in its pool', () => {
  for (const bp of Object.values(BLUEPRINTS)) {
    for (const r of bp.rounds) {
      for (const p of r.parts) {
        const groups = new Set(partPool(bank, p).map((q) => q.group))
        assert.ok(groups.size >= p.count * 2 || groups.size >= p.count + 3, `${bp.id}/${r.id}/${p.label}: ${groups.size} groups for ${p.count} items`)
      }
    }
  }
})

test('paper: deterministic for the same seed, different across seeds', () => {
  const a = buildPaper('product', 42, bank)
  const b = buildPaper('product', 42, bank)
  const c = buildPaper('product', 43, bank)
  assert.deepEqual(a, b)
  assert.notDeepEqual(a.rounds.map((r) => r.items.map((i) => i.id)), c.rounds.map((r) => r.items.map((i) => i.id)))
})

test('paper: never repeats a question or a question group', () => {
  for (const c of COMPANIES) {
    for (const seed of SEEDS) {
      const paper = buildPaper(c.blueprint, seed, bank)
      const ids = paper.rounds.flatMap((r) => r.items.map((i) => i.id))
      assert.equal(new Set(ids).size, ids.length, `${c.slug} seed ${seed}: repeated id`)
      const groups = ids.map((id) => bank.byId.get(id)!.group)
      assert.equal(new Set(groups).size, groups.length, `${c.slug} seed ${seed}: repeated group`)
    }
  }
})

test('paper: parts respect their sections, areas, topics and kinds', () => {
  for (const bp of Object.values(BLUEPRINTS)) {
    const paper = buildPaper(bp, 99, bank)
    bp.rounds.forEach((r, ri) => {
      for (const it of paper.rounds[ri].items) {
        const part = r.parts.find((p) => p.label === it.part)!
        const q = bank.byId.get(it.id)!
        assert.equal(q.kind, part.kind)
        assert.ok(part.sections.includes(q.section))
        if (part.areas) assert.ok(part.areas.includes(q.area), `${bp.id}: ${q.id} area ${q.area}`)
        if (part.topics) assert.ok(part.topics.includes(q.topic))
      }
    })
  }
})

test('paper: product papers are harder than IT-services papers', () => {
  const avg = (bp: string) => {
    let s = 0, n = 0
    for (const seed of SEEDS) for (const r of buildPaper(bp, seed, bank).rounds) for (const it of r.items) {
      s += { easy: 0, medium: 1, hard: 2 }[bank.byId.get(it.id)!.difficulty]; n++
    }
    return s / n
  }
  assert.ok(avg('product') > avg('service') + 0.2, `product ${avg('product')} vs service ${avg('service')}`)
})

test('paper: MCQ options are a per-attempt permutation of the bank options', () => {
  const paper = buildPaper('tcs', 5, bank)
  let moved = 0
  for (const it of paper.rounds.flatMap((r) => r.items)) {
    const q = bank.byId.get(it.id)!
    if (q.kind !== 'mcq') continue
    assert.deepEqual([...it.options!].sort(), [...q.options].sort())
    if (it.options!.join('|') !== q.options.join('|')) moved++
  }
  assert.ok(moved > 10, 'options should be shuffled')
})

test('paper: the source convention "answer is always option A" does not survive shuffling', () => {
  const firstIsKey: number[] = []
  for (const seed of SEEDS) {
    for (const it of buildPaper('service', seed, bank).rounds.flatMap((r) => r.items)) {
      const q = bank.byId.get(it.id)!
      if (q.kind === 'mcq') firstIsKey.push(it.options![0] === q.answer ? 1 : 0)
    }
  }
  const rate = firstIsKey.reduce((a, b) => a + b, 0) / firstIsKey.length
  assert.ok(rate > 0.12 && rate < 0.4, `key shown first in ${Math.round(rate * 100)}% of items`)
})

test('paper: the client projection never contains answer keys or hidden tests', () => {
  for (const c of COMPANIES) {
    const client = toClientPaper(c, buildPaper(c.blueprint, 11, bank), bank)
    const json = JSON.stringify(client)
    assert.doesNotMatch(json, /"answer"|"tests"|"explanation"|"rubric"|"solution"/, c.slug)
    for (const r of client.rounds) {
      for (const it of r.items) {
        if (it.kind === 'coding') assert.ok(it.testCount >= 5)
      }
    }
  }
})

test('paper: client rounds carry labels, steps and weights from the blueprint', () => {
  const tcs = getCompany('tcs')!
  const client = toClientPaper(tcs, buildPaper(tcs.blueprint, 3, bank), bank)
  assert.deepEqual(client.rounds.map((r) => r.step), [2, 3, 4, 5])
  assert.equal(client.rounds[0].label, 'Foundation Assessment')
  assert.equal(client.rounds.reduce((s, r) => s + r.weight, 0), 100)
})

test('allocate: splits counts by the mix and always sums to the count', () => {
  const rng = mulberry32(9)
  for (const count of [1, 2, 3, 5, 8, 10, 13]) {
    const a = allocate(count, { easy: 0.3, medium: 0.4, hard: 0.3 }, rng)
    assert.equal(a.easy + a.medium + a.hard, count)
  }
  assert.deepEqual(allocate(10, { easy: 0, medium: 1, hard: 0 }, rng), { easy: 0, medium: 10, hard: 0 })
})

test('paper: a part never repeats a topic while fresh topics remain in its pool', () => {
  for (const bp of Object.values(BLUEPRINTS)) {
    for (const seed of SEEDS) {
      const paper = buildPaper(bp, seed, bank)
      bp.rounds.forEach((r, ri) => {
        for (const part of r.parts) {
          const topicsInPool = new Set(partPool(bank, part).map((q) => `${q.section}|${q.topic}`)).size
          if (part.count > topicsInPool - 4) continue // pool too narrow to promise distinct topics
          const topics = paper.rounds[ri].items.filter((i) => i.part === part.label).map((i) => {
            const q = bank.byId.get(i.id)!
            return `${q.section}|${q.topic}`
          })
          assert.equal(new Set(topics).size, topics.length, `${bp.id}/${r.id}/${part.label} seed ${seed}: ${topics.join(', ')}`)
        }
      })
    }
  }
})
