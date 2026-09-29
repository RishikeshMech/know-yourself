/**
 * Upgrades to the coding problems that already live in
 * data/company/supplements/s03-coding.json.
 *
 *  - RETIRE: easy warm-ups removed from the pool — every coding round is now
 *    LeetCode medium/hard.
 *  - PATCHES: stress tests (added once, matched by name, so compiling is
 *    idempotent) and constraints that state the required complexity.
 */
import { STRESS } from './util.mjs'

export const RETIRE = ['two-sum', 'valid-parentheses', 'second-largest', 'reverse-words', 'valid-anagram', 'missing-number', 'best-time-stock']

const ALNUM = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

export const PATCHES = {
  'longest-unique-substring': {
    constraints: ['0 ≤ len(s) ≤ 10⁵', 'Expected: O(n) sliding window'],
    tests: [
      { name: 'stress: 10⁵ characters, 62-symbol alphabet', args: [{ $gen: 'str', n: 100000, alphabet: ALNUM, seed: 301 }], ...STRESS() },
    ],
  },
  'merge-intervals': {
    constraints: ['0 ≤ len(intervals) ≤ 10⁵', 'The input may be unsorted', 'Do not mutate the input', 'Expected: O(n log n)'],
    tests: [
      { name: 'stress: 10⁵ intervals', args: [{ $gen: 'intervals', n: 100000, lo: 0, hi: 10000000, maxLen: 200, seed: 302 }], ...STRESS() },
    ],
  },
  'group-anagrams': {
    constraints: ['0 ≤ len(words) ≤ 2 × 10⁴', '1 ≤ len(word) ≤ 8', 'Expected: O(n · L log L) — bucket by a canonical key'],
    tests: [
      { name: 'stress: 20,000 six-letter words', args: [{ $gen: 'strs', n: 20000, len: 6, alphabet: 'abcdef', seed: 303 }], ...STRESS() },
    ],
  },
  'kth-largest': {
    tests: [
      { name: 'stress: 10⁵ values, k = 50,000', args: [{ $gen: 'ints', n: 100000, lo: -10000, hi: 10000, seed: 304 }, 50000], ...STRESS() },
    ],
  },
  'number-of-islands': {
    constraints: ['1 ≤ rows, cols ≤ 300', 'Diagonal cells are NOT connected', 'Expected: O(rows × cols) BFS/DFS or union-find'],
    tests: [
      { name: 'stress: 300 × 300 random map', args: [{ $gen: 'grid', rows: 300, cols: 300, values: ['1', '0', '0'], seed: 305 }], ...STRESS() },
    ],
  },
  'coin-change': {
    constraints: ['1 ≤ len(coins) ≤ 12', '0 ≤ amount ≤ 10⁴', 'Expected: O(amount × len(coins)) DP — greedy is wrong and plain recursion is exponential'],
    tests: [
      { name: 'greedy trap', args: [[186, 419, 83, 408], 6249], expected: 20, ...STRESS() },
      { name: 'stress: large amount', args: [[3, 7, 405, 436], 8839], ...STRESS() },
    ],
  },
  'product-except-self': {
    tests: [
      { name: 'stress: 10⁵ values of ±1 and ten 2s', args: [{ $gen: 'concat', parts: [{ $gen: 'choice', n: 99990, values: [-1, 1], seed: 306 }, { $gen: 'repeat', value: 2, n: 10 }] }], ...STRESS() },
      { name: 'stress: 10⁵ values with one zero', args: [{ $gen: 'concat', parts: [{ $gen: 'choice', n: 99999, values: [-1, 1], seed: 307 }, [0]] }], ...STRESS() },
    ],
  },
  'top-k-frequent': {
    constraints: ['1 ≤ len(nums) ≤ 10⁵', '1 ≤ k ≤ number of distinct values', 'Expected: O(n log k) with a heap, or O(n) bucket sort'],
    tests: [
      { name: 'stress: 97,020 values, 440 distinct', args: [{ $gen: 'shuffle', of: { $gen: 'countup', k: 440, base: 1 }, seed: 308 }, 10], expected: [440, 439, 438, 437, 436, 435, 434, 433, 432, 431], ...STRESS() },
    ],
  },
  'spiral-order': {
    constraints: ['1 ≤ m, n ≤ 300', 'Expected: O(m × n) with four shrinking boundaries'],
    tests: [
      { name: 'stress: 300 × 300 matrix', args: [{ $gen: 'affine', rows: 300, cols: 300, a: 300, b: 1 }], ...STRESS() },
      { name: 'single column', args: [[[1], [2], [3], [4]]], expected: [1, 2, 3, 4] },
    ],
  },
  'trapping-rain-water': {
    constraints: ['0 ≤ n ≤ 10⁵', '0 ≤ height[i] ≤ 10⁵', 'Expected: O(n) time and O(1) extra space (two pointers)'],
    tests: [
      { name: 'stress: 10⁵ random bars', args: [{ $gen: 'ints', n: 100000, lo: 0, hi: 10000, seed: 309 }], ...STRESS() },
      { name: 'stress: 10⁵-bar mountain', args: [{ $gen: 'concat', parts: [{ $gen: 'sorted', of: { $gen: 'ints', n: 50000, lo: 0, hi: 100000, seed: 310 } }, { $gen: 'sorted', of: { $gen: 'ints', n: 50000, lo: 0, hi: 100000, seed: 311 }, desc: true }] }], ...STRESS() },
    ],
  },
  'longest-increasing-subsequence': {
    constraints: ['1 ≤ len(nums) ≤ 10⁵', '−10⁹ ≤ nums[i] ≤ 10⁹', 'Expected: O(n log n) (patience sorting) — the O(n²) DP will time out'],
    tests: [
      { name: 'stress: 10⁵ random values', args: [{ $gen: 'ints', n: 100000, lo: -1000000000, hi: 1000000000, seed: 312 }], ...STRESS() },
      { name: 'stress: 10⁵ ascending values', args: [{ $gen: 'range', start: 1, stop: 100001 }], expected: 100000, ...STRESS() },
    ],
  },
  'course-schedule': {
    constraints: ['1 ≤ num_courses ≤ 3000', '0 ≤ len(prerequisites) ≤ 6000', 'Expected: O(V + E) — Kahn’s algorithm or DFS colouring'],
    tests: [
      { name: 'stress: 3,000 courses, no cycle', args: [3000, { $gen: 'edges', n: 3000, m: 6000, acyclic: true, seed: 313 }], expected: true, ...STRESS() },
      { name: 'stress: 3,000 courses, one long cycle', args: [3000, { $gen: 'concat', parts: [{ $gen: 'edges', n: 3000, m: 6000, acyclic: true, seed: 313 }, [[2999, 0]]] }], ...STRESS() },
    ],
  },
  'word-break': {
    constraints: ['1 ≤ len(s) ≤ 300', '1 ≤ len(word_dict) ≤ 1000', 'Expected: O(n² ) DP (or O(n × max word length)) — plain recursion is exponential'],
    tests: [
      { name: 'stress: exponential trap', args: [{ $gen: 'concat', parts: [{ $gen: 'strrepeat', value: 'a', n: 150 }, 'b'] }, ['a', 'aa', 'aaa', 'aaaa', 'aaaaa', 'aaaaaa', 'aaaaaaa', 'aaaaaaaa', 'aaaaaaaaa', 'aaaaaaaaaa']], expected: false, ...STRESS() },
      { name: 'stress: 300 characters, overlapping words', args: [{ $gen: 'strrepeat', value: 'ab', n: 150 }, ['a', 'b', 'ab', 'ba', 'aba']], expected: true, ...STRESS() },
    ],
  },
  'edit-distance': {
    constraints: ['0 ≤ len(a), len(b) ≤ 1000', 'Expected: O(len(a) × len(b)) DP'],
    tests: [
      { name: 'stress: two 1,000-character strings', args: [{ $gen: 'str', n: 1000, alphabet: 'abcd', seed: 314 }, { $gen: 'str', n: 1000, alphabet: 'abcd', seed: 315 }], ...STRESS({ python: 6000, javascript: 1500 }) },
    ],
  },
  'sliding-window-maximum': {
    tests: [
      { name: 'stress: 10⁵ values, k = 50,000', args: [{ $gen: 'ints', n: 100000, lo: -10000, hi: 10000, seed: 316 }, 50000], ...STRESS() },
      { name: 'stress: 10⁵ descending values, k = 1,000', args: [{ $gen: 'range', start: 100000, stop: 0, step: -1 }, 1000], ...STRESS() },
    ],
  },
  'min-window-substring': {
    tests: [
      { name: 'stress: unique window hidden in 10⁵ characters', args: [{ $gen: 'concat', parts: [{ $gen: 'str', n: 50000, alphabet: 'abcdefghij', seed: 317 }, 'X', { $gen: 'str', n: 10, alphabet: 'abcdefghij', seed: 318 }, 'YZ', { $gen: 'str', n: 50000, alphabet: 'abcdefghij', seed: 319 }] }, 'ZYX'], ...STRESS() },
      { name: 'stress: 10⁵ characters, 10-letter target', args: [{ $gen: 'str', n: 100000, alphabet: 'ABCDEFGHIJ', seed: 320 }, 'AABBCCDDEE'], ...STRESS() },
    ],
  },
}

/**
 * Deliberately slow but correct solutions for a few of the existing
 * problems — used by the tests to prove their new stress tests bite.
 */
export const BRUTE = {
  'trapping-rain-water': {
    python: `def trap(height):
    water = 0
    for i in range(len(height)):
        left = max(height[:i + 1])
        right = max(height[i:])
        water += min(left, right) - height[i]
    return water
`,
  },
  'longest-increasing-subsequence': {
    python: `def length_of_lis(nums):
    dp = [1] * len(nums)
    for i in range(len(nums)):
        for j in range(i):
            if nums[j] < nums[i] and dp[j] + 1 > dp[i]:
                dp[i] = dp[j] + 1
    return max(dp)
`,
    javascript: `function lengthOfLIS(nums) {
  const dp = new Array(nums.length).fill(1)
  let best = 1
  for (let i = 0; i < nums.length; i++) { for (let j = 0; j < i; j++) if (nums[j] < nums[i] && dp[j] + 1 > dp[i]) dp[i] = dp[j] + 1; if (dp[i] > best) best = dp[i] }
  return best
}
`,
  },
  'sliding-window-maximum': {
    python: `def max_sliding_window(nums, k):
    return [max(nums[i:i + k]) for i in range(len(nums) - k + 1)]
`,
    javascript: `function maxSlidingWindow(nums, k) {
  const out = []
  for (let i = 0; i + k <= nums.length; i++) { let m = -Infinity; for (let j = i; j < i + k; j++) if (nums[j] > m) m = nums[j]; out.push(m) }
  return out
}
`,
  },
  'word-break': {
    python: `def word_break(s, word_dict):
    words = set(word_dict)
    def go(i):
        if i == len(s):
            return True
        return any(s[i:j] in words and go(j) for j in range(i + 1, len(s) + 1))
    return go(0)
`,
  },
}
