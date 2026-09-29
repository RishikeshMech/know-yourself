import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { loadBank } from '../company/bank.ts'
import { runCodingTests } from '../company/codeRunner.ts'
import { CODE_LANGUAGES } from '../company/languages.ts'
import { availableCodeLanguages } from '../company/nativeRunner.ts'
import { createNativeHarness } from '../company/nativeCode.ts'
import { starterFor } from '../company/codeTemplates.ts'
import type { CodingQuestion } from '../company/types.ts'

const bank = loadBank()
const q = (slug: string) => bank.byId.get(`s3-c-${slug}`) as CodingQuestion
const hasCommand = (command: string, args: string[]) => {
  const result = spawnSync(command, args, { stdio: 'ignore', timeout: 2500 })
  return !result.error && result.status === 0
}
const expectedRuntimes = new Set([
  ...(hasCommand('python3', ['--version']) ? ['python'] : []),
  ...(hasCommand('node', ['--version']) ? ['javascript'] : []),
  ...(hasCommand('javac', ['-version']) && hasCommand('java', ['-version']) ? ['java'] : []),
  ...(hasCommand('gcc', ['--version']) ? ['c'] : []),
  ...(hasCommand('g++', ['--version']) ? ['cpp'] : []),
  ...(hasCommand('rustc', ['--version']) ? ['rust'] : []),
  ...(hasCommand('go', ['version']) ? ['go'] : []),
])
const available = new Set(availableCodeLanguages())

const sumSolutions = {
  java: `public long subarraySum(long[] nums, long k) {
    java.util.Map<Long, Long> frequency = new java.util.HashMap<>();
    frequency.put(0L, 1L);
    long prefix = 0, count = 0;
    for (long value : nums) {
      prefix += value;
      count += frequency.getOrDefault(prefix - k, 0L);
      frequency.put(prefix, frequency.getOrDefault(prefix, 0L) + 1L);
    }
    return count;
  }`,
  rust: `fn subarray_sum(nums: Vec<i64>, k: i64) -> i64 {
    let mut frequency = HashMap::new();
    frequency.insert(0_i64, 1_i64);
    let mut prefix = 0_i64;
    let mut count = 0_i64;
    for value in nums {
      prefix += value;
      count += *frequency.get(&(prefix - k)).unwrap_or(&0);
      *frequency.entry(prefix).or_insert(0) += 1;
    }
    count
  }`,
  go: `func subarraySum(nums []int64, k int64) int64 {
    frequency := map[int64]int64{0: 1}
    var prefix, count int64
    for _, value := range nums {
      prefix += value
      count += frequency[prefix-k]
      frequency[prefix]++
    }
    return count
  }`,
}

test('company code templates define all seven language integrations and produce a starter per language', () => {
  const question = q('subarray-sum-equals-k')
  assert.deepEqual(CODE_LANGUAGES.map((language) => language.id), ['python', 'javascript', 'java', 'c', 'cpp', 'rust', 'go'])
  for (const { id } of CODE_LANGUAGES) {
    const starter = starterFor(question, id)
    assert.ok(starter.trim(), `${id} starter is empty`)
    const expectedFunction = id === 'python' || id === 'c' || id === 'rust' ? question.fn.python : question.fn.javascript
    assert.ok(starter.includes(expectedFunction), `${id} starter has the wrong function name`)
  }
})

test('company runtime discovery only advertises interpreters and compilers available on this host', () => {
  assert.deepEqual([...available].sort(), [...expectedRuntimes].sort())
  assert.ok([...available].every((id) => CODE_LANGUAGES.some((language) => language.id === id)))
})

test('Java harness splits large generated test cases below class-file string limits', () => {
  const question = q('subarray-sum-equals-k')
  const largeQuestion = {
    ...question,
    tests: [{ name: 'large input', args: [Array.from({ length: 40000 }, (_, i) => i), 0], expected: 0 }],
  }
  const harness = createNativeHarness(largeQuestion, starterFor(largeQuestion, 'java'), 'java', 'RESULT:')
  const caseArray = harness.source.split('static final String[] CASES = new String[]{')[1]?.split('};', 1)[0] || ''
  const literals = caseArray.match(/"(?:\\.|[^"\\])*"/g) || []
  assert.match(caseArray, /joinCase\(/)
  assert.ok(literals.length > 1, 'the test input is split over multiple Java constants')
  assert.ok(literals.every((literal) => literal.length < 16_010), 'each generated literal stays below 16k source characters')
})

test('Go harness escapes its result-line newline for fmt.Printf', () => {
  const question = q('subarray-sum-equals-k')
  const harness = createNativeHarness(question, starterFor(question, 'go'), 'go', 'RESULT:')
  assert.ok(harness.source.includes('fmt.Printf("%s%s\\n",'), 'Go source must contain a newline escape in the format string')
  assert.ok(!harness.source.includes('fmt.Printf("%s%s\\\\n",'), 'Go source must not print a literal backslash-n')
})

test('native runner reports compiler and process failures as structured errors', { skip: !available.has('c') }, async () => {
  const question = q('subarray-sum-equals-k')
  const compileFailure = await runCodingTests(question, 'this is not valid C', 'c')
  assert.equal(compileFailure.engine, 'c')
  assert.equal(compileFailure.passed, 0)
  assert.equal(compileFailure.total, question.tests.length)
  assert.match(compileFailure.error || '', /Compilation failed/)

  const processFailure = await runCodingTests(question, `long long subarray_sum(LongArray nums, long long k) { (void)nums; (void)k; exit(42); return 0; }`, 'c')
  assert.equal(processFailure.engine, 'c')
  assert.equal(processFailure.passed, 0)
  assert.equal(processFailure.results.length, question.tests.length)
  assert.ok(processFailure.results.every((result) => result.status === 'error' && /status 42/.test(result.message || '')))

  const missingResult = await runCodingTests(question, `long long subarray_sum(LongArray nums, long long k) { (void)nums; (void)k; exit(0); return 0; }`, 'c')
  assert.equal(missingResult.engine, 'c')
  assert.equal(missingResult.passed, 0)
  assert.ok(missingResult.results.every((result) => result.status === 'error' && /did not return a result/.test(result.message || '')))
})

test('company native runner compiles C11 and judges hidden tests, including large prefix sums', { skip: !available.has('c') }, async () => {
  const solution = `typedef struct { long long key, count; unsigned char used; } Entry;
static size_t slot_for(long long key) {
  uint64_t x = (uint64_t)key + 0x9e3779b97f4a7c15ULL;
  x = (x ^ (x >> 30)) * 0xbf58476d1ce4e5b9ULL;
  x = (x ^ (x >> 27)) * 0x94d049bb133111ebULL;
  x ^= x >> 31;
  return (size_t)x & ((1u << 19) - 1);
}
long long subarray_sum(LongArray nums, long long k) {
  const size_t capacity = 1u << 19;
  Entry *table = (Entry*)calloc(capacity, sizeof(Entry));
  if (!table) return 0;
  size_t at = slot_for(0);
  table[at] = (Entry){0, 1, 1};
  long long prefix = 0, answer = 0;
  for (size_t i = 0; i < nums.len; ++i) {
    prefix += nums.data[i];
    long long target = prefix - k;
    at = slot_for(target);
    while (table[at].used && table[at].key != target) at = (at + 1) & (capacity - 1);
    if (table[at].used) answer += table[at].count;
    at = slot_for(prefix);
    while (table[at].used && table[at].key != prefix) at = (at + 1) & (capacity - 1);
    if (table[at].used) table[at].count++;
    else table[at] = (Entry){prefix, 1, 1};
  }
  free(table);
  return answer;
}`
  const result = await runCodingTests(q('subarray-sum-equals-k'), solution, 'c')
  assert.equal(result.engine, 'c')
  assert.equal(result.passed, result.total, result.error || JSON.stringify(result.results.filter((row) => !row.passed)))
})

test('company native runner compiles C++17 and judges its hidden tests', { skip: !available.has('cpp') }, async () => {
  const solution = `long long subarraySum(std::vector<long long> nums, long long k) {
  std::unordered_map<long long, long long> frequency{{0, 1}};
  frequency.reserve(nums.size() * 2);
  long long prefix = 0, count = 0;
  for (long long value : nums) { prefix += value; count += frequency[prefix - k]; ++frequency[prefix]; }
  return count;
}`
  const result = await runCodingTests(q('subarray-sum-equals-k'), solution, 'cpp')
  assert.equal(result.engine, 'cpp')
  assert.equal(result.passed, result.total, result.error || JSON.stringify(result.results.filter((row) => !row.passed)))
})

test('company native runner compiles Java and judges its hidden tests', { skip: !available.has('java') }, async () => {
  const result = await runCodingTests(q('subarray-sum-equals-k'), sumSolutions.java, 'java')
  assert.equal(result.engine, 'java')
  assert.equal(result.passed, result.total, result.error || JSON.stringify(result.results.filter((row) => !row.passed)))
})

test('company native runner compiles Rust and judges its hidden tests', { skip: !available.has('rust') }, async () => {
  const result = await runCodingTests(q('subarray-sum-equals-k'), sumSolutions.rust, 'rust')
  assert.equal(result.engine, 'rust')
  assert.equal(result.passed, result.total, result.error || JSON.stringify(result.results.filter((row) => !row.passed)))
})

test('company native runner compiles Go and judges its hidden tests', { skip: !available.has('go') }, async () => {
  const result = await runCodingTests(q('subarray-sum-equals-k'), sumSolutions.go, 'go')
  assert.equal(result.engine, 'go')
  assert.equal(result.passed, result.total, result.error || JSON.stringify(result.results.filter((row) => !row.passed)))
})
