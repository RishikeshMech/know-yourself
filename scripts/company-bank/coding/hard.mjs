/**
 * New HARD coding problems (LeetCode-style). See medium.mjs for the format.
 */
import { STRESS } from './util.mjs'

export const HARD = [
  /* ------------------------------------------------------------------ */
  {
    slug: 'largest-rectangle-histogram', title: 'Largest Rectangle in Histogram', topic: 'Stacks', difficulty: 'hard',
    statement: 'heights[i] is the height of bar i in a histogram where every bar has width 1. Return the area of the largest rectangle that fits entirely inside the histogram.',
    examples: [
      { input: 'heights = [2,1,5,6,2,3]', output: '10', explain: 'Bars 5 and 6 form a 2 × 5 rectangle.' },
      { input: 'heights = [2,4]', output: '4' },
    ],
    constraints: ['1 ≤ len(heights) ≤ 10⁵', '0 ≤ heights[i] ≤ 10⁴', 'Expected: O(n) with a monotonic stack'],
    fn: { python: 'largest_rectangle_area', javascript: 'largestRectangleArea' },
    compare: 'exact',
    tests: [
      { name: 'example 1', args: [[2, 1, 5, 6, 2, 3]], expected: 10, sample: true },
      { name: 'example 2', args: [[2, 4]], expected: 4, sample: true },
      { name: 'single bar', args: [[1]], expected: 1 },
      { name: 'zero bar', args: [[0]], expected: 0 },
      { name: 'valley', args: [[2, 1, 2]], expected: 3 },
      { name: 'classic', args: [[6, 2, 5, 4, 5, 1, 6]], expected: 12 },
      { name: 'flat', args: [[1, 1, 1, 1]], expected: 4 },
      { name: 'with a zero', args: [[4, 2, 0, 3, 2, 5]], expected: 6 },
      { name: 'descending', args: [[5, 4, 3, 2, 1]], expected: 9 },
      { name: 'stress: 10⁵ ascending bars', args: [{ $gen: 'range', start: 1, stop: 100001 }], expected: 2500050000, ...STRESS() },
      { name: 'stress: 10⁵ random bars', args: [{ $gen: 'ints', n: 100000, lo: 0, hi: 10000, seed: 201 }], ...STRESS() },
      { name: 'stress: 10⁵ equal bars', args: [{ $gen: 'repeat', value: 7, n: 100000 }], expected: 700000, ...STRESS() },
    ],
    solution: {
      python: String.raw`def largest_rectangle_area(heights):
    stack = []
    best = 0
    for i, h in enumerate(heights + [0]):
        start = i
        while stack and stack[-1][1] >= h:
            idx, height = stack.pop()
            best = max(best, height * (i - idx))
            start = idx
        stack.append((start, h))
    return best
`,
      javascript: String.raw`function largestRectangleArea(heights) {
  const stack = []
  let best = 0
  for (let i = 0; i <= heights.length; i++) {
    const h = i === heights.length ? 0 : heights[i]
    let start = i
    while (stack.length && stack[stack.length - 1][1] >= h) {
      const [idx, height] = stack.pop()
      best = Math.max(best, height * (i - idx))
      start = idx
    }
    stack.push([start, h])
  }
  return best
}
`,
    },
    brute: {
      python: String.raw`def largest_rectangle_area(heights):
    best = 0
    for i in range(len(heights)):
        low = heights[i]
        for j in range(i, len(heights)):
            low = min(low, heights[j])
            best = max(best, low * (j - i + 1))
    return best
`,
      javascript: String.raw`function largestRectangleArea(h) {
  let best = 0
  for (let i = 0; i < h.length; i++) { let low = h[i]; for (let j = i; j < h.length; j++) { if (h[j] < low) low = h[j]; const a = low * (j - i + 1); if (a > best) best = a } }
  return best
}
`,
    },
  },

  /* ------------------------------------------------------------------ */
  {
    slug: 'median-two-sorted-arrays', title: 'Median of Two Sorted Arrays', topic: 'Searching', difficulty: 'hard',
    statement: 'Given two sorted arrays nums1 and nums2, return the median of all their elements combined. Aim for O(log(m + n)) time.',
    examples: [
      { input: 'nums1 = [1,3], nums2 = [2]', output: '2.0', explain: 'Merged: [1,2,3].' },
      { input: 'nums1 = [1,2], nums2 = [3,4]', output: '2.5' },
    ],
    constraints: ['0 ≤ m, n ≤ 10⁵ and m + n ≥ 1', '−10⁶ ≤ nums[i] ≤ 10⁶', 'Expected: binary search on the partition — O(log(min(m, n)))', 'Answers within 10⁻⁶ are accepted'],
    fn: { python: 'find_median_sorted_arrays', javascript: 'findMedianSortedArrays' },
    compare: 'float',
    tests: [
      { name: 'example 1', args: [[1, 3], [2]], expected: 2, sample: true },
      { name: 'example 2', args: [[1, 2], [3, 4]], expected: 2.5, sample: true },
      { name: 'first empty', args: [[], [1]], expected: 1 },
      { name: 'second empty', args: [[2], []], expected: 2 },
      { name: 'all zeros', args: [[0, 0], [0, 0]], expected: 0 },
      { name: 'negatives', args: [[1, 2], [-1, 3]], expected: 1.5 },
      { name: 'interleaved', args: [[1, 3, 5, 7, 9], [2, 4, 6]], expected: 4.5 },
      { name: 'half values', args: [[100000], [100001]], expected: 100000.5 },
      { name: 'disjoint ranges', args: [[1, 2, 3, 4, 5], [6, 7, 8, 9, 10, 11]], expected: 6 },
      { name: 'stress: 10⁵ + 99,999 values', args: [{ $gen: 'sorted', of: { $gen: 'ints', n: 100000, lo: -1000000, hi: 1000000, seed: 202 } }, { $gen: 'sorted', of: { $gen: 'ints', n: 99999, lo: -1000000, hi: 1000000, seed: 203 } }], ...STRESS() },
    ],
    solution: {
      python: String.raw`def find_median_sorted_arrays(nums1, nums2):
    a, b = nums1, nums2
    if len(a) > len(b):
        a, b = b, a
    m, n = len(a), len(b)
    half = (m + n + 1) // 2
    lo, hi = 0, m
    while lo <= hi:
        i = (lo + hi) // 2
        j = half - i
        a_left = a[i - 1] if i > 0 else float('-inf')
        a_right = a[i] if i < m else float('inf')
        b_left = b[j - 1] if j > 0 else float('-inf')
        b_right = b[j] if j < n else float('inf')
        if a_left <= b_right and b_left <= a_right:
            if (m + n) % 2:
                return float(max(a_left, b_left))
            return (max(a_left, b_left) + min(a_right, b_right)) / 2
        if a_left > b_right:
            hi = i - 1
        else:
            lo = i + 1
    return 0.0
`,
      javascript: String.raw`function findMedianSortedArrays(nums1, nums2) {
  let a = nums1, b = nums2
  if (a.length > b.length) { const t = a; a = b; b = t }
  const m = a.length, n = b.length, half = Math.floor((m + n + 1) / 2)
  let lo = 0, hi = m
  while (lo <= hi) {
    const i = Math.floor((lo + hi) / 2), j = half - i
    const aL = i > 0 ? a[i - 1] : -Infinity, aR = i < m ? a[i] : Infinity
    const bL = j > 0 ? b[j - 1] : -Infinity, bR = j < n ? b[j] : Infinity
    if (aL <= bR && bL <= aR) return (m + n) % 2 ? Math.max(aL, bL) : (Math.max(aL, bL) + Math.min(aR, bR)) / 2
    if (aL > bR) hi = i - 1
    else lo = i + 1
  }
  return 0
}
`,
    },
  },

  /* ------------------------------------------------------------------ */
  {
    slug: 'merge-k-sorted-lists', title: 'Merge k Sorted Lists', topic: 'Heaps', difficulty: 'hard',
    statement: 'You are given k lists, each sorted in ascending order (given as arrays — think of each as a linked list). Merge them into one sorted list and return it.',
    examples: [
      { input: 'lists = [[1,4,5],[1,3,4],[2,6]]', output: '[1,1,2,3,4,4,5,6]' },
      { input: 'lists = []', output: '[]' },
    ],
    constraints: ['0 ≤ k ≤ 10⁴; at most 10⁵ values in total', 'Expected: O(N log k) — a min-heap of list heads, or divide & conquer'],
    fn: { python: 'merge_k_lists', javascript: 'mergeKLists' },
    compare: 'exact',
    tests: [
      { name: 'example 1', args: [[[1, 4, 5], [1, 3, 4], [2, 6]]], expected: [1, 1, 2, 3, 4, 4, 5, 6], sample: true },
      { name: 'example 2', args: [[]], expected: [], sample: true },
      { name: 'one empty list', args: [[[]]], expected: [] },
      { name: 'two singletons', args: [[[1], [0]]], expected: [0, 1] },
      { name: 'with an empty list', args: [[[-1, 5, 11], [], [6, 10]]], expected: [-1, 5, 6, 10, 11] },
      { name: 'duplicates', args: [[[2], [2], [2]]], expected: [2, 2, 2] },
      { name: 'already ordered lists', args: [[[1, 2, 3], [4, 5, 6], [7, 8, 9]]], expected: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
      { name: 'stress: 1,000 lists × 100 values', args: [{ $gen: 'chunks', of: { $gen: 'ints', n: 100000, lo: -1000000, hi: 1000000, seed: 204 }, size: 100, sort: true }], ...STRESS() },
      { name: 'stress: 10,000 single-value lists', args: [{ $gen: 'chunks', of: { $gen: 'ints', n: 10000, lo: -1000, hi: 1000, seed: 205 }, size: 1 }], ...STRESS() },
    ],
    solution: {
      python: String.raw`import heapq

def merge_k_lists(lists):
    heap = [(lst[0], i, 0) for i, lst in enumerate(lists) if lst]
    heapq.heapify(heap)
    out = []
    while heap:
        v, i, j = heapq.heappop(heap)
        out.append(v)
        if j + 1 < len(lists[i]):
            heapq.heappush(heap, (lists[i][j + 1], i, j + 1))
    return out
`,
      javascript: String.raw`function mergeKLists(lists) {
  if (!lists.length) return []
  const merge = (a, b) => {
    const out = []
    let i = 0, j = 0
    while (i < a.length && j < b.length) out.push(a[i] <= b[j] ? a[i++] : b[j++])
    while (i < a.length) out.push(a[i++])
    while (j < b.length) out.push(b[j++])
    return out
  }
  let cur = lists.map((l) => l.slice())
  while (cur.length > 1) {
    const next = []
    for (let i = 0; i < cur.length; i += 2) next.push(i + 1 < cur.length ? merge(cur[i], cur[i + 1]) : cur[i])
    cur = next
  }
  return cur[0]
}
`,
    },
    brute: {
      python: String.raw`def merge_k_lists(lists):
    idx = [0] * len(lists)
    out = []
    while True:
        best = -1
        for i, lst in enumerate(lists):
            if idx[i] < len(lst) and (best == -1 or lst[idx[i]] < lists[best][idx[best]]):
                best = i
        if best == -1:
            return out
        out.append(lists[best][idx[best]])
        idx[best] += 1
`,
    },
  },

  /* ------------------------------------------------------------------ */
  {
    slug: 'count-smaller-after-self', title: 'Count of Smaller Numbers After Self', topic: 'Sorting', difficulty: 'hard',
    statement: 'Given an integer array nums, return an array counts where counts[i] is the number of elements to the right of nums[i] that are strictly smaller than nums[i].',
    examples: [
      { input: 'nums = [5,2,6,1]', output: '[2,1,1,0]', explain: 'Right of 5: 2 and 1 are smaller; right of 2: only 1; right of 6: only 1; right of 1: nothing.' },
      { input: 'nums = [-1,-1]', output: '[0,0]' },
    ],
    constraints: ['1 ≤ len(nums) ≤ 10⁵', '−10⁴ ≤ nums[i] ≤ 10⁴', 'Expected: O(n log n) — a Fenwick (binary indexed) tree or merge sort'],
    fn: { python: 'count_smaller', javascript: 'countSmaller' },
    compare: 'exact',
    tests: [
      { name: 'example 1', args: [[5, 2, 6, 1]], expected: [2, 1, 1, 0], sample: true },
      { name: 'example 2', args: [[-1, -1]], expected: [0, 0], sample: true },
      { name: 'single', args: [[-1]], expected: [0] },
      { name: 'ascending', args: [[1, 2, 3]], expected: [0, 0, 0] },
      { name: 'descending', args: [[3, 2, 1]], expected: [2, 1, 0] },
      { name: 'small mix', args: [[2, 0, 1]], expected: [2, 0, 0] },
      { name: 'equal values are not smaller', args: [[1, 1, 1, 0]], expected: [1, 1, 1, 0] },
      { name: '40 values', args: [[26, 78, 27, 100, 33, 67, 90, 23, 66, 5, 38, 7, 35, 23, 52, 22, 83, 51, 98, 69, 81, 32, 78, 28, 94, 13, 2, 97, 3, 76, 99, 51, 9, 21, 84, 66, 65, 36, 100, 41]] },
      { name: 'stress: 10⁵ random values', args: [{ $gen: 'ints', n: 100000, lo: -10000, hi: 10000, seed: 206 }], ...STRESS({ python: 6000, javascript: 1500 }) },
      { name: 'stress: 20,000 strictly decreasing values', args: [{ $gen: 'range', start: 10000, stop: -10000, step: -1 }], ...STRESS({ python: 6000, javascript: 1500 }) },
    ],
    solution: {
      python: String.raw`def count_smaller(nums):
    offset = 10001
    size = 20003
    tree = [0] * (size + 1)
    out = [0] * len(nums)
    for i in range(len(nums) - 1, -1, -1):
        v = nums[i] + offset
        j = v - 1
        s = 0
        while j > 0:
            s += tree[j]
            j -= j & -j
        out[i] = s
        j = v
        while j <= size:
            tree[j] += 1
            j += j & -j
    return out
`,
      javascript: String.raw`function countSmaller(nums) {
  const offset = 10001, size = 20003
  const tree = new Int32Array(size + 1)
  const out = new Array(nums.length).fill(0)
  for (let i = nums.length - 1; i >= 0; i--) {
    const v = nums[i] + offset
    let s = 0
    for (let j = v - 1; j > 0; j -= j & -j) s += tree[j]
    out[i] = s
    for (let j = v; j <= size; j += j & -j) tree[j]++
  }
  return out
}
`,
    },
    brute: {
      python: String.raw`def count_smaller(nums):
    n = len(nums)
    return [sum(1 for j in range(i + 1, n) if nums[j] < nums[i]) for i in range(n)]
`,
      javascript: String.raw`function countSmaller(nums) {
  const out = []
  for (let i = 0; i < nums.length; i++) { let c = 0; for (let j = i + 1; j < nums.length; j++) if (nums[j] < nums[i]) c++; out.push(c) }
  return out
}
`,
    },
  },

  /* ------------------------------------------------------------------ */
  {
    slug: 'longest-valid-parentheses', title: 'Longest Valid Parentheses', topic: 'Stacks', difficulty: 'hard',
    statement: "Given a string containing only '(' and ')', return the length of the longest valid (well-formed) parentheses substring.",
    examples: [
      { input: 's = "(()"', output: '2', explain: 'The longest valid substring is "()".' },
      { input: 's = ")()())"', output: '4', explain: 'The longest valid substring is "()()".' },
    ],
    constraints: ['0 ≤ len(s) ≤ 10⁵', "s[i] is '(' or ')'", 'Expected: O(n) — a stack of indices, DP, or two counter passes'],
    fn: { python: 'longest_valid_parentheses', javascript: 'longestValidParentheses' },
    compare: 'exact',
    tests: [
      { name: 'example 1', args: ['(()'], expected: 2, sample: true },
      { name: 'example 2', args: [')()())'], expected: 4, sample: true },
      { name: 'empty', args: [''], expected: 0 },
      { name: 'concatenated groups', args: ['()(())'], expected: 6 },
      { name: 'nested', args: ['(()())'], expected: 6 },
      { name: 'broken prefix', args: ['()(()'], expected: 2 },
      { name: 'reversed pair', args: [')('], expected: 0 },
      { name: 'only openers', args: ['((((('], expected: 0 },
      { name: 'mostly openers', args: ['(()(((()'], expected: 2 },
      { name: 'wrapped by strays', args: [')()(()))('], expected: 6 },
      { name: 'stress: 10⁵ random brackets', args: [{ $gen: 'str', n: 100000, alphabet: '()', seed: 207 }], ...STRESS() },
      { name: 'stress: 50,000 adjacent pairs', args: [{ $gen: 'strrepeat', value: '()', n: 50000 }], expected: 100000, ...STRESS() },
      { name: 'stress: 50,000-deep nesting', args: [{ $gen: 'concat', parts: [{ $gen: 'strrepeat', value: '(', n: 50000 }, { $gen: 'strrepeat', value: ')', n: 50000 }] }], expected: 100000, ...STRESS() },
    ],
    solution: {
      python: String.raw`def longest_valid_parentheses(s):
    stack = [-1]
    best = 0
    for i, ch in enumerate(s):
        if ch == '(':
            stack.append(i)
        else:
            stack.pop()
            if not stack:
                stack.append(i)
            else:
                best = max(best, i - stack[-1])
    return best
`,
      javascript: String.raw`function longestValidParentheses(s) {
  const stack = [-1]
  let best = 0
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') stack.push(i)
    else {
      stack.pop()
      if (!stack.length) stack.push(i)
      else best = Math.max(best, i - stack[stack.length - 1])
    }
  }
  return best
}
`,
    },
    brute: {
      python: String.raw`def longest_valid_parentheses(s):
    best = 0
    for i in range(len(s)):
        bal = 0
        for j in range(i, len(s)):
            bal += 1 if s[j] == '(' else -1
            if bal < 0:
                break
            if bal == 0:
                best = max(best, j - i + 1)
    return best
`,
      javascript: String.raw`function longestValidParentheses(s) {
  let best = 0
  for (let i = 0; i < s.length; i++) { let bal = 0; for (let j = i; j < s.length; j++) { bal += s[j] === '(' ? 1 : -1; if (bal < 0) break; if (bal === 0 && j - i + 1 > best) best = j - i + 1 } }
  return best
}
`,
    },
  },

  /* ------------------------------------------------------------------ */
  {
    slug: 'regex-matching', title: 'Regular Expression Matching', topic: 'Dynamic Programming', difficulty: 'hard',
    statement: "Implement regular-expression matching with support for '.' (matches any single character) and '*' (matches zero or more of the preceding element). The match must cover the entire input string, not just part of it.",
    examples: [
      { input: 's = "aa", p = "a"', output: 'false' },
      { input: 's = "aa", p = "a*"', output: 'true' },
      { input: 's = "ab", p = ".*"', output: 'true', explain: '".*" means zero or more of any character.' },
    ],
    constraints: ['0 ≤ len(s), len(p) ≤ 100', "s has lowercase letters; p has lowercase letters, '.' and '*'", "Every '*' follows a letter or '.'", 'Expected: O(len(s) × len(p)) DP — naive backtracking is exponential'],
    fn: { python: 'is_match', javascript: 'isMatch' },
    compare: 'exact',
    tests: [
      { name: 'example 1', args: ['aa', 'a'], expected: false, sample: true },
      { name: 'example 2', args: ['aa', 'a*'], expected: true, sample: true },
      { name: 'example 3', args: ['ab', '.*'], expected: true, sample: true },
      { name: 'star can be zero', args: ['aab', 'c*a*b'], expected: true },
      { name: 'mississippi', args: ['mississippi', 'mis*is*p*.'], expected: false },
      { name: 'empty string vs stars', args: ['', 'a*b*'], expected: true },
      { name: 'trailing literal', args: ['ab', '.*c'], expected: false },
      { name: 'star then literal', args: ['aaa', 'a*a'], expected: true },
      { name: 'optional tail', args: ['a', 'ab*'], expected: true },
      { name: 'both empty', args: ['', ''], expected: true },
      { name: 'empty pattern', args: ['a', ''], expected: false },
      { name: 'star of other letter', args: ['abcd', 'd*'], expected: false },
      { name: 'stress: catastrophic backtracking', args: [{ $gen: 'strrepeat', value: 'a', n: 30 }, 'a*a*a*a*a*a*a*a*a*a*a*a*c'], expected: false, ...STRESS() },
      { name: 'stress: 100-char string, 50 stars', args: [{ $gen: 'strrepeat', value: 'ab', n: 50 }, { $gen: 'concat', parts: [{ $gen: 'strrepeat', value: 'a*b*', n: 24 }, '.*c*'] }], expected: true, ...STRESS() },
    ],
    solution: {
      python: String.raw`def is_match(s, p):
    m, n = len(s), len(p)
    dp = [[False] * (n + 1) for _ in range(m + 1)]
    dp[m][n] = True
    for i in range(m, -1, -1):
        for j in range(n - 1, -1, -1):
            first = i < m and p[j] in (s[i], '.')
            if j + 1 < n and p[j + 1] == '*':
                dp[i][j] = dp[i][j + 2] or (first and dp[i + 1][j])
            else:
                dp[i][j] = first and dp[i + 1][j + 1]
    return dp[0][0]
`,
      javascript: String.raw`function isMatch(s, p) {
  const m = s.length, n = p.length
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(false))
  dp[m][n] = true
  for (let i = m; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      const first = i < m && (p[j] === s[i] || p[j] === '.')
      if (j + 1 < n && p[j + 1] === '*') dp[i][j] = dp[i][j + 2] || (first && dp[i + 1][j])
      else dp[i][j] = first && dp[i + 1][j + 1]
    }
  }
  return dp[0][0]
}
`,
    },
    brute: {
      python: String.raw`def is_match(s, p):
    if not p:
        return not s
    first = bool(s) and p[0] in (s[0], '.')
    if len(p) >= 2 and p[1] == '*':
        return is_match(s, p[2:]) or (first and is_match(s[1:], p))
    return first and is_match(s[1:], p[1:])
`,
      javascript: String.raw`function isMatch(s, p) {
  if (!p.length) return !s.length
  const first = s.length > 0 && (p[0] === s[0] || p[0] === '.')
  if (p.length >= 2 && p[1] === '*') return isMatch(s, p.slice(2)) || (first && isMatch(s.slice(1), p))
  return first && isMatch(s.slice(1), p.slice(1))
}
`,
    },
  },

  /* ------------------------------------------------------------------ */
  {
    slug: 'wildcard-matching', title: 'Wildcard Matching', topic: 'Dynamic Programming', difficulty: 'hard',
    statement: "Implement wildcard pattern matching with support for '?' (matches any single character) and '*' (matches any sequence of characters, including the empty sequence). The match must cover the entire input string.",
    examples: [
      { input: 's = "aa", p = "a"', output: 'false' },
      { input: 's = "aa", p = "*"', output: 'true' },
      { input: 's = "cb", p = "?a"', output: 'false', explain: "'?' matches 'c' but 'a' does not match 'b'." },
    ],
    constraints: ['0 ≤ len(s), len(p) ≤ 2000', "s has lowercase letters; p has lowercase letters, '?' and '*'", 'Expected: O(len(s) × len(p)) DP or a greedy two-pointer — naive backtracking is exponential'],
    fn: { python: 'is_match', javascript: 'isMatch' },
    compare: 'exact',
    tests: [
      { name: 'example 1', args: ['aa', 'a'], expected: false, sample: true },
      { name: 'example 2', args: ['aa', '*'], expected: true, sample: true },
      { name: 'example 3', args: ['cb', '?a'], expected: false, sample: true },
      { name: 'two stars', args: ['adceb', '*a*b'], expected: true },
      { name: 'star then ?', args: ['acdcb', 'a*c?b'], expected: false },
      { name: 'empty string, star', args: ['', '*'], expected: true },
      { name: 'both empty', args: ['', ''], expected: true },
      { name: 'empty pattern', args: ['abc', ''], expected: false },
      { name: 'long pattern', args: ['abefcdgiescdfimde', 'ab*cd?i*de'], expected: true },
      { name: 'mississippi', args: ['mississippi', 'm??*ss*?i*pi'], expected: false },
      { name: 'stress: exponential trap (2,000 chars)', args: [{ $gen: 'strrepeat', value: 'a', n: 2000 }, '*a*a*a*a*a*a*a*a*a*a*b'], expected: false, ...STRESS() },
      { name: 'stress: 2,000-char string, 901-char pattern', args: [{ $gen: 'strrepeat', value: 'ab', n: 1000 }, { $gen: 'concat', parts: [{ $gen: 'strrepeat', value: '*ab', n: 300 }, '*'] }], expected: true, ...STRESS() },
    ],
    solution: {
      python: String.raw`def is_match(s, p):
    i = j = 0
    star = -1
    mark = 0
    while i < len(s):
        if j < len(p) and (p[j] == '?' or p[j] == s[i]):
            i += 1
            j += 1
        elif j < len(p) and p[j] == '*':
            star = j
            mark = i
            j += 1
        elif star != -1:
            j = star + 1
            mark += 1
            i = mark
        else:
            return False
    while j < len(p) and p[j] == '*':
        j += 1
    return j == len(p)
`,
      javascript: String.raw`function isMatch(s, p) {
  let i = 0, j = 0, star = -1, mark = 0
  while (i < s.length) {
    if (j < p.length && (p[j] === '?' || p[j] === s[i])) { i++; j++ }
    else if (j < p.length && p[j] === '*') { star = j; mark = i; j++ }
    else if (star !== -1) { j = star + 1; mark++; i = mark }
    else return false
  }
  while (j < p.length && p[j] === '*') j++
  return j === p.length
}
`,
    },
    brute: {
      python: String.raw`def is_match(s, p):
    if not p:
        return not s
    if p[0] == '*':
        return is_match(s, p[1:]) or (bool(s) and is_match(s[1:], p))
    return bool(s) and p[0] in (s[0], '?') and is_match(s[1:], p[1:])
`,
    },
  },

  /* ------------------------------------------------------------------ */
  {
    slug: 'word-ladder', title: 'Word Ladder', topic: 'Graphs', difficulty: 'hard',
    statement: 'A transformation sequence from begin_word to end_word is a sequence of words in which every adjacent pair differs by exactly one letter and every word after begin_word appears in word_list (begin_word itself need not). Return the number of words in the shortest such sequence, or 0 if none exists.',
    examples: [
      { input: 'begin_word = "hit", end_word = "cog", word_list = ["hot","dot","dog","lot","log","cog"]', output: '5', explain: 'hit → hot → dot → dog → cog.' },
      { input: 'begin_word = "hit", end_word = "cog", word_list = ["hot","dot","dog","lot","log"]', output: '0', explain: '"cog" is not in the list.' },
    ],
    constraints: ['1 ≤ word length ≤ 10; all words have the same length', '1 ≤ len(word_list) ≤ 10⁴; words are lowercase and unique', 'begin_word ≠ end_word', 'Expected: BFS with wildcard buckets — O(N × L²)'],
    fn: { python: 'ladder_length', javascript: 'ladderLength' },
    compare: 'exact',
    tests: [
      { name: 'example 1', args: ['hit', 'cog', ['hot', 'dot', 'dog', 'lot', 'log', 'cog']], expected: 5, sample: true },
      { name: 'example 2', args: ['hit', 'cog', ['hot', 'dot', 'dog', 'lot', 'log']], expected: 0, sample: true },
      { name: 'one letter', args: ['a', 'c', ['a', 'b', 'c']], expected: 2 },
      { name: 'unreachable', args: ['hot', 'dog', ['hot', 'dog']], expected: 0 },
      { name: 'three steps', args: ['hot', 'dog', ['hot', 'dog', 'dot']], expected: 3 },
      { name: 'direct neighbour', args: ['lost', 'cost', ['most', 'fist', 'lost', 'cost', 'fish']], expected: 2 },
      { name: 'two equal routes', args: ['red', 'tax', ['ted', 'tex', 'red', 'tax', 'tad', 'den', 'rex', 'pee']], expected: 4 },
      { name: 'stress: 4,000 five-letter words', args: ['aaaaa', 'fffff', { $gen: 'concat', parts: [{ $gen: 'strs', n: 4000, len: 5, alphabet: 'abcdef', unique: true, seed: 208 }, ['fffff']] }], ...STRESS() },
      { name: 'stress: unreachable target among 10,000 words', args: ['aaaaaa', 'zzzzzz', { $gen: 'concat', parts: [{ $gen: 'strs', n: 10000, len: 6, alphabet: 'abcdefg', unique: true, seed: 216 }, ['zzzzzz']] }], expected: 0, ...STRESS() },
      { name: 'stress: 10,000 six-letter words', args: ['aaaaaa', 'gggggg', { $gen: 'concat', parts: [{ $gen: 'strs', n: 10000, len: 6, alphabet: 'abcdefg', unique: true, seed: 217 }, ['gggggg']] }], ...STRESS() },
    ],
    solution: {
      python: String.raw`from collections import deque, defaultdict

def ladder_length(begin_word, end_word, word_list):
    words = set(word_list)
    if end_word not in words:
        return 0
    L = len(begin_word)
    buckets = defaultdict(list)
    for w in words:
        for i in range(L):
            buckets[w[:i] + '*' + w[i + 1:]].append(w)
    seen = {begin_word}
    q = deque([(begin_word, 1)])
    while q:
        w, d = q.popleft()
        for i in range(L):
            key = w[:i] + '*' + w[i + 1:]
            for nxt in buckets.get(key, ()):
                if nxt == end_word:
                    return d + 1
                if nxt not in seen:
                    seen.add(nxt)
                    q.append((nxt, d + 1))
            buckets[key] = []
    return 0
`,
      javascript: String.raw`function ladderLength(beginWord, endWord, wordList) {
  const words = new Set(wordList)
  if (!words.has(endWord)) return 0
  const L = beginWord.length
  const buckets = new Map()
  for (const w of words) for (let i = 0; i < L; i++) {
    const key = w.slice(0, i) + '*' + w.slice(i + 1)
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(w)
  }
  const seen = new Set([beginWord])
  let q = [beginWord], d = 1
  while (q.length) {
    const next = []
    for (const w of q) {
      for (let i = 0; i < L; i++) {
        const key = w.slice(0, i) + '*' + w.slice(i + 1)
        for (const nxt of buckets.get(key) || []) {
          if (nxt === endWord) return d + 1
          if (!seen.has(nxt)) { seen.add(nxt); next.push(nxt) }
        }
        buckets.set(key, [])
      }
    }
    q = next
    d++
  }
  return 0
}
`,
    },
    brute: {
      python: String.raw`def ladder_length(begin_word, end_word, word_list):
    words = list(dict.fromkeys(word_list))
    if end_word not in words:
        return 0
    def adj(a, b):
        diff = 0
        for x, y in zip(a, b):
            if x != y:
                diff += 1
                if diff > 1:
                    return False
        return diff == 1
    frontier = [begin_word]
    seen = {begin_word}
    d = 1
    while frontier:
        nxt = []
        for w in frontier:
            for u in words:
                if u not in seen and adj(w, u):
                    if u == end_word:
                        return d + 1
                    seen.add(u)
                    nxt.append(u)
        frontier = nxt
        d += 1
    return 0
`,
    },
  },

  /* ------------------------------------------------------------------ */
  {
    slug: 'burst-balloons', title: 'Burst Balloons', topic: 'Dynamic Programming', difficulty: 'hard',
    statement: 'You are given n balloons with numbers nums[i]. Bursting balloon i earns nums[left] × nums[i] × nums[right] coins, where left and right are its current neighbours (a missing neighbour counts as 1). After a burst, its neighbours become adjacent. Return the maximum coins obtainable by bursting all the balloons.',
    examples: [
      { input: 'nums = [3,1,5,8]', output: '167', explain: '[3,1,5,8] → [3,5,8] → [3,8] → [8] → []: 3·1·5 + 3·5·8 + 1·3·8 + 1·8·1 = 167.' },
      { input: 'nums = [1,5]', output: '10' },
    ],
    constraints: ['1 ≤ n ≤ 150', '0 ≤ nums[i] ≤ 100', 'Expected: O(n³) interval DP — think about which balloon is burst LAST in each range'],
    fn: { python: 'max_coins', javascript: 'maxCoins' },
    compare: 'exact',
    tests: [
      { name: 'example 1', args: [[3, 1, 5, 8]], expected: 167, sample: true },
      { name: 'example 2', args: [[1, 5]], expected: 10, sample: true },
      { name: 'single', args: [[5]], expected: 5 },
      { name: 'zero', args: [[0]], expected: 0 },
      { name: 'pair', args: [[2, 3]], expected: 9 },
      { name: 'four values', args: [[9, 76, 64, 21]] },
      { name: 'eleven values with a zero', args: [[7, 9, 8, 0, 7, 1, 3, 5, 5, 2, 3]] },
      { name: 'stress: 150 balloons', args: [{ $gen: 'ints', n: 150, lo: 0, hi: 100, seed: 209 }], ...STRESS({ python: 6000, javascript: 1500 }) },
    ],
    solution: {
      python: String.raw`def max_coins(nums):
    a = [1] + list(nums) + [1]
    n = len(a)
    dp = [[0] * n for _ in range(n)]
    for length in range(2, n):
        for left in range(0, n - length):
            right = left + length
            al, ar = a[left], a[right]
            row = dp[left]
            best = 0
            for k in range(left + 1, right):
                v = row[k] + dp[k][right] + al * a[k] * ar
                if v > best:
                    best = v
            row[right] = best
    return dp[0][n - 1]
`,
      javascript: String.raw`function maxCoins(nums) {
  const a = [1, ...nums, 1], n = a.length
  const dp = Array.from({ length: n }, () => new Array(n).fill(0))
  for (let len = 2; len < n; len++) {
    for (let left = 0; left + len < n; left++) {
      const right = left + len
      let best = 0
      for (let k = left + 1; k < right; k++) {
        const v = dp[left][k] + dp[k][right] + a[left] * a[k] * a[right]
        if (v > best) best = v
      }
      dp[left][right] = best
    }
  }
  return dp[0][n - 1]
}
`,
    },
    brute: {
      python: String.raw`def max_coins(nums):
    def go(arr):
        if not arr:
            return 0
        best = 0
        for i in range(len(arr)):
            left = arr[i - 1] if i > 0 else 1
            right = arr[i + 1] if i + 1 < len(arr) else 1
            best = max(best, left * arr[i] * right + go(arr[:i] + arr[i + 1:]))
        return best
    return go(list(nums))
`,
    },
  },

  /* ------------------------------------------------------------------ */
  {
    slug: 'max-profit-job-scheduling', title: 'Maximum Profit in Job Scheduling', topic: 'Dynamic Programming', difficulty: 'hard',
    statement: 'Job i runs from start_time[i] to end_time[i] and earns profit[i]. Choose jobs with no overlapping time ranges to maximise the total profit. A job that ends at time X is compatible with a job that starts at X.',
    examples: [
      { input: 'start_time = [1,2,3,3], end_time = [3,4,5,6], profit = [50,10,40,70]', output: '120', explain: 'Jobs 1 and 4: 50 + 70.' },
      { input: 'start_time = [1,2,3,4,6], end_time = [3,5,10,6,9], profit = [20,20,100,70,60]', output: '150' },
    ],
    constraints: ['1 ≤ n ≤ 10⁵', '1 ≤ start_time[i] < end_time[i] ≤ 2 × 10⁹', '1 ≤ profit[i] ≤ 10⁴', 'Expected: O(n log n) — sort by end time, DP + binary search'],
    fn: { python: 'job_scheduling', javascript: 'jobScheduling' },
    compare: 'exact',
    tests: [
      { name: 'example 1', args: [[1, 2, 3, 3], [3, 4, 5, 6], [50, 10, 40, 70]], expected: 120, sample: true },
      { name: 'example 2', args: [[1, 2, 3, 4, 6], [3, 5, 10, 6, 9], [20, 20, 100, 70, 60]], expected: 150, sample: true },
      { name: 'all overlap', args: [[1, 1, 1], [2, 3, 4], [5, 6, 4]], expected: 6 },
      { name: 'single job', args: [[1], [2], [5]], expected: 5 },
      { name: 'end equals start', args: [[1, 2], [2, 3], [1, 1]], expected: 2 },
      { name: 'five jobs', args: [[4, 2, 4, 8, 2], [5, 5, 5, 10, 8], [1, 2, 8, 10, 4]], expected: 18 },
      { name: 'stress: 10⁵ jobs', args: [
        { $gen: 'col', index: 0, of: { $gen: 'intervals', n: 100000, lo: 1, hi: 1000000000, minLen: 1, maxLen: 1000000, seed: 210 } },
        { $gen: 'col', index: 1, of: { $gen: 'intervals', n: 100000, lo: 1, hi: 1000000000, minLen: 1, maxLen: 1000000, seed: 210 } },
        { $gen: 'ints', n: 100000, lo: 1, hi: 10000, seed: 211 },
      ], ...STRESS() },
    ],
    solution: {
      python: String.raw`import bisect

def job_scheduling(start_time, end_time, profit):
    jobs = sorted(zip(end_time, start_time, profit))
    ends = [e for e, _, _ in jobs]
    dp = [0] * (len(jobs) + 1)
    for i, (e, s, p) in enumerate(jobs):
        k = bisect.bisect_right(ends, s, 0, i)
        dp[i + 1] = max(dp[i], dp[k] + p)
    return dp[-1]
`,
      javascript: String.raw`function jobScheduling(startTime, endTime, profit) {
  const n = startTime.length
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => endTime[a] - endTime[b])
  const ends = idx.map((i) => endTime[i])
  const dp = new Array(n + 1).fill(0)
  for (let t = 0; t < n; t++) {
    const i = idx[t], s = startTime[i]
    let lo = 0, hi = t
    while (lo < hi) { const mid = (lo + hi) >> 1; if (ends[mid] <= s) lo = mid + 1; else hi = mid }
    dp[t + 1] = Math.max(dp[t], dp[lo] + profit[i])
  }
  return dp[n]
}
`,
    },
    brute: {
      python: String.raw`def job_scheduling(start_time, end_time, profit):
    jobs = sorted(zip(end_time, start_time, profit))
    dp = [0] * len(jobs)
    for i, (e, s, p) in enumerate(jobs):
        best = p
        for j in range(i):
            if jobs[j][0] <= s:
                best = max(best, dp[j] + p)
        dp[i] = max(best, dp[i - 1] if i else 0)
    return max(dp) if dp else 0
`,
      javascript: String.raw`function jobScheduling(st, en, pr) {
  const jobs = st.map((s, i) => [en[i], s, pr[i]]).sort((a, b) => a[0] - b[0])
  const dp = new Array(jobs.length).fill(0)
  for (let i = 0; i < jobs.length; i++) {
    let best = jobs[i][2]
    for (let j = 0; j < i; j++) if (jobs[j][0] <= jobs[i][1] && dp[j] + jobs[i][2] > best) best = dp[j] + jobs[i][2]
    dp[i] = Math.max(best, i ? dp[i - 1] : 0)
  }
  return jobs.length ? dp[jobs.length - 1] : 0
}
`,
    },
  },

  /* ------------------------------------------------------------------ */
  {
    slug: 'basic-calculator', title: 'Basic Calculator', topic: 'Stacks', difficulty: 'hard',
    statement: "Given a string s representing a valid expression, evaluate it and return the result. s contains non-negative integers (possibly with leading zeros), '+', '-', '(', ')' and spaces. '-' may also be a unary minus, as in \"-(2 + 3)\" or \"1 - (-2)\". You may NOT use a built-in evaluator such as eval().",
    examples: [
      { input: 's = "1 + 1"', output: '2' },
      { input: 's = " 2-1 + 2 "', output: '3' },
      { input: 's = "(1+(4+5+2)-3)+(6+8)"', output: '23' },
    ],
    constraints: ['1 ≤ len(s) ≤ 3 × 10⁵', 'Every number and intermediate result fits in a signed 32-bit integer', 'Parentheses nest at most 1000 deep', 'Expected: O(n) with a stack of signs'],
    fn: { python: 'calculate', javascript: 'calculate' },
    compare: 'exact',
    tests: [
      { name: 'example 1', args: ['1 + 1'], expected: 2, sample: true },
      { name: 'example 2', args: [' 2-1 + 2 '], expected: 3, sample: true },
      { name: 'example 3', args: ['(1+(4+5+2)-3)+(6+8)'], expected: 23, sample: true },
      { name: 'unary minus before a group', args: ['-(2+3)'], expected: -5 },
      { name: 'unary minus inside a group', args: ['1-(     -2)'], expected: 3 },
      { name: 'nested negation', args: ['- (3 + (4 + 5))'], expected: -12 },
      { name: 'max int', args: ['2147483647'], expected: 2147483647 },
      { name: 'alternating nesting', args: ['10 - (2 - (3 - 4))'], expected: 7 },
      { name: 'leading zeros', args: ['010 + 010'], expected: 20 },
      { name: 'stress: 50,001 terms', args: [{ $gen: 'concat', parts: [{ $gen: 'strrepeat', value: '1 + ', n: 50000 }, '1'] }], expected: 50001, ...STRESS() },
      { name: 'stress: 1,000-deep nesting', args: [{ $gen: 'concat', parts: [{ $gen: 'strrepeat', value: '(', n: 1000 }, '7', { $gen: 'strrepeat', value: ' - 1)', n: 1000 }] }], expected: -993, ...STRESS() },
    ],
    solution: {
      python: String.raw`def calculate(s):
    result = 0
    num = 0
    sign = 1
    stack = []
    for ch in s:
        if '0' <= ch <= '9':
            num = num * 10 + (ord(ch) - 48)
        elif ch == '+' or ch == '-':
            result += sign * num
            num = 0
            sign = 1 if ch == '+' else -1
        elif ch == '(':
            stack.append(result)
            stack.append(sign)
            result = 0
            sign = 1
        elif ch == ')':
            result += sign * num
            num = 0
            result *= stack.pop()
            result += stack.pop()
    return result + sign * num
`,
      javascript: String.raw`function calculate(s) {
  let result = 0, num = 0, sign = 1
  const stack = []
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c >= 48 && c <= 57) num = num * 10 + (c - 48)
    else if (c === 43 || c === 45) { result += sign * num; num = 0; sign = c === 43 ? 1 : -1 }
    else if (c === 40) { stack.push(result, sign); result = 0; sign = 1 }
    else if (c === 41) { result += sign * num; num = 0; result *= stack.pop(); result += stack.pop() }
  }
  return result + sign * num
}
`,
    },
  },

  /* ------------------------------------------------------------------ */
  {
    slug: 'russian-doll-envelopes', title: 'Russian Doll Envelopes', topic: 'Dynamic Programming', difficulty: 'hard',
    statement: 'envelopes[i] = [w, h]. One envelope fits inside another only if both its width and its height are strictly smaller. Return the maximum number of envelopes you can nest one inside another. Rotation is not allowed.',
    examples: [
      { input: 'envelopes = [[5,4],[6,4],[6,7],[2,3]]', output: '3', explain: '[2,3] → [5,4] → [6,7].' },
      { input: 'envelopes = [[1,1],[1,1],[1,1]]', output: '1' },
    ],
    constraints: ['1 ≤ n ≤ 10⁵', '1 ≤ w, h ≤ 10⁵', 'Expected: O(n log n) — sort by width ascending and height descending, then LIS on heights'],
    fn: { python: 'max_envelopes', javascript: 'maxEnvelopes' },
    compare: 'exact',
    tests: [
      { name: 'example 1', args: [[[5, 4], [6, 4], [6, 7], [2, 3]]], expected: 3, sample: true },
      { name: 'example 2', args: [[[1, 1], [1, 1], [1, 1]]], expected: 1, sample: true },
      { name: 'single', args: [[[1, 1]]], expected: 1 },
      { name: 'equal widths', args: [[[4, 5], [4, 6], [6, 7], [2, 3], [1, 1]]], expected: 4 },
      { name: 'six envelopes', args: [[[1, 3], [3, 5], [6, 7], [6, 8], [8, 4], [9, 5]]], expected: 3 },
      { name: 'equal-width traps', args: [[[2, 100], [3, 200], [4, 300], [5, 500], [5, 400], [5, 250], [6, 370], [6, 360], [7, 380]]], expected: 5 },
      { name: 'no nesting beyond two', args: [[[10, 8], [1, 12], [6, 15], [2, 18]]], expected: 2 },
      { name: 'stress: 10⁵ envelopes', args: [{ $gen: 'grid', rows: 100000, cols: 2, lo: 1, hi: 100000, seed: 212 }], ...STRESS() },
    ],
    solution: {
      python: String.raw`import bisect

def max_envelopes(envelopes):
    env = sorted(envelopes, key=lambda e: (e[0], -e[1]))
    tails = []
    for _, h in env:
        i = bisect.bisect_left(tails, h)
        if i == len(tails):
            tails.append(h)
        else:
            tails[i] = h
    return len(tails)
`,
      javascript: String.raw`function maxEnvelopes(envelopes) {
  const env = envelopes.slice().sort((a, b) => a[0] - b[0] || b[1] - a[1])
  const tails = []
  for (const [, h] of env) {
    let lo = 0, hi = tails.length
    while (lo < hi) { const mid = (lo + hi) >> 1; if (tails[mid] < h) lo = mid + 1; else hi = mid }
    tails[lo] = h
  }
  return tails.length
}
`,
    },
    brute: {
      python: String.raw`def max_envelopes(envelopes):
    env = sorted(envelopes)
    dp = [1] * len(env)
    for i in range(len(env)):
        for j in range(i):
            if env[j][0] < env[i][0] and env[j][1] < env[i][1]:
                dp[i] = max(dp[i], dp[j] + 1)
    return max(dp)
`,
      javascript: String.raw`function maxEnvelopes(e) {
  const env = e.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const dp = new Array(env.length).fill(1)
  let best = 1
  for (let i = 0; i < env.length; i++) { for (let j = 0; j < i; j++) if (env[j][0] < env[i][0] && env[j][1] < env[i][1] && dp[j] + 1 > dp[i]) dp[i] = dp[j] + 1; if (dp[i] > best) best = dp[i] }
  return best
}
`,
    },
  },

  /* ------------------------------------------------------------------ */
  {
    slug: 'split-array-largest-sum', title: 'Split Array Largest Sum', topic: 'Searching', difficulty: 'hard',
    statement: 'Given an integer array nums and an integer k, split nums into k non-empty contiguous subarrays so that the largest subarray sum is as small as possible. Return that minimised largest sum.',
    examples: [
      { input: 'nums = [7,2,5,10,8], k = 2', output: '18', explain: '[7,2,5] and [10,8].' },
      { input: 'nums = [1,2,3,4,5], k = 2', output: '9' },
    ],
    constraints: ['1 ≤ len(nums) ≤ 5 × 10⁴', '0 ≤ nums[i] ≤ 10⁶', '1 ≤ k ≤ min(50, len(nums))', 'Expected: binary search on the answer with a greedy check — O(n log(sum))'],
    fn: { python: 'split_array', javascript: 'splitArray' },
    compare: 'exact',
    tests: [
      { name: 'example 1', args: [[7, 2, 5, 10, 8], 2], expected: 18, sample: true },
      { name: 'example 2', args: [[1, 2, 3, 4, 5], 2], expected: 9, sample: true },
      { name: 'one per part', args: [[1, 4, 4], 3], expected: 4 },
      { name: 'single value', args: [[5], 1], expected: 5 },
      { name: 'all ones', args: [[1, 1, 1, 1], 4], expected: 1 },
      { name: 'many parts', args: [[2, 3, 1, 2, 4, 3], 5], expected: 4 },
      { name: 'zeros', args: [[0, 0, 0], 2], expected: 0 },
      { name: 'fourteen values', args: [[10, 5, 13, 4, 8, 4, 5, 11, 14, 9, 16, 10, 20, 8], 8] },
      { name: 'stress: 5 × 10⁴ values, k = 50', args: [{ $gen: 'ints', n: 50000, lo: 0, hi: 1000000, seed: 213 }, 50], ...STRESS({ python: 6000, javascript: 1500 }) },
    ],
    solution: {
      python: String.raw`def split_array(nums, k):
    def pieces(limit):
        count, cur = 1, 0
        for x in nums:
            if cur + x > limit:
                count += 1
                cur = x
            else:
                cur += x
        return count
    lo, hi = max(nums), sum(nums)
    while lo < hi:
        mid = (lo + hi) // 2
        if pieces(mid) <= k:
            hi = mid
        else:
            lo = mid + 1
    return lo
`,
      javascript: String.raw`function splitArray(nums, k) {
  let lo = Math.max(...nums), hi = nums.reduce((a, b) => a + b, 0)
  const pieces = (limit) => { let count = 1, cur = 0; for (const x of nums) { if (cur + x > limit) { count++; cur = x } else cur += x } return count }
  while (lo < hi) { const mid = Math.floor((lo + hi) / 2); if (pieces(mid) <= k) hi = mid; else lo = mid + 1 }
  return lo
}
`,
    },
    brute: {
      python: String.raw`def split_array(nums, k):
    n = len(nums)
    pre = [0]
    for x in nums:
        pre.append(pre[-1] + x)
    INF = float('inf')
    dp = [[INF] * (n + 1) for _ in range(k + 1)]
    dp[0][0] = 0
    for parts in range(1, k + 1):
        for i in range(1, n + 1):
            for j in range(parts - 1, i):
                dp[parts][i] = min(dp[parts][i], max(dp[parts - 1][j], pre[i] - pre[j]))
    return dp[k][n]
`,
    },
  },

  /* ------------------------------------------------------------------ */
  {
    slug: 'longest-increasing-path-matrix', title: 'Longest Increasing Path in a Matrix', topic: 'Graphs', difficulty: 'hard',
    statement: 'Given an m × n integer matrix, return the length of the longest strictly increasing path. From each cell you can move up, down, left or right — no diagonal moves and no wrap-around.',
    examples: [
      { input: 'matrix = [[9,9,4],[6,6,8],[2,1,1]]', output: '4', explain: '1 → 2 → 6 → 9.' },
      { input: 'matrix = [[3,4,5],[3,2,6],[2,2,1]]', output: '4', explain: '3 → 4 → 5 → 6.' },
    ],
    constraints: ['1 ≤ m, n ≤ 200', '0 ≤ matrix[i][j] ≤ 2³¹ − 1', 'Expected: O(m × n) — DFS with memoisation or a topological BFS'],
    fn: { python: 'longest_increasing_path', javascript: 'longestIncreasingPath' },
    compare: 'exact',
    tests: [
      { name: 'example 1', args: [[[9, 9, 4], [6, 6, 8], [2, 1, 1]]], expected: 4, sample: true },
      { name: 'example 2', args: [[[3, 4, 5], [3, 2, 6], [2, 2, 1]]], expected: 4, sample: true },
      { name: 'single cell', args: [[[1]]], expected: 1 },
      { name: 'two cells', args: [[[1, 2]]], expected: 2 },
      { name: 'plateau', args: [[[7, 7, 7]]], expected: 1 },
      { name: 'snake', args: [[[1, 2, 3], [6, 5, 4], [7, 8, 9]]], expected: 9 },
      { name: 'stress: 150 × 150 increasing ramp', args: [{ $gen: 'affine', rows: 150, cols: 150, a: 150, b: 1 }], expected: 299, ...STRESS() },
      { name: 'stress: 200 × 200 random', args: [{ $gen: 'grid', rows: 200, cols: 200, lo: 0, hi: 1000000, seed: 214 }], ...STRESS() },
    ],
    solution: {
      python: String.raw`from collections import deque

def longest_increasing_path(matrix):
    m, n = len(matrix), len(matrix[0])
    dirs = ((1, 0), (-1, 0), (0, 1), (0, -1))
    indeg = [[0] * n for _ in range(m)]
    for i in range(m):
        for j in range(n):
            v = matrix[i][j]
            for di, dj in dirs:
                x, y = i + di, j + dj
                if 0 <= x < m and 0 <= y < n and matrix[x][y] < v:
                    indeg[i][j] += 1
    q = deque((i, j) for i in range(m) for j in range(n) if indeg[i][j] == 0)
    length = 0
    while q:
        length += 1
        for _ in range(len(q)):
            i, j = q.popleft()
            v = matrix[i][j]
            for di, dj in dirs:
                x, y = i + di, j + dj
                if 0 <= x < m and 0 <= y < n and matrix[x][y] > v:
                    indeg[x][y] -= 1
                    if indeg[x][y] == 0:
                        q.append((x, y))
    return length
`,
      javascript: String.raw`function longestIncreasingPath(matrix) {
  const m = matrix.length, n = matrix[0].length
  const memo = Array.from({ length: m }, () => new Array(n).fill(0))
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]]
  const dfs = (i, j) => {
    if (memo[i][j]) return memo[i][j]
    let best = 1
    for (const [di, dj] of dirs) {
      const x = i + di, y = j + dj
      if (x >= 0 && x < m && y >= 0 && y < n && matrix[x][y] > matrix[i][j]) best = Math.max(best, 1 + dfs(x, y))
    }
    return (memo[i][j] = best)
  }
  let ans = 0
  for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) ans = Math.max(ans, dfs(i, j))
  return ans
}
`,
    },
    brute: {
      python: String.raw`def longest_increasing_path(matrix):
    m, n = len(matrix), len(matrix[0])
    def dfs(i, j):
        best = 1
        for x, y in ((i + 1, j), (i - 1, j), (i, j + 1), (i, j - 1)):
            if 0 <= x < m and 0 <= y < n and matrix[x][y] > matrix[i][j]:
                best = max(best, 1 + dfs(x, y))
        return best
    return max(dfs(i, j) for i in range(m) for j in range(n))
`,
    },
  },

  /* ------------------------------------------------------------------ */
  {
    slug: 'trapping-rain-water-ii', title: 'Trapping Rain Water II', topic: 'Heaps', difficulty: 'hard',
    statement: 'Given an m × n matrix of non-negative integers representing the height of each unit cell in a 2D elevation map, return the volume of water it can trap after raining. Water spills off the edges of the map, so border cells never hold water.',
    examples: [
      { input: 'height_map = [[1,4,3,1,3,2],[3,2,1,3,2,4],[2,3,3,2,3,1]]', output: '4' },
      { input: 'height_map = [[3,3,3,3,3],[3,2,2,2,3],[3,2,1,2,3],[3,2,2,2,3],[3,3,3,3,3]]', output: '10' },
    ],
    constraints: ['1 ≤ m, n ≤ 200', '0 ≤ height_map[i][j] ≤ 2 × 10⁴', 'Expected: O(mn log(mn)) — flood inward from the border with a min-heap'],
    fn: { python: 'trap_rain_water', javascript: 'trapRainWater' },
    compare: 'exact',
    tests: [
      { name: 'example 1', args: [[[1, 4, 3, 1, 3, 2], [3, 2, 1, 3, 2, 4], [2, 3, 3, 2, 3, 1]]], expected: 4, sample: true },
      { name: 'example 2', args: [[[3, 3, 3, 3, 3], [3, 2, 2, 2, 3], [3, 2, 1, 2, 3], [3, 2, 2, 2, 3], [3, 3, 3, 3, 3]]], expected: 10, sample: true },
      { name: 'single cell', args: [[[1]]], expected: 0 },
      { name: 'one well', args: [[[5, 5, 5], [5, 1, 5], [5, 5, 5]]], expected: 4 },
      { name: 'leaky wall', args: [[[12, 13, 1, 12], [13, 4, 13, 12], [13, 8, 10, 12], [12, 13, 12, 12], [13, 13, 13, 13]]], expected: 14 },
      { name: 'flat', args: [[[2, 2, 2], [2, 2, 2]]], expected: 0 },
      { name: 'two wells', args: [[[9, 9, 9, 9], [9, 1, 2, 9], [9, 9, 9, 9]]], expected: 15 },
      { name: 'stress: 200 × 200 random terrain', args: [{ $gen: 'grid', rows: 200, cols: 200, lo: 0, hi: 20000, seed: 215 }], ...STRESS() },
    ],
    solution: {
      python: String.raw`import heapq

def trap_rain_water(height_map):
    m, n = len(height_map), len(height_map[0])
    if m < 3 or n < 3:
        return 0
    seen = [[False] * n for _ in range(m)]
    heap = []
    for i in range(m):
        for j in range(n):
            if i in (0, m - 1) or j in (0, n - 1):
                heapq.heappush(heap, (height_map[i][j], i, j))
                seen[i][j] = True
    water = 0
    while heap:
        h, i, j = heapq.heappop(heap)
        for x, y in ((i + 1, j), (i - 1, j), (i, j + 1), (i, j - 1)):
            if 0 <= x < m and 0 <= y < n and not seen[x][y]:
                seen[x][y] = True
                cell = height_map[x][y]
                if cell < h:
                    water += h - cell
                heapq.heappush(heap, (max(h, cell), x, y))
    return water
`,
      javascript: String.raw`function trapRainWater(heightMap) {
  const m = heightMap.length, n = heightMap[0].length
  if (m < 3 || n < 3) return 0
  const seen = Array.from({ length: m }, () => new Array(n).fill(false))
  const heap = []
  const push = (item) => {
    heap.push(item)
    let i = heap.length - 1
    while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p }
  }
  const pop = () => {
    const top = heap[0], last = heap.pop()
    if (heap.length) {
      heap[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1, r = l + 1
        let s = i
        if (l < heap.length && heap[l][0] < heap[s][0]) s = l
        if (r < heap.length && heap[r][0] < heap[s][0]) s = r
        if (s === i) break
        ;[heap[s], heap[i]] = [heap[i], heap[s]]
        i = s
      }
    }
    return top
  }
  for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) if (i === 0 || i === m - 1 || j === 0 || j === n - 1) { push([heightMap[i][j], i, j]); seen[i][j] = true }
  let water = 0
  while (heap.length) {
    const [h, i, j] = pop()
    for (const [x, y] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) {
      if (x >= 0 && x < m && y >= 0 && y < n && !seen[x][y]) {
        seen[x][y] = true
        const cell = heightMap[x][y]
        if (cell < h) water += h - cell
        push([Math.max(h, cell), x, y])
      }
    }
  }
  return water
}
`,
    },
  },

  /* ------------------------------------------------------------------ */
  {
    slug: 'sliding-window-median', title: 'Sliding Window Median', topic: 'Heaps', difficulty: 'hard',
    statement: 'Given an integer array nums and a positive window size k, move a window of exactly k consecutive elements from left to right. Return the median after each move. For an odd-sized window, the median is its middle sorted value; for an even-sized window, it is the arithmetic mean of the two middle values. The result must preserve window order. Target O(n log k) time and O(n) or better auxiliary space; sorting every window is too slow at the upper limit.',
    examples: [
      { input: 'nums = [1,3,-1,-3,5,3,6,7], k = 3', output: '[1,-1,-1,3,5,6]', explain: 'The windows are [1,3,-1], [3,-1,-3], [-1,-3,5], [-3,5,3], [5,3,6], and [3,6,7].' },
      { input: 'nums = [1,2,3,4], k = 2', output: '[1.5,2.5,3.5]' },
    ],
    constraints: ['1 ≤ len(nums) ≤ 10⁵', '1 ≤ k ≤ len(nums)', '−10⁹ ≤ nums[i] ≤ 10⁹', 'Expected: O(n log k) time; a dual heap with lazy deletion is one suitable approach', 'Duplicates and stale heap entries must not corrupt the logical window sizes'],
    fn: { python: 'median_sliding_window', javascript: 'medianSlidingWindow' },
    compare: 'exact',
    tests: [
      { name: 'example 1', args: [[1, 3, -1, -3, 5, 3, 6, 7], 3], expected: [1, -1, -1, 3, 5, 6], sample: true },
      { name: 'example 2: even windows', args: [[1, 2, 3, 4], 2], expected: [1.5, 2.5, 3.5], sample: true },
      { name: 'window of one', args: [[7, -2, 9], 1], expected: [7, -2, 9] },
      { name: 'window is the whole array', args: [[-5, 0, 10, 20], 4], expected: [5] },
      { name: 'all equal with duplicate expiry', args: [[4, 4, 4, 4, 4], 3], expected: [4, 4, 4] },
      { name: 'duplicates cross both heaps', args: [[1, 1, 1, 2, 2, 2, 0, 0], 3], expected: [1, 1, 2, 2, 2, 0] },
      { name: 'negative and fractional medians', args: [[-8, -3, -5, -1, -10, 2], 4], expected: [-4, -4, -3] },
      { name: 'stress: 50,000 random values, k = 5,001', args: [{ $gen: 'ints', n: 50000, lo: -1000000, hi: 1000000, seed: 601 }, 5001], ...STRESS() },
      { name: 'stress: 100,000 increasing values, k = 999', args: [{ $gen: 'range', start: -50000, stop: 50000 }, 999], ...STRESS() },
    ],
    solution: {
      python: String.raw`import heapq

def median_sliding_window(nums, k):
    if not nums or k <= 0 or k > len(nums):
        return []
    lower = []                 # max-heap encoded as negative values
    upper = []                 # min-heap
    delayed = {}
    lower_size = upper_size = 0

    def prune(heap, sign):
        while heap:
            value = sign * heap[0]
            count = delayed.get(value, 0)
            if count == 0:
                break
            heapq.heappop(heap)
            if count == 1:
                del delayed[value]
            else:
                delayed[value] = count - 1

    def rebalance():
        nonlocal lower_size, upper_size
        prune(lower, -1)
        prune(upper, 1)
        if lower_size > upper_size + 1:
            value = -heapq.heappop(lower)
            lower_size -= 1
            heapq.heappush(upper, value)
            upper_size += 1
            prune(lower, -1)
        elif lower_size < upper_size:
            value = heapq.heappop(upper)
            upper_size -= 1
            heapq.heappush(lower, -value)
            lower_size += 1
            prune(upper, 1)

    def add(value):
        nonlocal lower_size, upper_size
        prune(lower, -1)
        if not lower or value <= -lower[0]:
            heapq.heappush(lower, -value)
            lower_size += 1
        else:
            heapq.heappush(upper, value)
            upper_size += 1
        rebalance()

    def remove(value):
        nonlocal lower_size, upper_size
        prune(lower, -1)
        prune(upper, 1)
        delayed[value] = delayed.get(value, 0) + 1
        if value <= -lower[0]:
            lower_size -= 1
            if value == -lower[0]:
                prune(lower, -1)
        else:
            upper_size -= 1
            if upper and value == upper[0]:
                prune(upper, 1)
        rebalance()

    def median():
        prune(lower, -1)
        prune(upper, 1)
        if k % 2:
            return float(-lower[0])
        return (-lower[0] + upper[0]) / 2.0

    result = []
    for i, value in enumerate(nums):
        add(value)
        if i >= k:
            remove(nums[i - k])
        if i >= k - 1:
            result.append(median())
    return result
`,
      javascript: String.raw`function medianSlidingWindow(nums, k) {
  if (!nums.length || k <= 0 || k > nums.length) return []
  const lower = [] // max-heap encoded as negative values
  const upper = [] // min-heap
  const delayed = new Map()
  let lowerSize = 0, upperSize = 0
  const push = (heap, value) => {
    heap.push(value)
    let i = heap.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (heap[parent] <= heap[i]) break
      ;[heap[parent], heap[i]] = [heap[i], heap[parent]]
      i = parent
    }
  }
  const pop = (heap) => {
    const first = heap[0], last = heap.pop()
    if (heap.length) {
      heap[0] = last
      let i = 0
      for (;;) {
        const left = i * 2 + 1, right = left + 1
        let smallest = i
        if (left < heap.length && heap[left] < heap[smallest]) smallest = left
        if (right < heap.length && heap[right] < heap[smallest]) smallest = right
        if (smallest === i) break
        ;[heap[i], heap[smallest]] = [heap[smallest], heap[i]]
        i = smallest
      }
    }
    return first
  }
  const prune = (heap, sign) => {
    while (heap.length) {
      const value = sign * heap[0]
      const count = delayed.get(value) || 0
      if (!count) break
      pop(heap)
      if (count === 1) delayed.delete(value)
      else delayed.set(value, count - 1)
    }
  }
  const rebalance = () => {
    prune(lower, -1); prune(upper, 1)
    if (lowerSize > upperSize + 1) {
      const value = -pop(lower)
      lowerSize--; push(upper, value); upperSize++
      prune(lower, -1)
    } else if (lowerSize < upperSize) {
      const value = pop(upper)
      upperSize--; push(lower, -value); lowerSize++
      prune(upper, 1)
    }
  }
  const add = (value) => {
    prune(lower, -1)
    if (!lower.length || value <= -lower[0]) { push(lower, -value); lowerSize++ }
    else { push(upper, value); upperSize++ }
    rebalance()
  }
  const remove = (value) => {
    prune(lower, -1); prune(upper, 1)
    delayed.set(value, (delayed.get(value) || 0) + 1)
    if (value <= -lower[0]) {
      lowerSize--
      if (value === -lower[0]) prune(lower, -1)
    } else {
      upperSize--
      if (upper.length && value === upper[0]) prune(upper, 1)
    }
    rebalance()
  }
  const median = () => {
    prune(lower, -1); prune(upper, 1)
    return k % 2 ? -lower[0] : (-lower[0] + upper[0]) / 2
  }
  const result = []
  for (let i = 0; i < nums.length; i++) {
    add(nums[i])
    if (i >= k) remove(nums[i - k])
    if (i >= k - 1) result.push(median())
  }
  return result
}
`,
    },
    brute: {
      python: String.raw`def median_sliding_window(nums, k):
    result = []
    for start in range(len(nums) - k + 1):
        window = sorted(nums[start:start + k])
        mid = k // 2
        result.append(float(window[mid]) if k % 2 else (window[mid - 1] + window[mid]) / 2.0)
    return result
`,
      javascript: String.raw`function medianSlidingWindow(nums, k) {
  const result = []
  for (let start = 0; start + k <= nums.length; start++) {
    const window = nums.slice(start, start + k).sort((a, b) => a - b)
    const mid = Math.floor(k / 2)
    result.push(k % 2 ? window[mid] : (window[mid - 1] + window[mid]) / 2)
  }
  return result
}
`,
    },
  },

  /* ------------------------------------------------------------------ */
  {
    slug: 'critical-connections-network', title: 'Critical Connections in a Network', topic: 'Graphs', difficulty: 'hard',
    statement: 'An undirected network has n numbered vertices and a list of connections. A connection is critical if removing that specific edge increases the number of connected components. Return all critical connections as [u,v] pairs with u < v, sorted lexicographically. The network may be disconnected and may contain parallel connections between the same two vertices, so track parent edge IDs rather than skipping every edge to the parent vertex. Your algorithm should be linear in the network size and must not rely on recursion deep enough to fail on a long path.',
    examples: [
      { input: 'n = 4, connections = [[0,1],[1,2],[2,0],[1,3]]', output: '[[1,3]]', explain: 'The triangle remains connected after any one of its edges is removed; edge [1,3] is the only bridge.' },
      { input: 'n = 5, connections = [[0,1],[1,2],[2,3],[3,4]]', output: '[[0,1],[1,2],[2,3],[3,4]]' },
    ],
    constraints: ['1 ≤ n ≤ 10⁵', '0 ≤ len(connections) ≤ 2 × 10⁵', 'Each connection is [u,v] with 0 ≤ u,v < n; self-loops are not included', 'Parallel edges are allowed and are distinct connections', 'Expected: O(n + m) time using discovery/low-link values; O(n + m) space'],
    fn: { python: 'critical_connections', javascript: 'criticalConnections' },
    compare: 'exact',
    tests: [
      { name: 'example 1: one bridge outside a cycle', args: [4, [[0, 1], [1, 2], [2, 0], [1, 3]]], expected: [[1, 3]], sample: true },
      { name: 'example 2: a path', args: [5, [[0, 1], [1, 2], [2, 3], [3, 4]]], expected: [[0, 1], [1, 2], [2, 3], [3, 4]], sample: true },
      { name: 'one cycle and an isolated vertex', args: [4, [[0, 1], [1, 2], [2, 0]]], expected: [] },
      { name: 'disconnected components', args: [7, [[0, 1], [1, 2], [2, 0], [3, 4], [4, 5]]], expected: [[3, 4], [4, 5]] },
      { name: 'parallel edge is not a bridge', args: [3, [[0, 1], [0, 1], [1, 2]]], expected: [[1, 2]] },
      { name: 'two cycles joined at an articulation vertex', args: [5, [[0, 1], [1, 2], [2, 0], [2, 3], [3, 4], [4, 2]]], expected: [] },
      { name: 'isolated vertices only', args: [4, []], expected: [] },
      { name: 'stress: 3,000-vertex path (iterative DFS)', args: [3000, { $gen: 'zip', parts: [{ $gen: 'range', start: 0, stop: 2999 }, { $gen: 'range', start: 1, stop: 3000 }] }], ...STRESS() },
    ],
    solution: {
      python: String.raw`def critical_connections(n, connections):
    graph = [[] for _ in range(n)]
    for edge_id, (u, v) in enumerate(connections):
        graph[u].append((v, edge_id))
        graph[v].append((u, edge_id))
    discovery = [-1] * n
    low = [0] * n
    parent = [-1] * n
    parent_edge = [-1] * n
    bridges = []
    clock = 0

    for root in range(n):
        if discovery[root] != -1:
            continue
        discovery[root] = low[root] = clock
        clock += 1
        stack = [(root, 0)]
        while stack:
            node, next_index = stack[-1]
            if next_index < len(graph[node]):
                neighbor, edge_id = graph[node][next_index]
                stack[-1] = (node, next_index + 1)
                if edge_id == parent_edge[node]:
                    continue
                if discovery[neighbor] == -1:
                    parent[neighbor] = node
                    parent_edge[neighbor] = edge_id
                    discovery[neighbor] = low[neighbor] = clock
                    clock += 1
                    stack.append((neighbor, 0))
                else:
                    low[node] = min(low[node], discovery[neighbor])
            else:
                stack.pop()
                ancestor = parent[node]
                if ancestor != -1:
                    if low[node] > discovery[ancestor]:
                        bridges.append([min(node, ancestor), max(node, ancestor)])
                    low[ancestor] = min(low[ancestor], low[node])
    bridges.sort()
    return bridges
`,
      javascript: String.raw`function criticalConnections(n, connections) {
  const graph = Array.from({ length: n }, () => [])
  for (let edgeId = 0; edgeId < connections.length; edgeId++) {
    const [u, v] = connections[edgeId]
    graph[u].push([v, edgeId]); graph[v].push([u, edgeId])
  }
  const discovery = new Array(n).fill(-1), low = new Array(n).fill(0)
  const parent = new Array(n).fill(-1), parentEdge = new Array(n).fill(-1)
  const bridges = []
  let clock = 0
  for (let root = 0; root < n; root++) {
    if (discovery[root] !== -1) continue
    discovery[root] = low[root] = clock++
    const stack = [[root, 0]]
    while (stack.length) {
      const top = stack.length - 1
      const node = stack[top][0], nextIndex = stack[top][1]
      if (nextIndex < graph[node].length) {
        const [neighbor, edgeId] = graph[node][nextIndex]
        stack[top][1]++
        if (edgeId === parentEdge[node]) continue
        if (discovery[neighbor] === -1) {
          parent[neighbor] = node; parentEdge[neighbor] = edgeId
          discovery[neighbor] = low[neighbor] = clock++
          stack.push([neighbor, 0])
        } else {
          low[node] = Math.min(low[node], discovery[neighbor])
        }
      } else {
        stack.pop()
        const ancestor = parent[node]
        if (ancestor !== -1) {
          if (low[node] > discovery[ancestor]) bridges.push([Math.min(node, ancestor), Math.max(node, ancestor)])
          low[ancestor] = Math.min(low[ancestor], low[node])
        }
      }
    }
  }
  bridges.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  return bridges
}
`,
    },
  },

  /* ------------------------------------------------------------------ */
  {
    slug: 'word-ladder-ii', title: 'Word Ladder II', topic: 'Graphs', difficulty: 'hard',
    statement: 'Given beginWord, endWord and a dictionary wordList, return every shortest transformation sequence from beginWord to endWord. Each step must change exactly one lowercase English letter, and every intermediate word (including endWord) must belong to wordList; beginWord does not need to be present. Return an empty list when the end is unreachable. If beginWord equals endWord, return the one-word sequence. Preserve word order within each path, but the outer list may be in any order. A breadth-first search should stop after the first complete level that reaches endWord while retaining every predecessor at that level; then reconstruct paths through the resulting parent DAG. Avoid exploring exponentially many non-shortest walks.',
    examples: [
      { input: 'beginWord = "hit", endWord = "cog", wordList = ["hot","dot","dog","lot","log","cog"]', output: '[["hit","hot","dot","dog","cog"],["hit","hot","lot","log","cog"]]' },
      { input: 'beginWord = "aaa", endWord = "bbb", wordList = ["aab","aba","baa","abb","bab","bba","bbb"]', output: 'all six shortest orders for changing the three positions from a to b' },
    ],
    constraints: ['1 ≤ len(beginWord) = len(endWord) ≤ 10', '1 ≤ len(wordList) ≤ 5,000', 'All words contain lowercase English letters and have the same length', 'Return every shortest path exactly once; the number of paths can be greater than one', 'Expected: breadth-first search over word transformations plus path reconstruction; account for output size'],
    fn: { python: 'find_ladders', javascript: 'findLadders' },
    compare: 'unordered',
    tests: [
      { name: 'example 1: two shortest ladders', args: ['hit', 'cog', ['hot', 'dot', 'dog', 'lot', 'log', 'cog']], expected: [['hit', 'hot', 'dot', 'dog', 'cog'], ['hit', 'hot', 'lot', 'log', 'cog']], sample: true },
      { name: 'example 2: six shortest ladders', args: ['aaa', 'bbb', ['aab', 'aba', 'baa', 'abb', 'bab', 'bba', 'bbb']], expected: [['aaa', 'aab', 'abb', 'bbb'], ['aaa', 'aab', 'bab', 'bbb'], ['aaa', 'aba', 'abb', 'bbb'], ['aaa', 'aba', 'bba', 'bbb'], ['aaa', 'baa', 'bab', 'bbb'], ['aaa', 'baa', 'bba', 'bbb']], sample: true },
      { name: 'end word missing', args: ['hit', 'cog', ['hot', 'dot', 'dog', 'lot', 'log']], expected: [] },
      { name: 'unreachable despite present endpoint', args: ['aaa', 'bbb', ['bbb', 'ccc']], expected: [] },
      { name: 'direct transformation', args: ['cat', 'cot', ['cot']], expected: [['cat', 'cot']] },
      { name: 'begin equals end', args: ['same', 'same', ['lame', 'came']], expected: [['same']] },
      { name: 'duplicate dictionary entries do not duplicate paths', args: ['aab', 'bbb', ['abb', 'bab', 'bbb', 'abb', 'bab']], expected: [['aab', 'abb', 'bbb'], ['aab', 'bab', 'bbb']] },
      { name: 'stress: all 4,096 six-letter words over abcd', args: ['aaaaaa', 'dddddd', (() => { const out = ['']; for (let i = 0; i < 6; i++) { const next = []; for (const prefix of out) for (const ch of 'abcd') next.push(prefix + ch); out.splice(0, out.length, ...next) } return out })()], ...STRESS({ python: 12000, javascript: 10000, java: 12000, c: 12000, cpp: 12000, rust: 12000, go: 12000 }) },
    ],
    solution: {
      python: String.raw`def find_ladders(begin_word, end_word, word_list):
    if begin_word == end_word:
        return [[begin_word]]
    words = set(word_list)
    if end_word not in words:
        return []
    words.discard(begin_word)
    parents = {}
    frontier = {begin_word}
    found = False
    alphabet = 'abcdefghijklmnopqrstuvwxyz'
    while frontier and not found:
        next_frontier = set()
        for word in frontier:
            chars = list(word)
            for i, original in enumerate(chars):
                for letter in alphabet:
                    if letter == original:
                        continue
                    chars[i] = letter
                    candidate = ''.join(chars)
                    if candidate in words:
                        next_frontier.add(candidate)
                        parents.setdefault(candidate, []).append(word)
                chars[i] = original
        words.difference_update(next_frontier)
        if end_word in next_frontier:
            found = True
        frontier = next_frontier
    if not found:
        return []
    result = []
    path = [end_word]
    def build(word):
        if word == begin_word:
            result.append(path[::-1])
            return
        for previous in sorted(parents.get(word, [])):
            path.append(previous)
            build(previous)
            path.pop()
    build(end_word)
    return result
`,
      javascript: String.raw`function findLadders(beginWord, endWord, wordList) {
  if (beginWord === endWord) return [[beginWord]]
  const words = new Set(wordList)
  if (!words.has(endWord)) return []
  words.delete(beginWord)
  const parents = new Map()
  let frontier = new Set([beginWord]), found = false
  const alphabet = 'abcdefghijklmnopqrstuvwxyz'
  while (frontier.size && !found) {
    const nextFrontier = new Set()
    for (const word of frontier) {
      const chars = word.split('')
      for (let i = 0; i < chars.length; i++) {
        const original = chars[i]
        for (const letter of alphabet) {
          if (letter === original) continue
          chars[i] = letter
          const candidate = chars.join('')
          if (words.has(candidate)) {
            nextFrontier.add(candidate)
            if (!parents.has(candidate)) parents.set(candidate, [])
            parents.get(candidate).push(word)
          }
        }
        chars[i] = original
      }
    }
    for (const word of nextFrontier) words.delete(word)
    if (nextFrontier.has(endWord)) found = true
    frontier = nextFrontier
  }
  if (!found) return []
  const result = [], path = [endWord]
  const build = (word) => {
    if (word === beginWord) { result.push(path.slice().reverse()); return }
    const previousWords = (parents.get(word) || []).slice().sort()
    for (const previous of previousWords) { path.push(previous); build(previous); path.pop() }
  }
  build(endWord)
  return result
}
`,
    },
  },

]
