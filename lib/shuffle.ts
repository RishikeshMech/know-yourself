// Deterministic per-session option shuffling.
//
// Kept free of any question-bank import: pages that only need the shuffling
// helpers (and the shared exam runner, which is used by BOTH assessments) must
// not drag a question bank into their client bundle. A candidate sitting
// assessment 1 must never be served assessment 2's questions, and vice versa.
//
// Each student session gets a random `seed` (stored on the session row / in
// localStorage), and MCQ option order is shuffled from that seed — stable
// within the session, different between students (anti-cheating), and it
// never changes on re-render.

// mulberry32 — tiny deterministic PRNG
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffled<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export type SessionRng = { rng: () => number }

// Shuffle the string options of an MCQ; answer is stored as the option text so
// correctness is unaffected by order.
export function shuffledOptions(options: string[], seed: number, qid: string): string[] {
  const rng = mulberry32(seed + hashStr(qid))
  return shuffled(options, rng)
}

// Shuffle behavioral options (objects with .score) by session seed.
export function shuffledChoiceOptions<T>(options: T[], seed: number, qid: string): T[] {
  const rng = mulberry32(seed + hashStr(qid))
  return shuffled(options, rng)
}

export function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
