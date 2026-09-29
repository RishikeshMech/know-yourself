/**
 * New MEDIUM coding problems (LeetCode-style). Authoring source only — run
 * `npm run compile:coding` to merge them into data/company/supplements/
 * s03-coding.json (expected values for tests without `expected` are computed
 * from the Python reference and cross-checked against the JavaScript one).
 *
 * `brute` holds deliberately naive solutions used only by the test-suite to
 * prove that the stress tests reject inefficient algorithms (TLE) while the
 * ordinary tests still accept them. Neither `solution` nor `brute` ever
 * reaches the bank or the browser.
 */
import { STRESS } from './util.mjs'

export const MEDIUM = [
  /* ------------------------------------------------------------------ */
  {
    slug: 'subarray-sum-equals-k', title: 'Subarray Sum Equals K', topic: 'Hashing', difficulty: 'medium',
    statement: 'Given an integer array nums and an integer k, return the total number of contiguous non-empty subarrays whose sum equals k.',
    examples: [
      { input: 'nums = [1,1,1], k = 2', output: '2' },
      { input: 'nums = [1,2,3], k = 3', output: '2', explain: '[1,2] and [3].' },
    ],
    constraints: ['1 ≤ len(nums) ≤ 10⁵', '−1000 ≤ nums[i] ≤ 1000, −10⁷ ≤ k ≤ 10⁷', 'Values can be negative, so a sliding window does not work', 'Expected: O(n) time'],
    fn: { python: 'subarray_sum', javascript: 'subarraySum' },
    compare: 'exact',
    tests: [
      { name: 'example 1', args: [[1, 1, 1], 2], expected: 2, sample: true },
      { name: 'example 2', args: [[1, 2, 3], 3], expected: 2, sample: true },
      { name: 'single element, no match', args: [[1], 0], expected: 0 },
      { name: 'all zeros', args: [[0, 0, 0], 0], expected: 6 },
      { name: 'negatives', args: [[-1, -1, 1], 0], expected: 1 },
      { name: 'mixed signs', args: [[1, -1, 0], 0], expected: 3 },
      { name: 'several windows', args: [[3, 4, 7, 2, -3, 1, 4, 2], 7], expected: 4 },
      { name: 'negative k', args: [[1, -2, 3, -4, 5, -6], -1] },
      { name: 'stress: 10⁵ values in [−5, 5]', args: [{ $gen: 'ints', n: 100000, lo: -5, hi: 5, seed: 101 }, 3], ...STRESS() },
      { name: 'stress: 10⁵ values of ±1, k = 0', args: [{ $gen: 'choice', n: 100000, values: [-1, 1], seed: 102 }, 0], ...STRESS() },
    ],
    solution: {
      python: String.raw`def subarray_sum(nums, k):
    seen = {0: 1}
    total = count = 0
    for x in nums:
        total += x
        count += seen.get(total - k, 0)
        seen[total] = seen.get(total, 0) + 1
    return count
`,
      javascript: String.raw`function subarraySum(nums, k) {
  const seen = new Map([[0, 1]])
  let total = 0, count = 0
  for (const x of nums) {
    total += x
    count += seen.get(total - k) || 0
    seen.set(total, (seen.get(total) || 0) + 1)
  }
  return count
}
`,
    },
    brute: {
      python: String.raw`def subarray_sum(nums, k):
    c = 0
    for i in range(len(nums)):
        s = 0
        for j in range(i, len(nums)):
            s += nums[j]
            if s == k:
                c += 1
    return c
`,
      javascript: String.raw`function subarraySum(nums, k) {
  let c = 0
  for (let i = 0; i < nums.length; i++) { let s = 0; for (let j = i; j < nums.length; j++) { s += nums[j]; if (s === k) c++ } }
  return c
}
`,
    },
  },

  /* ------------------------------------------------------------------ */
  {
    slug: 'longest-consecutive-sequence', title: 'Longest Consecutive Sequence', topic: 'Hashing', difficulty: 'medium',
    statement: 'Given an unsorted array of integers nums, return the length of the longest run of consecutive integers (x, x+1, x+2, …) that can be formed from its elements. Duplicates count once. Your algorithm must run in O(n) time.',
    examples: [
      { input: 'nums = [100,4,200,1,3,2]', output: '4', explain: 'The longest run is [1, 2, 3, 4].' },
      { input: 'nums = [0,3,7,2,5,8,4,6,0,1]', output: '9' },
    ],
    constraints: ['0 ≤ len(nums) ≤ 10⁵', '−10⁹ ≤ nums[i] ≤ 10⁹', 'Expected: O(n) with a hash set'],
    fn: { python: 'longest_consecutive', javascript: 'longestConsecutive' },
    compare: 'exact',
    tests: [
      { name: 'example 1', args: [[100, 4, 200, 1, 3, 2]], expected: 4, sample: true },
      { name: 'example 2', args: [[0, 3, 7, 2, 5, 8, 4, 6, 0, 1]], expected: 9, sample: true },
      { name: 'empty', args: [[]], expected: 0 },
      { name: 'duplicates', args: [[1, 2, 0, 1]], expected: 3 },
      { name: 'single', args: [[9]], expected: 1 },
      { name: 'negatives', args: [[-3, -2, -1, 5, 6]], expected: 3 },
      { name: 'no neighbours', args: [[1, 3, 5, 7]], expected: 1 },
      { name: '32-bit extremes', args: [[2147483646, -2147483648, 2147483647, -2147483647]], expected: 2 },
      { name: 'stress: 10⁵ shuffled consecutive values', args: [{ $gen: 'perm', n: 100000, base: -50000, seed: 103 }], expected: 100000, ...STRESS() },
      { name: 'stress: random values + a planted run', args: [{ $gen: 'concat', parts: [{ $gen: 'distinct', n: 90000, lo: -1000000000, hi: 1000000000, seed: 104 }, { $gen: 'shuffle', of: { $gen: 'range', start: 1000, stop: 11000 }, seed: 105 }] }], ...STRESS() },
    ],
    solution: {
      python: String.raw`def longest_consecutive(nums):
    s = set(nums)
    best = 0
    for x in s:
        if x - 1 not in s:
            y = x
            while y + 1 in s:
                y += 1
            best = max(best, y - x + 1)
    return best
`,
      javascript: String.raw`function longestConsecutive(nums) {
  const s = new Set(nums)
  let best = 0
  for (const x of s) {
    if (!s.has(x - 1)) {
      let y = x
      while (s.has(y + 1)) y++
      best = Math.max(best, y - x + 1)
    }
  }
  return best
}
`,
    },
    brute: {
      python: String.raw`def longest_consecutive(nums):
    s = set(nums)
    best = 0
    for x in s:
        y = x
        while y + 1 in s:
            y += 1
        best = max(best, y - x + 1)
    return best
`,
    },
  },

  /* ------------------------------------------------------------------ */
  {
    slug: 'daily-temperatures', title: 'Daily Temperatures', topic: 'Stacks', difficulty: 'medium',
    statement: 'Given an array temperatures of daily temperatures, return an array answer where answer[i] is the number of days you must wait after day i to get a strictly warmer temperature. If no future day is warmer, answer[i] = 0.',
    examples: [
      { input: 'temperatures = [73,74,75,71,69,72,76,73]', output: '[1,1,4,2,1,1,0,0]' },
      { input: 'temperatures = [30,40,50,60]', output: '[1,1,1,0]' },
    ],
    constraints: ['1 ≤ len(temperatures) ≤ 10⁵', '30 ≤ temperatures[i] ≤ 100', 'Expected: O(n) with a monotonic stack'],
    fn: { python: 'daily_temperatures', javascript: 'dailyTemperatures' },
    compare: 'exact',
    tests: [
      { name: 'example 1', args: [[73, 74, 75, 71, 69, 72, 76, 73]], expected: [1, 1, 4, 2, 1, 1, 0, 0], sample: true },
      { name: 'example 2', args: [[30, 40, 50, 60]], expected: [1, 1, 1, 0], sample: true },
      { name: 'three rising', args: [[30, 60, 90]], expected: [1, 1, 0] },
      { name: 'falling', args: [[90, 80, 70]], expected: [0, 0, 0] },
      { name: 'single day', args: [[50]], expected: [0] },
      { name: 'equal is not warmer', args: [[70, 70, 71]], expected: [2, 1, 0] },
      { name: 'mixed', args: [[55, 38, 53, 81, 61, 93, 97, 32, 43, 78]] },
      { name: 'stress: 10⁵ non-increasing days', args: [{ $gen: 'sorted', of: { $gen: 'ints', n: 100000, lo: 30, hi: 100, seed: 106 }, desc: true }], ...STRESS() },
      { name: 'stress: warm spike on the last day', args: [{ $gen: 'concat', parts: [{ $gen: 'sorted', of: { $gen: 'ints', n: 99999, lo: 30, hi: 99, seed: 107 }, desc: true }, [100]] }], ...STRESS() },
      { name: 'stress: 10⁵ random days', args: [{ $gen: 'ints', n: 100000, lo: 30, hi: 100, seed: 108 }], ...STRESS() },
    ],
    solution: {
      python: String.raw`def daily_temperatures(temperatures):
    ans = [0] * len(temperatures)
    stack = []
    for i, t in enumerate(temperatures):
        while stack and temperatures[stack[-1]] < t:
            j = stack.pop()
            ans[j] = i - j
        stack.append(i)
    return ans
`,
      javascript: String.raw`function dailyTemperatures(temperatures) {
  const ans = new Array(temperatures.length).fill(0)
  const stack = []
  for (let i = 0; i < temperatures.length; i++) {
    while (stack.length && temperatures[stack[stack.length - 1]] < temperatures[i]) {
      const j = stack.pop()
      ans[j] = i - j
    }
    stack.push(i)
  }
  return ans
}
`,
    },
    brute: {
      python: String.raw`def daily_temperatures(temperatures):
    n = len(temperatures)
    ans = [0] * n
    for i in range(n):
        for j in range(i + 1, n):
            if temperatures[j] > temperatures[i]:
                ans[i] = j - i
                break
    return ans
`,
      javascript: String.raw`function dailyTemperatures(t) {
  const ans = new Array(t.length).fill(0)
  for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) if (t[j] > t[i]) { ans[i] = j - i; break }
  return ans
}
`,
    },
  },

  /* ------------------------------------------------------------------ */
  {
    slug: 'koko-eating-bananas', title: 'Koko Eating Bananas', topic: 'Searching', difficulty: 'medium',
    statement: 'Koko has piles of bananas; piles[i] is the size of pile i. The guards return in h hours. Each hour she picks one pile and eats k bananas from it — if the pile has fewer than k, she eats all of it and does nothing else that hour. Return the minimum integer speed k that lets her finish every pile within h hours.',
    examples: [
      { input: 'piles = [3,6,7,11], h = 8', output: '4' },
      { input: 'piles = [30,11,23,4,20], h = 5', output: '30' },
    ],
    constraints: ['1 ≤ len(piles) ≤ 10⁴', 'len(piles) ≤ h ≤ 10⁹', '1 ≤ piles[i] ≤ 10⁹', 'Expected: binary search on k — O(n log max(piles))'],
    fn: { python: 'min_eating_speed', javascript: 'minEatingSpeed' },
    compare: 'exact',
    tests: [
      { name: 'example 1', args: [[3, 6, 7, 11], 8], expected: 4, sample: true },
      { name: 'example 2', args: [[30, 11, 23, 4, 20], 5], expected: 30, sample: true },
      { name: 'one spare hour', args: [[30, 11, 23, 4, 20], 6], expected: 23 },
      { name: 'single tiny pile', args: [[1], 1], expected: 1 },
      { name: 'huge pile, two hours', args: [[1000000000], 2], expected: 500000000 },
      { name: 'almost one per hour', args: [[312884470], 312884469], expected: 2 },
      { name: 'exactly one hour each', args: [[1, 1, 1, 1], 4], expected: 1 },
      { name: 'large piles, generous h', args: [[805306368, 805306368, 805306368], 1000000000] },
      { name: 'stress: 10⁴ piles up to 10⁹', args: [{ $gen: 'ints', n: 10000, lo: 1, hi: 1000000000, seed: 109 }, 15000], ...STRESS() },
    ],
    solution: {
      python: String.raw`def min_eating_speed(piles, h):
    lo, hi = 1, max(piles)
    while lo < hi:
        mid = (lo + hi) // 2
        if sum((p + mid - 1) // mid for p in piles) <= h:
            hi = mid
        else:
            lo = mid + 1
    return lo
`,
      javascript: String.raw`function minEatingSpeed(piles, h) {
  let lo = 1, hi = Math.max(...piles)
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    let hours = 0
    for (const p of piles) hours += Math.ceil(p / mid)
    if (hours <= h) hi = mid
    else lo = mid + 1
  }
  return lo
}
`,
    },
    brute: {
      python: String.raw`def min_eating_speed(piles, h):
    k = 1
    while sum((p + k - 1) // k for p in piles) > h:
        k += 1
    return k
`,
    },
  },

  /* ------------------------------------------------------------------ */
  {
    slug: 'rotting-oranges', title: 'Rotting Oranges', topic: 'Graphs', difficulty: 'medium',
    statement: 'grid[r][c] is 0 (empty), 1 (fresh orange) or 2 (rotten orange). Every minute, each fresh orange that is 4-directionally adjacent to a rotten orange becomes rotten. Return the minimum number of minutes until no fresh orange remains, or -1 if that is impossible.',
    examples: [
      { input: 'grid = [[2,1,1],[1,1,0],[0,1,1]]', output: '4' },
      { input: 'grid = [[2,1,1],[0,1,1],[1,0,1]]', output: '-1', explain: 'The orange in the bottom-left corner is never reached.' },
    ],
    constraints: ['1 ≤ rows, cols ≤ 300', 'Expected: O(rows × cols) multi-source BFS'],
    fn: { python: 'oranges_rotting', javascript: 'orangesRotting' },
    compare: 'exact',
    tests: [
      { name: 'example 1', args: [[[2, 1, 1], [1, 1, 0], [0, 1, 1]]], expected: 4, sample: true },
      { name: 'example 2', args: [[[2, 1, 1], [0, 1, 1], [1, 0, 1]]], expected: -1, sample: true },
      { name: 'no fresh oranges', args: [[[0, 2]]], expected: 0 },
      { name: 'empty cell only', args: [[[0]]], expected: 0 },
      { name: 'fresh but no rotten', args: [[[1]]], expected: -1 },
      { name: 'two sources', args: [[[2, 2], [1, 1]]], expected: 1 },
      { name: 'row', args: [[[2, 1, 1, 1, 1]]], expected: 4 },
      { name: 'opposite corners', args: [[[1, 2, 1], [1, 1, 1], [1, 1, 2]]] },
      { name: 'stress: 300×300 fresh grid, one rotten corner', args: [{ $gen: 'patch', of: { $gen: 'grid', rows: 300, cols: 300, lo: 1, hi: 1 }, cells: [[0, 0, 2]] }], expected: 598, ...STRESS() },
      { name: 'stress: 300×300 random', args: [{ $gen: 'grid', rows: 300, cols: 300, values: [1, 1, 1, 2], seed: 110 }], ...STRESS() },
    ],
    solution: {
      python: String.raw`from collections import deque

def oranges_rotting(grid):
    rows, cols = len(grid), len(grid[0])
    q = deque()
    fresh = 0
    for r in range(rows):
        for c in range(cols):
            if grid[r][c] == 2:
                q.append((r, c))
            elif grid[r][c] == 1:
                fresh += 1
    seen = [row[:] for row in grid]
    minutes = 0
    while q and fresh:
        minutes += 1
        for _ in range(len(q)):
            r, c = q.popleft()
            for x, y in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
                if 0 <= x < rows and 0 <= y < cols and seen[x][y] == 1:
                    seen[x][y] = 2
                    fresh -= 1
                    q.append((x, y))
    return minutes if fresh == 0 else -1
`,
      javascript: String.raw`function orangesRotting(grid) {
  const rows = grid.length, cols = grid[0].length
  const g = grid.map((row) => row.slice())
  let q = [], fresh = 0
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { if (g[r][c] === 2) q.push([r, c]); else if (g[r][c] === 1) fresh++ }
  let minutes = 0
  while (q.length && fresh) {
    minutes++
    const next = []
    for (const [r, c] of q) {
      for (const [x, y] of [[r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]]) {
        if (x >= 0 && x < rows && y >= 0 && y < cols && g[x][y] === 1) { g[x][y] = 2; fresh--; next.push([x, y]) }
      }
    }
    q = next
  }
  return fresh === 0 ? minutes : -1
}
`,
    },
    brute: {
      python: String.raw`def oranges_rotting(grid):
    g = [row[:] for row in grid]
    rows, cols = len(g), len(g[0])
    minutes = 0
    while True:
        change = []
        for r in range(rows):
            for c in range(cols):
                if g[r][c] == 1:
                    for x, y in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
                        if 0 <= x < rows and 0 <= y < cols and g[x][y] == 2:
                            change.append((r, c))
                            break
        if not change:
            break
        for r, c in change:
            g[r][c] = 2
        minutes += 1
    return -1 if any(1 in row for row in g) else minutes
`,
    },
  },

  /* ------------------------------------------------------------------ */
  {
    slug: 'decode-string', title: 'Decode String', topic: 'Stacks', difficulty: 'medium',
    statement: 'Given an encoded string, return its decoded form. The rule is k[encoded]: the string inside the brackets is repeated exactly k times (k is a positive integer that may have several digits). Brackets can be nested. The input is always valid and digits only appear as repeat counts.',
    examples: [
      { input: 's = "3[a]2[bc]"', output: '"aaabcbc"' },
      { input: 's = "3[a2[c]]"', output: '"accaccacc"' },
    ],
    constraints: ['1 ≤ len(s) ≤ 2 × 10⁴', 'The decoded string has at most 2 × 10⁵ characters', 'Expected: O(output length) with a stack'],
    fn: { python: 'decode_string', javascript: 'decodeString' },
    compare: 'exact',
    tests: [
      { name: 'example 1', args: ['3[a]2[bc]'], expected: 'aaabcbc', sample: true },
      { name: 'example 2', args: ['3[a2[c]]'], expected: 'accaccacc', sample: true },
      { name: 'trailing text', args: ['2[abc]3[cd]ef'], expected: 'abcabccdcdcdef' },
      { name: 'no brackets', args: ['abc'], expected: 'abc' },
      { name: 'multi-digit count', args: ['10[a]'], expected: 'aaaaaaaaaa' },
      { name: 'triple nesting', args: ['2[2[2[b]]]'], expected: 'bbbbbbbb' },
      { name: 'text around nesting', args: ['a2[b3[c]]d'], expected: 'abcccbcccd' },
      { name: 'mixed nesting', args: ['3[z]2[2[y]pq4[2[jk]e1[f]]]ef'] },
      { name: 'stress: 16 nested levels (131,072 chars)', args: [{ $gen: 'concat', parts: [{ $gen: 'strrepeat', value: '2[', n: 16 }, 'ab', { $gen: 'strrepeat', value: ']', n: 16 }] }], ...STRESS() },
      { name: 'stress: 2,000 flat groups', args: [{ $gen: 'strrepeat', value: '3[ab]', n: 2000 }], ...STRESS() },
    ],
    solution: {
      python: String.raw`def decode_string(s):
    stack = []
    cur = []
    num = 0
    for ch in s:
        if ch.isdigit():
            num = num * 10 + int(ch)
        elif ch == '[':
            stack.append((cur, num))
            cur, num = [], 0
        elif ch == ']':
            prev, k = stack.pop()
            prev.append(''.join(cur) * k)
            cur = prev
        else:
            cur.append(ch)
    return ''.join(cur)
`,
      javascript: String.raw`function decodeString(s) {
  const stack = []
  let cur = [], num = 0
  for (const ch of s) {
    if (ch >= '0' && ch <= '9') num = num * 10 + (ch.charCodeAt(0) - 48)
    else if (ch === '[') { stack.push([cur, num]); cur = []; num = 0 }
    else if (ch === ']') { const [prev, k] = stack.pop(); prev.push(cur.join('').repeat(k)); cur = prev }
    else cur.push(ch)
  }
  return cur.join('')
}
`,
    },
  },

  /* ------------------------------------------------------------------ */
  {
    slug: 'network-delay-time', title: 'Network Delay Time', topic: 'Graphs', difficulty: 'medium',
    statement: 'A network has n nodes labelled 1 … n. times[i] = [u, v, w] is a directed edge: a signal sent from u reaches v after w units of time. A signal is sent from node k. Return the minimum time for all n nodes to receive it, or -1 if some node never does.',
    examples: [
      { input: 'times = [[2,1,1],[2,3,1],[3,4,1]], n = 4, k = 2', output: '2' },
      { input: 'times = [[1,2,1]], n = 2, k = 2', output: '-1' },
    ],
    constraints: ['1 ≤ n ≤ 2 × 10⁴, 0 ≤ len(times) ≤ 10⁵', '1 ≤ w ≤ 100; all (u, v) pairs are distinct', 'Expected: Dijkstra with a binary heap — O((n + E) log n)'],
    fn: { python: 'network_delay_time', javascript: 'networkDelayTime' },
    compare: 'exact',
    tests: [
      { name: 'example 1', args: [[[2, 1, 1], [2, 3, 1], [3, 4, 1]], 4, 2], expected: 2, sample: true },
      { name: 'example 2', args: [[[1, 2, 1]], 2, 2], expected: -1, sample: true },
      { name: 'single edge', args: [[[1, 2, 1]], 2, 1], expected: 1 },
      { name: 'indirect path is faster', args: [[[1, 2, 1], [2, 3, 2], [1, 3, 4]], 3, 1], expected: 3 },
      { name: 'cycle', args: [[[1, 2, 1], [2, 1, 3]], 2, 2], expected: 3 },
      { name: 'single node', args: [[], 1, 1], expected: 0 },
      { name: 'relaxation order matters', args: [[[1, 2, 5], [1, 3, 1], [3, 2, 1], [2, 4, 1]], 4, 1], expected: 3 },
      { name: 'stress: 20,000 nodes, 100,000 edges', args: [{ $gen: 'edges', n: 20000, m: 100000, wlo: 1, whi: 100, base: 1, seed: 111 }, 20000, 1], ...STRESS() },
      { name: 'stress: 20,000-node chain listed backwards', args: [{ $gen: 'zip', parts: [{ $gen: 'range', start: 19999, stop: 0, step: -1 }, { $gen: 'range', start: 20000, stop: 1, step: -1 }, { $gen: 'repeat', value: 1, n: 19999 }] }, 20000, 1], expected: 19999, ...STRESS() },
    ],
    solution: {
      python: String.raw`import heapq

def network_delay_time(times, n, k):
    graph = [[] for _ in range(n + 1)]
    for u, v, w in times:
        graph[u].append((v, w))
    dist = [None] * (n + 1)
    heap = [(0, k)]
    while heap:
        d, u = heapq.heappop(heap)
        if dist[u] is not None:
            continue
        dist[u] = d
        for v, w in graph[u]:
            if dist[v] is None:
                heapq.heappush(heap, (d + w, v))
    if any(dist[i] is None for i in range(1, n + 1)):
        return -1
    return max(dist[1:])
`,
      javascript: String.raw`function networkDelayTime(times, n, k) {
  const graph = Array.from({ length: n + 1 }, () => [])
  for (const [u, v, w] of times) graph[u].push([v, w])
  const dist = new Array(n + 1).fill(-1)
  const heap = [[0, k]]
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
        let m = i
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r
        if (m === i) break
        ;[heap[m], heap[i]] = [heap[i], heap[m]]
        i = m
      }
    }
    return top
  }
  while (heap.length) {
    const [d, u] = pop()
    if (dist[u] !== -1) continue
    dist[u] = d
    for (const [v, w] of graph[u]) if (dist[v] === -1) push([d + w, v])
  }
  let best = 0
  for (let i = 1; i <= n; i++) { if (dist[i] === -1) return -1; best = Math.max(best, dist[i]) }
  return best
}
`,
    },
    brute: {
      python: String.raw`def network_delay_time(times, n, k):
    INF = float('inf')
    dist = [INF] * (n + 1)
    dist[k] = 0
    for _ in range(n - 1):
        changed = False
        for u, v, w in times:
            if dist[u] + w < dist[v]:
                dist[v] = dist[u] + w
                changed = True
        if not changed:
            break
    best = max(dist[1:])
    return -1 if best == INF else best
`,
    },
  },

  /* ------------------------------------------------------------------ */
  {
    slug: 'min-arrows-burst-balloons', title: 'Minimum Arrows to Burst Balloons', topic: 'Greedy', difficulty: 'medium',
    statement: 'Balloons are taped to a wall; balloon i spans the horizontal range points[i] = [x_start, x_end]. An arrow shot vertically at x bursts every balloon with x_start ≤ x ≤ x_end. Return the minimum number of arrows needed to burst all balloons.',
    examples: [
      { input: 'points = [[10,16],[2,8],[1,6],[7,12]]', output: '2', explain: 'Shoot at x = 6 and x = 11.' },
      { input: 'points = [[1,2],[3,4],[5,6],[7,8]]', output: '4' },
    ],
    constraints: ['1 ≤ len(points) ≤ 10⁵', '−2³¹ ≤ x_start ≤ x_end ≤ 2³¹ − 1', 'Expected: O(n log n) greedy'],
    fn: { python: 'find_min_arrow_shots', javascript: 'findMinArrowShots' },
    compare: 'exact',
    tests: [
      { name: 'example 1', args: [[[10, 16], [2, 8], [1, 6], [7, 12]]], expected: 2, sample: true },
      { name: 'example 2', args: [[[1, 2], [3, 4], [5, 6], [7, 8]]], expected: 4, sample: true },
      { name: 'touching ends share an arrow', args: [[[1, 2], [2, 3], [3, 4], [4, 5]]], expected: 2 },
      { name: 'single balloon', args: [[[1, 2]]], expected: 1 },
      { name: 'full 32-bit range', args: [[[-2147483648, 2147483647]]], expected: 1 },
      { name: 'one wide balloon', args: [[[1, 10], [2, 3], [4, 5], [6, 7]]], expected: 3 },
      { name: 'many overlaps', args: [[[3, 9], [7, 12], [3, 8], [6, 8], [9, 10], [2, 9], [0, 9], [3, 9], [0, 6], [2, 8]]] },
      { name: 'stress: 10⁵ balloons', args: [{ $gen: 'intervals', n: 100000, lo: 0, hi: 1000000000, maxLen: 20000, seed: 112 }], ...STRESS() },
    ],
    solution: {
      python: String.raw`def find_min_arrow_shots(points):
    pts = sorted(points, key=lambda p: p[1])
    arrows = 0
    last = None
    for s, e in pts:
        if last is None or s > last:
            arrows += 1
            last = e
    return arrows
`,
      javascript: String.raw`function findMinArrowShots(points) {
  const pts = points.slice().sort((a, b) => a[1] - b[1])
  let arrows = 0, last = null
  for (const [s, e] of pts) if (last === null || s > last) { arrows++; last = e }
  return arrows
}
`,
    },
    brute: {
      python: String.raw`def find_min_arrow_shots(points):
    left = [list(p) for p in points]
    arrows = 0
    while left:
        x = min(e for _, e in left)
        left = [p for p in left if not (p[0] <= x <= p[1])]
        arrows += 1
    return arrows
`,
    },
  },

  /* ------------------------------------------------------------------ */
  {
    slug: 'character-replacement', title: 'Longest Repeating Character Replacement', topic: 'Strings', difficulty: 'medium',
    statement: 'Given an uppercase string s and an integer k, you may change at most k characters of s to any other uppercase letter. Return the length of the longest substring made of one repeated letter that you can obtain.',
    examples: [
      { input: 's = "ABAB", k = 2', output: '4' },
      { input: 's = "AABABBA", k = 1', output: '4', explain: 'Change the middle A to B: "AABBBBA".' },
    ],
    constraints: ['1 ≤ len(s) ≤ 10⁵', '0 ≤ k ≤ len(s)', 'Expected: O(n) sliding window'],
    fn: { python: 'character_replacement', javascript: 'characterReplacement' },
    compare: 'exact',
    tests: [
      { name: 'example 1', args: ['ABAB', 2], expected: 4, sample: true },
      { name: 'example 2', args: ['AABABBA', 1], expected: 4, sample: true },
      { name: 'single letter', args: ['A', 0], expected: 1 },
      { name: 'already uniform', args: ['AAAA', 0], expected: 4 },
      { name: 'all distinct', args: ['ABCDE', 1], expected: 2 },
      { name: 'replace the head', args: ['ABBB', 2], expected: 4 },
      { name: 'replace both ends', args: ['BAAAB', 2], expected: 5 },
      { name: 'no replacements', args: ['ABAA', 0], expected: 2 },
      { name: 'stress: 10⁵ random letters, k = 1000', args: [{ $gen: 'str', n: 100000, alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', seed: 113 }, 1000], ...STRESS() },
    ],
    solution: {
      python: String.raw`def character_replacement(s, k):
    count = {}
    best = maxf = left = 0
    for right, ch in enumerate(s):
        count[ch] = count.get(ch, 0) + 1
        maxf = max(maxf, count[ch])
        while right - left + 1 - maxf > k:
            count[s[left]] -= 1
            left += 1
        best = max(best, right - left + 1)
    return best
`,
      javascript: String.raw`function characterReplacement(s, k) {
  const count = new Array(26).fill(0)
  let best = 0, maxf = 0, left = 0
  for (let right = 0; right < s.length; right++) {
    const c = s.charCodeAt(right) - 65
    maxf = Math.max(maxf, ++count[c])
    while (right - left + 1 - maxf > k) { count[s.charCodeAt(left) - 65]--; left++ }
    best = Math.max(best, right - left + 1)
  }
  return best
}
`,
    },
    brute: {
      python: String.raw`def character_replacement(s, k):
    best = 0
    for i in range(len(s)):
        count = {}
        top = 0
        for j in range(i, len(s)):
            count[s[j]] = count.get(s[j], 0) + 1
            top = max(top, count[s[j]])
            if j - i + 1 - top <= k:
                best = max(best, j - i + 1)
    return best
`,
    },
  },

  /* ------------------------------------------------------------------ */
  {
    slug: 'lru-cache', title: 'LRU Cache', topic: 'Hashing', difficulty: 'medium',
    statement: 'Simulate a Least-Recently-Used cache with the given capacity. operations[i] is either [1, key, value] — put: insert or update key; if the cache then holds more than capacity keys, evict the least recently used one — or [0, key, _] — get: return the value for key, or -1 if absent (the third element, if present, is ignored). Both get and put count as a use of the key. Return the results of all get operations, in order. Each operation must take O(1) average time.',
    examples: [
      { input: 'capacity = 2, operations = [[1,1,1],[1,2,2],[0,1],[1,3,3],[0,2],[1,4,4],[0,1],[0,3],[0,4]]', output: '[1,-1,-1,3,4]', explain: 'put(3) evicts key 2; put(4) evicts key 1.' },
    ],
    constraints: ['1 ≤ capacity ≤ 3 × 10⁴', '1 ≤ len(operations) ≤ 2 × 10⁵', 'Expected: O(1) per operation — hash map + doubly linked list (or an ordered map)'],
    fn: { python: 'lru_cache', javascript: 'lruCache' },
    compare: 'exact',
    tests: [
      { name: 'example', args: [2, [[1, 1, 1], [1, 2, 2], [0, 1], [1, 3, 3], [0, 2], [1, 4, 4], [0, 1], [0, 3], [0, 4]]], expected: [1, -1, -1, 3, 4], sample: true },
      { name: 'capacity one', args: [1, [[1, 2, 1], [0, 2], [1, 3, 2], [0, 2], [0, 3]]], expected: [1, -1, 2] },
      { name: 'update refreshes recency', args: [2, [[1, 1, 1], [1, 2, 2], [1, 1, 10], [1, 3, 3], [0, 1], [0, 2], [0, 3]]], expected: [10, -1, 3] },
      { name: 'get refreshes recency', args: [2, [[1, 1, 1], [1, 2, 2], [0, 1], [1, 3, 3], [0, 2], [0, 1]]], expected: [1, -1, 1] },
      { name: 'no gets', args: [3, [[1, 1, 1]]], expected: [] },
      { name: 'misses on an empty cache', args: [2, [[0, 5], [0, 6]]], expected: [-1, -1] },
      { name: 'stress: 2 × 10⁵ operations, capacity 30,000', args: [30000, { $gen: 'zip', parts: [{ $gen: 'ints', n: 200000, lo: 0, hi: 1, seed: 114 }, { $gen: 'ints', n: 200000, lo: 1, hi: 60000, seed: 115 }, { $gen: 'ints', n: 200000, lo: 0, hi: 1000000000, seed: 116 }] }], ...STRESS({ python: 4000, javascript: 2500 }) },
    ],
    solution: {
      python: String.raw`from collections import OrderedDict

def lru_cache(capacity, operations):
    cache = OrderedDict()
    out = []
    for op in operations:
        key = op[1]
        if op[0] == 0:
            if key in cache:
                cache.move_to_end(key)
                out.append(cache[key])
            else:
                out.append(-1)
        else:
            if key in cache:
                cache.move_to_end(key)
            cache[key] = op[2]
            if len(cache) > capacity:
                cache.popitem(last=False)
    return out
`,
      javascript: String.raw`function lruCache(capacity, operations) {
  const cache = new Map()
  const out = []
  for (const op of operations) {
    const key = op[1]
    if (op[0] === 0) {
      if (cache.has(key)) { const v = cache.get(key); cache.delete(key); cache.set(key, v); out.push(v) }
      else out.push(-1)
    } else {
      if (cache.has(key)) cache.delete(key)
      cache.set(key, op[2])
      if (cache.size > capacity) cache.delete(cache.keys().next().value)
    }
  }
  return out
}
`,
    },
    brute: {
      python: String.raw`def lru_cache(capacity, operations):
    order = []
    values = {}
    out = []
    for op in operations:
        key = op[1]
        if op[0] == 0:
            if key in values:
                order.remove(key)
                order.append(key)
                out.append(values[key])
            else:
                out.append(-1)
        else:
            if key in values:
                order.remove(key)
            order.append(key)
            values[key] = op[2]
            if len(order) > capacity:
                del values[order.pop(0)]
    return out
`,
    },
  },

  /* ------------------------------------------------------------------ */
  {
    slug: 'gas-station', title: 'Gas Station', topic: 'Greedy', difficulty: 'medium',
    statement: 'There are n gas stations on a circular route. Station i has gas[i] units of fuel, and driving from station i to station i + 1 costs cost[i] units (the last station leads back to station 0). You start with an empty tank at one of the stations. Return the index of the station from which you can complete one full clockwise circuit, or -1 if it is impossible. If a solution exists, it is unique.',
    examples: [
      { input: 'gas = [1,2,3,4,5], cost = [3,4,5,1,2]', output: '3' },
      { input: 'gas = [2,3,4], cost = [3,4,3]', output: '-1' },
    ],
    constraints: ['1 ≤ n ≤ 10⁵', '0 ≤ gas[i], cost[i] ≤ 10⁵', 'Expected: a single O(n) pass'],
    fn: { python: 'can_complete_circuit', javascript: 'canCompleteCircuit' },
    compare: 'exact',
    tests: [
      { name: 'example 1', args: [[1, 2, 3, 4, 5], [3, 4, 5, 1, 2]], expected: 3, sample: true },
      { name: 'example 2', args: [[2, 3, 4], [3, 4, 3]], expected: -1, sample: true },
      { name: 'single station, enough gas', args: [[5], [4]], expected: 0 },
      { name: 'single station, not enough', args: [[4], [5]], expected: -1 },
      { name: 'start at zero', args: [[3, 1, 1], [1, 2, 2]], expected: 0 },
      { name: 'start at the end', args: [[5, 1, 2, 3, 4], [4, 4, 1, 5, 1]], expected: 4 },
      { name: 'stress: unique start at the last of 10⁵ stations', args: [{ $gen: 'concat', parts: [{ $gen: 'repeat', value: 1, n: 99998 }, [0, 2]] }, { $gen: 'concat', parts: [{ $gen: 'repeat', value: 0, n: 99998 }, [100000, 0]] }], expected: 99999, ...STRESS() },
      { name: 'stress: 10⁵ stations, impossible', args: [{ $gen: 'ints', n: 100000, lo: 0, hi: 99, seed: 117 }, { $gen: 'ints', n: 100000, lo: 1, hi: 100, seed: 118 }], ...STRESS() },
    ],
    solution: {
      python: String.raw`def can_complete_circuit(gas, cost):
    if sum(gas) < sum(cost):
        return -1
    start = tank = 0
    for i in range(len(gas)):
        tank += gas[i] - cost[i]
        if tank < 0:
            start = i + 1
            tank = 0
    return start
`,
      javascript: String.raw`function canCompleteCircuit(gas, cost) {
  let total = 0, tank = 0, start = 0
  for (let i = 0; i < gas.length; i++) {
    total += gas[i] - cost[i]
    tank += gas[i] - cost[i]
    if (tank < 0) { start = i + 1; tank = 0 }
  }
  return total < 0 ? -1 : start
}
`,
    },
    brute: {
      python: String.raw`def can_complete_circuit(gas, cost):
    n = len(gas)
    for s in range(n):
        tank = 0
        ok = True
        for step in range(n):
            i = (s + step) % n
            tank += gas[i] - cost[i]
            if tank < 0:
                ok = False
                break
        if ok:
            return s
    return -1
`,
      javascript: String.raw`function canCompleteCircuit(gas, cost) {
  const n = gas.length
  for (let s = 0; s < n; s++) {
    let tank = 0, ok = true
    for (let step = 0; step < n; step++) { const i = (s + step) % n; tank += gas[i] - cost[i]; if (tank < 0) { ok = false; break } }
    if (ok) return s
  }
  return -1
}
`,
    },
  },

  /* ------------------------------------------------------------------ */
  {
    slug: 'partition-equal-subset-sum', title: 'Partition Equal Subset Sum', topic: 'Dynamic Programming', difficulty: 'medium',
    statement: 'Given an array of positive integers nums, return true if it can be split into two subsets with equal sums, otherwise false.',
    examples: [
      { input: 'nums = [1,5,11,5]', output: 'true', explain: '[1, 5, 5] and [11].' },
      { input: 'nums = [1,2,3,5]', output: 'false' },
    ],
    constraints: ['1 ≤ len(nums) ≤ 200', '1 ≤ nums[i] ≤ 100', 'Expected: O(n × sum) subset-sum DP (a bitset is even faster) — brute force is 2ⁿ'],
    fn: { python: 'can_partition', javascript: 'canPartition' },
    compare: 'exact',
    tests: [
      { name: 'example 1', args: [[1, 5, 11, 5]], expected: true, sample: true },
      { name: 'example 2', args: [[1, 2, 3, 5]], expected: false, sample: true },
      { name: 'single element', args: [[1]], expected: false },
      { name: 'pair', args: [[2, 2]], expected: true },
      { name: 'even sum but impossible', args: [[1, 2, 5]], expected: false },
      { name: 'five values', args: [[3, 3, 3, 4, 5]], expected: true },
      { name: 'all ones', args: [[1, 1, 1, 1]], expected: true },
      { name: 'stress: 98 hundreds + 99 + 97', args: [{ $gen: 'concat', parts: [{ $gen: 'repeat', value: 100, n: 98 }, [99, 97]] }], expected: false, ...STRESS() },
      { name: 'stress: 200 random values', args: [{ $gen: 'ints', n: 200, lo: 1, hi: 100, seed: 119 }], ...STRESS() },
      { name: 'stress: 199 hundreds and a 2', args: [{ $gen: 'concat', parts: [{ $gen: 'repeat', value: 100, n: 199 }, [2]] }], expected: false, ...STRESS() },
    ],
    solution: {
      python: String.raw`def can_partition(nums):
    total = sum(nums)
    if total % 2:
        return False
    target = total // 2
    bits = 1
    for x in nums:
        bits |= bits << x
    return bool((bits >> target) & 1)
`,
      javascript: String.raw`function canPartition(nums) {
  const total = nums.reduce((a, b) => a + b, 0)
  if (total % 2) return false
  const target = total / 2
  const dp = new Uint8Array(target + 1)
  dp[0] = 1
  for (const x of nums) for (let s = target; s >= x; s--) if (dp[s - x]) dp[s] = 1
  return dp[target] === 1
}
`,
    },
    brute: {
      python: String.raw`def can_partition(nums):
    total = sum(nums)
    if total % 2:
        return False
    target = total // 2
    def go(i, s):
        if s == target:
            return True
        if i == len(nums) or s > target:
            return False
        return go(i + 1, s + nums[i]) or go(i + 1, s)
    return go(0, 0)
`,
    },
  },
]
