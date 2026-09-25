// CalibiAI In-Exam Coding Assistant layer.
// Provides conversational guidance, explanations, debugging help, edge-case analysis,
// and code reviews for Stage 3 (AI-Assisted Debugging) and Stage 4 (AI Feature Dev).
//
// When an API key is configured, uses the CalibiAI coding assistant.
// Otherwise, uses a rich contextual heuristic knowledge engine tailored to AD1, AD2, AD3, and AF1.

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface AssistantRequest {
  taskId: string
  taskTitle?: string
  taskPrompt?: string
  buggyOrSpec?: string
  currentCode?: string
  messages: ChatMessage[]
}

export interface AssistantResponse {
  reply: string
  engine: 'calibiai' | 'heuristic'
}

import { callLlm, isLlmConfigured } from './llm.ts'
// A hung assistant model must fall back to the heuristic engine, not hang the
// exam under load.
const AI_TIMEOUT_MS = 20000

export function isCalibiAiConfigured(): boolean {
  return isLlmConfigured()
}

async function callCalibiAiChat(
  systemPrompt: string,
  messages: ChatMessage[],
): Promise<string | null> {
  return callLlm({
    label: 'assistant',
    temperature: 0.3,
    timeoutMs: AI_TIMEOUT_MS,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({
        role: (m.role === 'assistant' ? 'assistant' : 'user') as 'assistant' | 'user',
        content: m.content,
      })),
    ],
  })
}

// ---------------------------------------------------------------------------
// Contextual Heuristic Knowledge Engine for In-Exam Coding Tasks
// ---------------------------------------------------------------------------

function getTaskKnowledge(taskId: string) {
  switch (taskId) {
    case 'AD1':
      return {
        name: 'Python — Off-by-one in pagination',
        language: 'python',
        rootCause:
          'In Python, list indexing and slicing are 0-based (`items[0:5]` returns elements 0 through 4). In human pagination, `page=1` is the first page. The original formula `start = page * size` with `page=1, size=5` calculates `start = 5`, which skips the first 5 elements (`[0..4]`) and wrongly returns `[5..9]`.',
        fixSummary: 'Calculate the start index using `start = (page - 1) * size` and `end = start + size`.',
        edgeCases: [
          '**`page < 1`** (e.g., `page=0` or negative): should return an empty list `[]` or handle gracefully without throwing.',
          '**`size <= 0`**: invalid page size, should return `[]`.',
          '**`start >= len(items)`** (requested page beyond the last page): should return an empty list `[]`.',
          '**`items` not a list or empty**: should return `[]`.',
        ],
        codeSnippet: `def paginate(items, page, size):
    # Validate inputs
    if not isinstance(items, (list, tuple)) or page < 1 or size <= 0:
        return []
    
    # 0-indexed slice calculation
    start = (page - 1) * size
    end = start + size
    
    # Check if start is beyond list bounds
    if start >= len(items):
        return []
        
    return list(items[start:end])`,
      }

    case 'AD2':
      return {
        name: 'JavaScript — Race condition / duplicate fetches',
        language: 'javascript',
        rootCause:
          'When multiple asynchronous callers invoke `get(key, fetcher)` concurrently before the initial `fetcher()` resolves, `cache[key]` is still `undefined`. Thus, every caller executes `await fetcher()`, triggering multiple redundant network/DB calls. Furthermore, if `fetcher()` rejects, an uncaught error or broken state must be cleaned up so retries can succeed.',
        fixSummary:
          'Cache the in-flight `Promise` itself immediately when the request starts, rather than waiting for the resolved value. Wrap the promise in a `try...catch` so that if it rejects, `delete cache[key]` clears the failed entry to allow subsequent retries.',
        edgeCases: [
          '**Concurrent calls**: 3+ simultaneous requests for the same key must execute `fetcher()` exactly 1 time.',
          '**Identical resolved values**: all concurrent callers must resolve to the identical value.',
          '**Failed fetcher cleanup**: if `fetcher()` rejects, clear `cache[key]` so future calls can retry.',
          '**Cached hits**: subsequent calls after resolution should return the cached value immediately without invoking `fetcher()`.',
          '**Falsy values**: resolved values such as `0` or `false` are still valid cache hits.',
        ],
        codeSnippet: `const cache = new Map();

async function get(key, fetcher) {
  // Map.has distinguishes a cached falsy value from a missing entry.
  if (cache.has(key)) {
    return cache.get(key);
  }

  // Cache the in-flight Promise immediately
  const pending = (async () => {
    try {
      return await fetcher();
    } catch (err) {
      // Clean up on failure so retries can trigger fetcher again
      cache.delete(key);
      throw err;
    }
  })();
  cache.set(key, pending);

  return pending;
}`,
      }

    case 'AD3':
      return {
        name: 'Python — Mutating a list while iterating',
        language: 'python',
        rootCause:
          'When iterating through a list using `for u in users:`, Python maintains an internal index pointer (0, 1, 2...). When `users.remove(u)` is called, the element is deleted and all subsequent elements shift left by one index. The iterator then advances to the next index, inadvertently skipping the element that just shifted into the current index. This causes consecutive inactive users to be missed.',
        fixSummary:
          'Do not mutate the list while iterating forward. Instead, construct a new filtered list using a list comprehension (`[u for u in users if u.get("active") is not False]`), or iterate over a shallow copy / in reverse.',
        edgeCases: [
          '**Consecutive inactive items**: e.g., `[active, inactive, inactive, active]`. The second inactive user must not be skipped.',
          '**Preserving order**: the order of remaining active users must be strictly preserved.',
          '**Empty lists or lists with no inactive users**: must return expected result without raising exceptions.',
          '**Clear explanation**: explain the root cause in a code comment as requested.',
        ],
        codeSnippet: `def remove_inactive(users):
    # Root Cause: Mutating a list in-place (users.remove(u)) while iterating forward
    # shifts subsequent elements left by 1 index, causing the iterator pointer to
    # skip the next element.
    # Fix: Construct a new list using a list comprehension to preserve order safely.
    if not isinstance(users, list):
        return []
    return [u for u in users if u.get('active') is not False]`,
      }

    case 'AF1':
      return {
        name: 'Feature: Build a sliding-window rate limiter',
        language: 'javascript',
        rootCause:
          'A sliding-window rate limiter needs to track timestamps per user within a rolling duration (`windowMs`). Expired timestamps older than `now - windowMs` must be pruned so memory does not grow unbounded. The Express middleware must extract the client identifier, check `isAllowed()`, set `Retry-After: <seconds>` header, and respond with HTTP 429 when blocked.',
        fixSummary:
          'Maintain a `Map` or hash table mapping `userId -> timestamp[]`. On each request: filter timestamps to keep only `t > now - windowMs`. If `timestamps.length < maxRequests`, push `now` and return `true`. Otherwise return `false`. In Express middleware: if `!isAllowed()`, set `Retry-After` in seconds and return HTTP 429.',
        edgeCases: [
          '**Window Sliding**: requests made 61 seconds ago should expire and allow new requests.',
          '**Multiple users**: user A reaching the limit must not affect user B.',
          '**Memory cleanup**: ensure arrays do not store millions of old timestamps.',
          '**HTTP 429 & Retry-After**: middleware must set header `Retry-After: Math.ceil(windowMs / 1000)` and status 429.',
        ],
        codeSnippet: `// In-memory sliding-window store: userId -> array of timestamps
const userTimestamps = new Map();

function isAllowed(userId, maxRequests = 5, windowMs = 60000) {
  const now = Date.now();
  
  if (!userTimestamps.has(userId)) {
    userTimestamps.set(userId, []);
  }

  // 1. Clean expired timestamps outside the rolling window
  const active = userTimestamps.get(userId).filter(ts => now - ts < windowMs);

  // 2. Check if within limit
  if (active.length < maxRequests) {
    active.push(now);
    userTimestamps.set(userId, active);
    return true;
  }

  // Update cleaned list even when blocked
  userTimestamps.set(userId, active);
  return false;
}

// Express Middleware implementation
function rateLimitMiddleware(req, res, next) {
  const userId = req.ip || req.headers['x-user-id'] || 'anonymous';
  const windowMs = 60000;
  const maxRequests = 5;

  if (isAllowed(userId, maxRequests, windowMs)) {
    return next();
  }

  // Set HTTP 429 and Retry-After header (in seconds)
  const retryAfterSec = Math.ceil(windowMs / 1000);
  res.setHeader('Retry-After', retryAfterSec);
  return res.status(429).json({
    error: 'Too Many Requests',
    message: \`Rate limit exceeded. Please retry in \${retryAfterSec} seconds.\`
  });
}`,
      }

    // ---------------- Assessment 2 — Capgemini 2027 mock ----------------
    case 'CG1':
      return {
        name: 'Python — First character appearing exactly twice',
        language: 'python',
        rootCause:
          'The buggy version returns the first character whose frequency is 1, i.e. the first character appearing exactly ONCE. The requirement is the first character (in original string order) appearing exactly TWICE. Comparing against the wrong count makes it return the wrong character, and characters appearing 3+ times must also be excluded — "at least twice" is not the same as "exactly twice".',
        fixSummary: 'Count every character first, then scan the string in its original order and return the first character whose count is exactly 2; return an empty string when none qualifies.',
        edgeCases: [
          '**Exactly twice only**: `aabbc` → `a`. A character appearing 3+ times (`aaab`) must NOT be returned.',
          '**No qualifying character**: return `\'\'` (empty string), never `None`.',
          '**Original order matters**: scan the input string, not the dictionary, so insertion order cannot mislead you.',
          '**Empty input**: `\'\'` returns `\'\'` without raising.',
        ],
        codeSnippet: `def first_repeated(s):
    # Count every character first.
    freq = {}
    for ch in s:
        freq[ch] = freq.get(ch, 0) + 1

    # Scan in ORIGINAL order and return the first one seen exactly twice.
    for ch in s:
        if freq[ch] == 2:
            return ch
    return ''`,
      }

    case 'CG2':
      return {
        name: 'Python — Rotate an array by k positions',
        language: 'python',
        rootCause:
          'Rotation breaks when k is not normalised against the list length. If k >= len(arr) the slice indices run past the end and produce a wrong (or empty) result, and a k that is an exact multiple of the length must be a no-op. Negative or zero-length inputs must also be handled before slicing.',
        fixSummary: 'Normalise with `k = k % len(arr)` (guarding against an empty list), then return `arr[-k:] + arr[:-k]` for a right rotation — returning a copy rather than mutating the caller\'s list.',
        edgeCases: [
          '**k larger than the length**: `rotate([1,2], 3)` must behave like `k = 1`.',
          '**k a multiple of the length**: `rotate([1,2], 4)` is a no-op and returns `[1,2]`.',
          '**Empty list**: must not raise ZeroDivisionError on the modulo.',
          '**k = 0**: returns the list unchanged.',
        ],
        codeSnippet: `def rotate(arr, k):
    if not arr:
        return []
    # Normalise so k is always inside the list length.
    k = k % len(arr)
    if k == 0:
        return list(arr)
    # Right rotation, returning a new list (no mutation of the input).
    return list(arr[-k:]) + list(arr[:-k])`,
      }

    case 'CG3':
      return {
        name: 'JavaScript — Binary search for the FIRST position',
        language: 'javascript',
        rootCause:
          'A plain binary search returns as soon as it finds ANY match. With duplicates that is usually a middle occurrence, not the first. To find the leftmost index you must record the hit and keep searching the LEFT half (`hi = mid - 1`) instead of returning immediately.',
        fixSummary: 'On a match, store the index in a result variable and continue searching left; return the stored index (or -1) once the loop ends.',
        edgeCases: [
          '**Duplicates**: `firstPos([1,2,2,2,3], 2)` must return `1`, not `2` or `3`.',
          '**Absent key / empty array**: return `-1`.',
          '**All elements equal**: `firstPos([5,5,5,5], 5)` returns `0`.',
          '**Boundaries**: the first and last element must both be findable.',
        ],
        codeSnippet: `function firstPos(a, k) {
  let lo = 0, hi = a.length - 1, res = -1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (a[mid] === k) {
      res = mid;      // record the hit...
      hi = mid - 1;   // ...but keep looking to the LEFT for an earlier one
    } else if (a[mid] < k) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return res;
}`,
      }

    case 'CG4':
      return {
        name: 'AI-assisted Coding — Merge overlapping booking intervals',
        language: 'javascript',
        rootCause:
          'Merging requires the intervals to be processed in start order, so an unsorted input must be sorted first. Two further traps: intervals that merely TOUCH (`[1,3]` and `[3,5]`) still merge, so the comparison must be `<=` not `<`; and sorting or pushing the original inner arrays mutates the caller\'s input, which the tests check for.',
        fixSummary: 'Copy the array before sorting by start, then fold left: if the next start is <= the last end, extend the last end to the max of the two; otherwise push a COPY of the interval.',
        edgeCases: [
          '**Overlapping**: `[[1,3],[2,6],[8,10],[15,18]]` → `[[1,6],[8,10],[15,18]]`.',
          '**Touching**: `[[1,4],[4,5]]` → `[[1,5]]` (use `<=`, not `<`).',
          '**Unsorted input**: must be sorted by start before folding.',
          '**No mutation**: the input array and its inner arrays must be unchanged afterwards.',
          '**Empty input**: returns `[]`.',
        ],
        codeSnippet: `function mergeIntervals(intervals) {
  if (!Array.isArray(intervals) || intervals.length === 0) return [];

  // Copy before sorting so the caller's array is never mutated.
  const sorted = intervals.map(iv => [iv[0], iv[1]]).sort((a, b) => a[0] - b[0]);

  const out = [];
  for (const [start, end] of sorted) {
    const last = out[out.length - 1];
    // "<=" so intervals that merely touch are merged too.
    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      out.push([start, end]);
    }
  }
  return out;
}`,
      }

    default:
      return {
        name: 'Technical Coding Task',
        language: 'text',
        rootCause: 'Inspect the task requirements, edge cases, and test harness.',
        fixSummary: 'Write clean, defensive code handling boundary conditions.',
        edgeCases: ['Null/undefined inputs', 'Out-of-range parameters', 'Type checking'],
        codeSnippet: `// Code implementation here`,
      }
  }
}

function analyzeUserCode(taskId: string, code: string): string {
  const c = (code || '').trim()
  if (!c) {
    return 'There is no draft in the editor yet. Share code to review, or send a specific question about what you are trying to understand.'
  }

  const cl = c.toLowerCase()

  if (taskId === 'AD1') {
    const hasZeroIndexFix = /page\s*-\s*1|page\s*-\s*size|start\s*=\s*\(?page\s*-\s*1\)?/.test(cl)
    const hasZeroOrNegativeCheck = /page\s*<\s*1|size\s*<=?\s*0|<=?\s*0/.test(cl)
    const hasBeyondCheck = /len\s*\(|start\s*>=\s*len|min\(/.test(cl)

    const notes: string[] = []
    if (hasZeroIndexFix) {
      notes.push('✅ **1-based index calculation**: You correctly adjusted the `(page - 1) * size` offset.')
    } else {
      notes.push('⚠️ **Index calculation**: Make sure `page=1` calculates `start = 0`. Use `start = (page - 1) * size`.')
    }

    if (hasZeroOrNegativeCheck) {
      notes.push('✅ **Edge cases**: You are checking for `page < 1` and `size <= 0`.')
    } else {
      notes.push('⚠️ **Validation**: Add checks for `page < 1` and `size <= 0` to return `[]`.')
    }

    if (hasBeyondCheck) {
      notes.push('✅ **Boundary check**: You check if `start >= len(items)`.')
    }

    return `### 🔍 Review of your draft code:\n\n${notes.join('\n\n')}\n\n**Tip:** Run the test suite to check boundary cases against your current code.`
  }

  if (taskId === 'AD2') {
    const cachesPromise = /cache\[key\]\s*=\s*(async|\(?new\s+promise|fetcher\(\))/i.test(cl) || /inflight|pending/i.test(cl)
    const handlesFailure = /delete\s+cache\[key\]|try\s*\{[\s\S]*catch/i.test(cl)
    const returnsCache = /return\s+cache(?:\[key\]|\.get\(key\))/i.test(cl)

    const notes: string[] = []
    if (cachesPromise) {
      notes.push('✅ **Promise Caching**: You cache the in-flight Promise immediately so concurrent callers share the same fetch.')
    } else {
      notes.push('⚠️ **Race Condition Warning**: Ensure you store the pending Promise in `cache[key]` *before* awaiting `fetcher()`.')
    }

    if (handlesFailure) {
      notes.push('✅ **Error Recovery**: You clean up `cache[key]` upon failure to enable retries.')
    } else {
      notes.push('⚠️ **Error Handling**: Wrap the fetch in a `try...catch` and `delete cache[key]` on error so failed calls can retry.')
    }

    if (returnsCache) {
      notes.push('✅ **Return Value**: Returning the cached promise.')
    }

    return `### 🔍 Review of your draft code:\n\n${notes.join('\n\n')}\n\n**Tip:** Click **"▶ Run hidden tests"** above to test concurrent fetches and failure retries!`
  }

  if (taskId === 'AD3') {
    const usesListComp = /\[.*for.*in.*if.*\]/.test(cl) || /filter\s*\(/.test(cl)
    const avoidsMutate = !/\.remove\s*\(/.test(cl)
    const checksActive = /active/.test(cl)

    const notes: string[] = []
    if (avoidsMutate && (usesListComp || checksActive)) {
      notes.push('✅ **Safe Filtering**: You avoid modifying the list while iterating, preserving order and preventing skipped elements.')
    } else if (!avoidsMutate) {
      notes.push('⚠️ **List Mutation Warning**: `users.remove(u)` inside the loop will skip consecutive inactive users. Use a list comprehension `[u for u in users if u.get("active") is not False]`.')
    }

    return `### 🔍 Review of your draft code:\n\n${notes.join('\n\n')}\n\n**Tip:** Click **"▶ Run hidden tests"** above to test your fix against consecutive inactive items!`
  }

  if (taskId === 'AF1') {
    const hasFilter = /filter|date\.now|performance\.now/.test(cl)
    const hasAllowedFn = /isallowed|is_allowed/.test(cl)
    const hasMiddleware = /middleware|429|retry-after|status\(429\)/.test(cl)

    const notes: string[] = []
    if (hasAllowedFn && hasFilter) {
      notes.push('✅ **Sliding Window Logic**: You filter timestamps older than `now - windowMs`.')
    } else {
      notes.push('⚠️ **Sliding Window**: Store timestamps in an array per user and filter with `now - ts < windowMs`.')
    }

    if (hasMiddleware) {
      notes.push('✅ **Express Integration**: Middleware returns HTTP 429 and `Retry-After` header.')
    } else {
      notes.push('⚠️ **Express Middleware**: Include the middleware function returning `res.status(429)` and `res.setHeader("Retry-After", seconds)`.')
    }

    return `### 🔍 Review of your draft code:\n\n${notes.join('\n\n')}\n\n**Tip:** Click **"▶ Run feature tests"** above to test the rate limiter!`
  }

  if (taskId === 'CG1') {
    const countsFirst = /freq|count|counter|\{\}/.test(cl)
    const exactlyTwo = /==\s*2|===\s*2/.test(cl)
    const scansString = /for\s+\w+\s+in\s+s\b/.test(cl)
    const notes: string[] = []
    notes.push(exactlyTwo
      ? '✅ **Exact count**: You compare the frequency against exactly `2`.'
      : '⚠️ **Wrong count**: The requirement is *exactly twice*. Compare `freq[ch] == 2` — not `== 1` and not `>= 2`.')
    notes.push(countsFirst
      ? '✅ **Two passes**: You build the frequency map before deciding.'
      : '⚠️ **Count first**: Build a full frequency map in one pass, then decide in a second pass.')
    if (scansString) notes.push('✅ **Original order**: You scan the string itself, so the first-in-order rule holds.')
    return `### 🔍 Review of your draft code:\n\n${notes.join('\n\n')}\n\n**Tip:** Run the test suite to check duplicates, boundaries, and unusual inputs.`
  }

  if (taskId === 'CG2') {
    const hasModulo = /%\s*len\(|k\s*%=/.test(cl)
    const guardsEmpty = /if\s+not\s+arr|len\(arr\)\s*==\s*0/.test(cl)
    const notes: string[] = []
    notes.push(hasModulo
      ? '✅ **Normalised k**: `k % len(arr)` keeps oversized rotations correct.'
      : '⚠️ **Normalise k**: Without `k = k % len(arr)`, a k larger than the list breaks the slice.')
    notes.push(guardsEmpty
      ? '✅ **Empty guard**: You handle the empty list before the modulo.'
      : '⚠️ **Empty list**: Guard before `% len(arr)` or it raises ZeroDivisionError.')
    return `### 🔍 Review of your draft code:\n\n${notes.join('\n\n')}\n\n**Tip:** Click **"▶ Run hidden tests"** to verify k > len and k = multiple of len.`
  }

  if (taskId === 'CG3') {
    const keepsSearchingLeft = /hi\s*=\s*mid\s*-\s*1/.test(cl)
    const recordsResult = /res\s*=\s*mid|ans\s*=\s*mid|result\s*=\s*mid|first\s*=\s*mid/.test(cl)
    const returnsMinusOne = /-\s*1/.test(cl)
    const notes: string[] = []
    if (recordsResult && keepsSearchingLeft) {
      notes.push('✅ **Leftmost search**: You record the hit and keep narrowing to the left half.')
    } else {
      notes.push('⚠️ **Returning too early**: On a match, store the index and set `hi = mid - 1` instead of returning — otherwise you get a middle duplicate.')
    }
    if (returnsMinusOne) notes.push('✅ **Absent key**: You return `-1` when nothing matches.')
    return `### 🔍 Review of your draft code:\n\n${notes.join('\n\n')}\n\n**Tip:** Click **"▶ Run hidden tests"** to check duplicates and boundaries.`
  }

  if (taskId === 'CG4') {
    const sorts = /sort\s*\(/.test(cl)
    const copiesFirst = /\[\s*\.\.\.|slice\(\)|\.map\s*\(/.test(cl)
    const touching = /<=\s*last|<=\s*out\[|start\s*<=/.test(cl)
    const notes: string[] = []
    notes.push(sorts
      ? '✅ **Sorted by start**: Required before folding intervals.'
      : '⚠️ **Sort first**: Unsorted input cannot be merged in one pass.')
    notes.push(copiesFirst
      ? '✅ **No mutation**: You copy before sorting, so the caller\'s array is safe.'
      : '⚠️ **Mutation risk**: `intervals.sort()` sorts in place — copy with `[...intervals]` first. One hidden test checks this.')
    notes.push(touching
      ? '✅ **Touching intervals**: Your comparison uses `<=`, so `[1,3]` and `[3,5]` merge.'
      : '⚠️ **Touching intervals**: Use `start <= last[1]` (not `<`) so touching ranges merge.')
    return `### 🔍 Review of your draft code:\n\n${notes.join('\n\n')}\n\n**Tip:** Run the feature test suite to check ordering, touching ranges, and input immutability.`
  }

  return `Your code looks like a good start. Click **Run Tests** above to execute it against test cases.`
}

function generateHeuristicResponse(req: AssistantRequest): AssistantResponse {
  const { taskId, messages, currentCode } = req
  const knowledge = getTaskKnowledge(taskId)
  const lastMsg = [...messages].reverse().find((message) => message.role === 'user')?.content.trim() || ''
  const q = lastMsg.toLowerCase()

  let reply = ''

  // 1. Check if user wants code review
  if (
    q.includes('review') ||
    q.includes('check my code') ||
    q.includes('is this right') ||
    q.includes('look at my code') ||
    q.includes('evaluate my code')
  ) {
    reply = analyzeUserCode(taskId, currentCode || '')
  }
  // 2. Check if user wants root cause / explanation of bug
  else if (
    q.includes('root cause') ||
    q.includes('explain the bug') ||
    q.includes('why is this happening') ||
    q.includes('why') ||
    q.includes('how does') ||
    q.includes('how do i') ||
    q.includes('race condition') ||
    q.includes('explain') ||
    q.includes('what is the problem')
  ) {
    reply = `### 🐛 Root Cause Explanation for ${knowledge.name}\n\n${knowledge.rootCause}\n\n### 💡 The Fix:\n${knowledge.fixSummary}\n\nWould you like to see a complete code example or explore edge cases?`
  }
  // 3. Check if user asks about edge cases
  else if (
    q.includes('edge case') ||
    q.includes('test case') ||
    q.includes('boundary') ||
    q.includes('fail') ||
    q.includes('what is tested')
  ) {
    reply = `### 🛡️ Edge Cases Tested for ${knowledge.name}\n\nHere are the critical boundary conditions evaluated by the test runner:\n\n`
    knowledge.edgeCases.forEach((e) => {
      reply += `- ${e}\n`
    })
    reply += `\nMake sure your function handles these cases without crashing or throwing unhandled exceptions!`
  }
  // 4. Check if user asks for solution / code / fix
  else if (
    q.includes('show code') ||
    q.includes('give me the code') ||
    q.includes('solution') ||
    q.includes('how to fix') ||
    q.includes('corrected function') ||
    q.includes('show fix') ||
    q.includes('code snippet') ||
    q.includes('write the code') ||
    q.includes('implement')
  ) {
    reply = `### 🛠️ Corrected Solution for ${knowledge.name}\n\nHere is a complete implementation addressing the behavior you asked about:\n\n\`\`\`${knowledge.language}\n${knowledge.codeSnippet}\n\`\`\`\n\n### 📌 Key Highlights:\n- **Core logic**: Addresses the root cause.\n- **Boundary handling**: Covers the task's important edge cases.\n- Use Copy if you want to move the snippet into your editor.`
  }
  // 5. Check if user asks about hints / approach
  else if (q.includes('hint') || q.includes('approach') || q.includes('how do i start')) {
    reply = `### 💡 Strategy & Hints for ${knowledge.name}\n\n1. **Understand the index/concurrency model**: ${knowledge.fixSummary}\n2. **Handle Edge Cases**: ${knowledge.edgeCases[0]}\n3. **Test thoroughly**: Run the hidden tests as you make changes.\n\nWould you like a code snippet or a review of your current code?`
  }
  // 6. A vague or unrelated prompt must not trigger a pre-written solution.
  // Ask a clarifying question and wait for the candidate's own direction.
  else {
    reply = lastMsg
      ? `I need a more specific question about **${knowledge.name}** before I can help. What behavior are you trying to understand, what result did you expect, or what error/test failure are you seeing? I will answer the question you actually send rather than guessing that you want a full solution.`
      : `Nothing has been asked yet. Type a specific question about **${knowledge.name}** when you are ready; I will not generate an answer or code until you send a prompt.`
  }

  return {
    reply,
    engine: 'heuristic',
  }
}

// ---------------------------------------------------------------------------
// Main Assistant Export
// ---------------------------------------------------------------------------

export async function chatWithAssistant(req: AssistantRequest): Promise<AssistantResponse> {
  const { taskId, taskTitle, taskPrompt, buggyOrSpec, currentCode, messages } = req
  const knowledge = getTaskKnowledge(taskId)

  if (isCalibiAiConfigured()) {
    const systemPrompt = `You are the CalibiAI Coding Assistant embedded inside a proctored graduate hiring assessment.
The student is working on Stage 3/4 (${taskId}: "${taskTitle || knowledge.name}").
Proctoring rules strictly prevent tab switching, so you are their in-exam companion.

TASK DETAILS:
- Task ID: ${taskId}
- Title: ${taskTitle || knowledge.name}
- Requirement / Prompt: ${taskPrompt || ''}
- Buggy Code or Spec:
"""
${buggyOrSpec || ''}
"""
- Student's Current Code Draft:
"""
${currentCode || '(empty)'}
"""

GUIDELINES:
1. Answer the latest candidate-authored message directly; do not send an unsolicited answer or solution.
2. Do not treat the task description, examples, or editor contents as a request to write code. For vague greetings or requests, ask one concise clarifying question.
3. Give a complete code block only when the candidate explicitly asks for code/a fix, or when code is necessary to answer their specific question.
4. Help explain root causes, algorithmic approaches, concurrency, and relevant edge cases without volunteering unrelated details.
5. For code reviews, assess the current draft constructively and do not silently replace it.
6. Be concise, polite, and accurate.`

    const calibiAiReply = await callCalibiAiChat(systemPrompt, messages)
    if (calibiAiReply) {
      return {
        reply: calibiAiReply,
        engine: 'calibiai',
      }
    }
  }

  // Heuristic knowledge engine fallback
  return generateHeuristicResponse(req)
}
