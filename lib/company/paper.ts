/**
 * Paper generation: blueprint + seed + bank → the concrete questions of one
 * attempt, and the candidate-facing projection of that paper.
 *
 * Guarantees (all covered by lib/__tests__/companyPaper.test.ts):
 *   - Deterministic: the same (blueprint, seed, bank) always yields the same paper.
 *   - No repeats: a question id — and a question *group* (e.g. two variants of
 *     one prompt, or two items of one numeric template) — appears at most once.
 *   - Balanced: items follow the part's difficulty mix (missing levels borrow
 *     from their neighbours) and are spread round-robin across sections and
 *     topics, then ordered easy → hard inside each part.
 *   - Safe: the client projection never contains answer keys or hidden tests,
 *     and MCQ options are re-shuffled per attempt.
 */
import { mulberry32, shuffled, shuffledOptions } from '../shuffle.ts'
import { defaultMarks, getBlueprint } from './blueprints.ts'
import type {
  BankQuestion, Blueprint, ClientItem, ClientPaper, Company, Difficulty, DifficultyMix,
  PartSpec, StoredPaper, StoredPaperItem,
} from './types.ts'
import type { LoadedBank } from './bank.ts'

const LEVELS: Difficulty[] = ['easy', 'medium', 'hard']
const RANK: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2 }
const FALLBACK: Record<Difficulty, Difficulty[]> = {
  easy: ['medium', 'hard'],
  medium: ['easy', 'hard'],
  hard: ['medium', 'easy'],
}

/** Split `count` over the mix: floors first, remainders sampled by weight. */
export function allocate(count: number, mix: DifficultyMix | undefined, rng: () => number): Record<Difficulty, number> {
  const m = mix || { easy: 1, medium: 1, hard: 1 }
  const total = LEVELS.reduce((s, l) => s + Math.max(0, m[l] || 0), 0) || 1
  const exact = LEVELS.map((l) => (count * Math.max(0, m[l] || 0)) / total)
  const out: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 0 }
  LEVELS.forEach((l, i) => { out[l] = Math.floor(exact[i]) })
  let rest = count - LEVELS.reduce((s, l) => s + out[l], 0)
  const frac = LEVELS.map((l, i) => exact[i] - out[l])
  while (rest > 0) {
    const sum = frac.reduce((s, f) => s + f, 0)
    let pick = 0
    if (sum > 0) {
      let r = rng() * sum
      for (let i = 0; i < frac.length; i++) {
        r -= frac[i]
        if (r <= 0) { pick = i; break }
      }
    } else {
      pick = Math.floor(rng() * LEVELS.length)
    }
    out[LEVELS[pick]]++
    frac[pick] = 0
    rest--
  }
  return out
}

/** Interleave by section, and by topic within each section (round-robin). */
function spread(items: BankQuestion[]): BankQuestion[] {
  const bySection = new Map<string, Map<string, BankQuestion[]>>()
  for (const q of items) {
    if (!bySection.has(q.section)) bySection.set(q.section, new Map())
    const topics = bySection.get(q.section)!
    if (!topics.has(q.topic)) topics.set(q.topic, [])
    topics.get(q.topic)!.push(q)
  }
  const sectionLists = [...bySection.values()].map((topics) => {
    const lists = [...topics.values()]
    const out: BankQuestion[] = []
    let left = lists.reduce((s, l) => s + l.length, 0)
    while (left > 0) {
      for (const l of lists) if (l.length) { out.push(l.shift()!); left-- }
    }
    return out
  })
  const out: BankQuestion[] = []
  let left = sectionLists.reduce((s, l) => s + l.length, 0)
  while (left > 0) {
    for (const l of sectionLists) if (l.length) { out.push(l.shift()!); left-- }
  }
  return out
}

export function partPool(bank: LoadedBank, part: PartSpec): BankQuestion[] {
  return bank.questions.filter((q) =>
    q.kind === part.kind &&
    part.sections.includes(q.section) &&
    (!part.areas || part.areas.includes(q.area)) &&
    (!part.topics || part.topics.includes(q.topic)),
  )
}

function selectPart(
  part: PartSpec,
  bank: LoadedBank,
  usedIds: Set<string>,
  usedGroups: Set<string>,
  rng: () => number,
): BankQuestion[] {
  const pool = partPool(bank, part).filter((q) => !usedIds.has(q.id) && !usedGroups.has(q.group))
  const buckets: Record<Difficulty, BankQuestion[]> = { easy: [], medium: [], hard: [] }
  for (const q of shuffled(pool, rng)) buckets[q.difficulty].push(q)
  for (const l of LEVELS) buckets[l] = spread(buckets[l])

  const want = allocate(part.count, part.mix, rng)
  const picked: BankQuestion[] = []
  const partTopics = new Set<string>()
  const take = (level: Difficulty, n: number, freshOnly: boolean): number => {
    let got = 0
    const list = buckets[level]
    for (let i = 0; i < list.length && got < n; i++) {
      const q = list[i]
      if (usedIds.has(q.id) || usedGroups.has(q.group)) continue
      if (freshOnly && partTopics.has(`${q.section}|${q.topic}`)) continue
      picked.push(q)
      usedIds.add(q.id)
      usedGroups.add(q.group)
      partTopics.add(`${q.section}|${q.topic}`)
      got++
    }
    return got
  }
  // Pass 1 uses only topics this part has not covered yet — across every
  // difficulty level — so a numerical round never gets two train problems
  // while other topics are still available. Pass 2 fills any remaining slots.
  // Within a pass, the scarcest level picks first and missing levels borrow
  // from their neighbours.
  const order = [...LEVELS].sort((a, b) => buckets[a].length - buckets[b].length)
  const remaining: Record<Difficulty, number> = { ...want }
  for (const freshOnly of [true, false]) {
    for (const l of order) remaining[l] -= take(l, remaining[l], freshOnly)
    for (const l of LEVELS) {
      for (const alt of FALLBACK[l]) {
        if (remaining[l] <= 0) break
        remaining[l] -= take(alt, remaining[l], freshOnly)
      }
    }
  }
  // Order easy → hard while keeping the randomised order within a level.
  return picked
    .map((q, i) => ({ q, i }))
    .sort((a, b) => RANK[a.q.difficulty] - RANK[b.q.difficulty] || a.i - b.i)
    .map((x) => x.q)
}

/** Build the stored (key-free) paper for an attempt. */
export function buildPaper(blueprintOrId: Blueprint | string, seed: number, bank: LoadedBank): StoredPaper {
  const bp = typeof blueprintOrId === 'string' ? getBlueprint(blueprintOrId) : blueprintOrId
  if (!bp) throw new Error(`Unknown blueprint: ${String(blueprintOrId)}`)
  const rng = mulberry32(seed >>> 0)
  const usedIds = new Set<string>()
  const usedGroups = new Set<string>()
  return {
    blueprint: bp.id,
    bankVersion: bank.version,
    rounds: bp.rounds.map((round) => {
      const items: StoredPaperItem[] = []
      for (const part of round.parts) {
        const marks = part.marks ?? defaultMarks(part.kind)
        for (const q of selectPart(part, bank, usedIds, usedGroups, rng)) {
          items.push({
            id: q.id,
            marks,
            part: part.label,
            ...(q.kind === 'mcq' ? { options: shuffledOptions(q.options, seed, q.id) } : {}),
          })
        }
      }
      return { id: round.id, items }
    }),
  }
}

/** Candidate-facing view of a stored paper: no keys, no hidden tests. */
export function toClientPaper(company: Company, paper: StoredPaper, bank: LoadedBank): ClientPaper {
  const bp = getBlueprint(paper.blueprint)
  if (!bp) throw new Error(`Unknown blueprint: ${paper.blueprint}`)
  return {
    company: company.slug,
    rounds: paper.rounds.map((stored) => {
      const spec = bp.rounds.find((r) => r.id === stored.id)
      const items: ClientItem[] = []
      for (const it of stored.items) {
        const q = bank.byId.get(it.id)
        if (!q) continue // question retired by a bank rebuild — skipped, never scored
        const base = { id: q.id, section: q.section, topic: q.topic, difficulty: q.difficulty, marks: it.marks, part: it.part }
        if (q.kind === 'mcq') {
          const options = it.options && it.options.length === q.options.length ? it.options : q.options
          items.push({ kind: 'mcq', ...base, q: q.q, ...(q.code ? { code: q.code } : {}), options })
        } else if (q.kind === 'written') {
          items.push({ kind: 'written', ...base, q: q.q, minWords: q.minWords, maxWords: q.maxWords })
        } else {
          items.push({
            kind: 'coding', ...base, title: q.title, statement: q.statement, examples: q.examples,
            constraints: q.constraints, starter: q.starter, testCount: q.tests.length,
          })
        }
      }
      return {
        id: stored.id,
        label: spec?.label || stored.id,
        step: spec?.step || 0,
        minutes: spec?.minutes || 0,
        weight: spec?.weight || 0,
        about: spec?.about || '',
        items,
      }
    }),
  }
}

/** Every item id in a stored paper (for validating submitted answers). */
export function paperItemIds(paper: StoredPaper): Set<string> {
  return new Set(paper.rounds.flatMap((r) => r.items.map((i) => i.id)))
}
