/** Shared helpers for the coding-problem authoring sources. */

/** Default per-test limit for stress tests (ms). CPython is ~10–30× slower
 *  than V8 on tight loops, so it gets a larger budget. Reference solutions
 *  must finish well inside these (compile-coding.mjs enforces ≤ 40 %). */
export const STRESS_LIMIT = { python: 4000, javascript: 2000 }

/** Spread into a test to mark it as a stress test. */
export const STRESS = (limitMs = STRESS_LIMIT) => ({ stress: true, limitMs })
