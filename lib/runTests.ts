// Real test-runner for the coding modules (AI Debugging + AI Feature Dev).
// Candidate code runs in a short-lived Node/Python subprocess. The harness reads
// code from stdin (never through a shell), has a hard timeout, captures candidate
// stdout, and emits a marked JSON result so ordinary print/console logging cannot
// corrupt the test response.
//
// Production note: this subprocess is not a security sandbox. A shared/public
// deployment should run it in a network-less container or microVM (see
// docs/AI_EVALUATION.md).
import { spawn } from 'child_process'

export interface TestCaseResult { name: string; passed: boolean }
export interface TestRunResult {
  passed: number
  total: number
  results: TestCaseResult[]
  engine: 'node' | 'python'
  error?: string
  timedOut?: boolean
}

const TIMEOUT_MS = 4_500
const NODE_RESULT_MARKER = '__CALIBIAI_TEST_RESULT__:'
const PY_RESULT_MARKER = '__CALIBIAI_TEST_RESULT__:'
const TOTALS: Record<string, number> = {
  AD1: 6, AD2: 6, AD3: 5, AF1: 8,
  CG1: 6, CG2: 6, CG3: 6, CG4: 7,
}
const PY_TASKS: Record<string, boolean> = { AD1: true, AD3: true, CG1: true, CG2: true }

function runStdin(engine: 'node' | 'python', harness: string, candidate: string): Promise<TestRunResult> {
  return new Promise((resolve) => {
    const cmd = engine === 'python' ? 'python3' : 'node'
    const args = engine === 'python' ? ['-I', '-c', harness] : ['-e', harness]
    let settled = false
    let timedOut = false
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => { stdout += d })
    child.stderr.on('data', (d) => { stderr += d })

    const finish = (result: TestRunResult) => {
      if (settled) return
      settled = true
      resolve(result)
    }

    child.on('error', (e) => finish({
      passed: 0, total: 0, results: [], engine,
      error: String(e?.message || e),
    }))
    child.on('close', () => {
      if (timedOut) return
      const marker = engine === 'python' ? PY_RESULT_MARKER : NODE_RESULT_MARKER
      const markerAt = stdout.lastIndexOf(marker)
      const resultText = markerAt >= 0 ? stdout.slice(markerAt + marker.length).trim().split(/\r?\n/, 1)[0] : ''
      let payload: any = null
      try { payload = JSON.parse(resultText) } catch { /* handled below */ }

      if (payload && Array.isArray(payload.results)) {
        const results: TestCaseResult[] = payload.results.map((r: any) => ({
          name: String(r.name),
          passed: !!r.passed,
        }))
        finish({
          passed: results.filter((r) => r.passed).length,
          total: results.length,
          results,
          engine,
          ...(payload.error ? { error: String(payload.error).slice(0, 500) } : {}),
        })
      } else {
        const err = payload?.error || (stderr || '').trim().slice(0, 500) || 'No result — code may have crashed.'
        finish({ passed: 0, total: 0, results: [], engine, error: String(err) })
      }
    })

    const watchdog = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
      finish({
        passed: 0, total: 0, results: [], engine, timedOut: true,
        error: 'Timed out (possible infinite loop).',
      })
    }, TIMEOUT_MS)
    child.on('exit', () => clearTimeout(watchdog))

    try {
      child.stdin.end(candidate)
    } catch (e: any) {
      child.kill('SIGKILL')
      finish({ passed: 0, total: 0, results: [], engine, error: String(e?.message || e) })
    }
  })
}

function stripCodeFence(code: string): string {
  return code
    .replace(/^\s*```[\w+-]*\s*\r?\n/, '')
    .replace(/\r?\n```\s*$/, '')
}

export async function runTests(taskId: string, code: string): Promise<TestRunResult> {
  const candidate = stripCodeFence(String(code || '').trim())
  const total = TOTALS[taskId] || 0
  const engine: 'node' | 'python' = PY_TASKS[taskId] ? 'python' : 'node'
  if (!total) return { passed: 0, total: 0, results: [], engine, error: `Unknown task ${taskId}` }
  if (!candidate) return { passed: 0, total, results: [], engine, error: 'No code submitted — 0 tests passed.' }

  const harness = PY_TASKS[taskId] ? PY_HARNESS[taskId] : NODE_HARNESS[taskId]
  if (!harness) return { passed: 0, total, results: [], engine, error: `No test harness is configured for ${taskId}` }

  const result = await runStdin(engine, harness, candidate)
  // A syntax/runtime failure or missing local interpreter is still a failed
  // submission against the known test suite, not a misleading 0/0 result.
  return result.total === 0 ? { ...result, total } : result
}

// ---------------------------------------------------------------------------
// Python harness — code executes into a namespace and tests call the declared
// function. Candidate print output is captured; only marked JSON reaches stdout.
// ---------------------------------------------------------------------------
const PY_COMMON = `
import io, json, sys
CAND = sys.stdin.read()
_REAL_STDOUT = sys.stdout
_CAPTURED_STDOUT = io.StringIO()
sys.stdout = _CAPTURED_STDOUT
ns = {}
def emit(payload):
    _REAL_STDOUT.write(${JSON.stringify(PY_RESULT_MARKER)} + json.dumps(payload) + "\\n")
    _REAL_STDOUT.flush()
try:
    exec(CAND, ns)
except BaseException as e:
    emit({"error": "Your code failed to run: " + str(e)})
    sys.exit(0)
def ok(fn):
    try:
        return bool(fn(ns))
    except BaseException:
        return False
results = []
`

const PY_HARNESS: Record<string, string> = {
  AD1: PY_COMMON + `
TESTS = [
  ("page 1 returns the first page", lambda ns: ns.get("paginate")(list(range(20)),1,5) == [0,1,2,3,4]),
  ("page 2 returns the second page", lambda ns: ns.get("paginate")(list(range(20)),2,5) == [5,6,7,8,9]),
  ("page below 1 is handled", lambda ns: isinstance(ns.get("paginate")(list(range(20)),0,5), list) and isinstance(ns.get("paginate")(list(range(20)),-2,5), list)),
  ("zero or negative size is handled", lambda ns: isinstance(ns.get("paginate")(list(range(20)),1,0), list) and isinstance(ns.get("paginate")(list(range(20)),1,-2), list)),
  ("page beyond the end returns empty", lambda ns: ns.get("paginate")(list(range(20)),99,5) == []),
  ("empty items return empty", lambda ns: ns.get("paginate")([],1,5) == []),
]
for name, fn in TESTS:
    results.append({"name": name, "passed": ok(fn)})
emit({"results": results})
`,
  AD3: PY_COMMON + `
TESTS = [
  ("removes consecutive inactive users", lambda ns: ns.get("remove_inactive")([{"active": True},{"active": False},{"active": False},{"active": True}]) == [{"active": True},{"active": True}]),
  ("preserves the order of remaining users", lambda ns: [u["id"] for u in ns.get("remove_inactive")([{"id":1,"active":True},{"id":2,"active":False},{"id":3,"active":True}])] == [1,3]),
  ("removes every inactive user", lambda ns: not any(u.get("active") is False for u in ns.get("remove_inactive")([{"active": True},{"active": False},{"active": True}]))),
  ("empty input returns empty", lambda ns: ns.get("remove_inactive")([]) == []),
  ("keeps users with no inactive flag", lambda ns: ns.get("remove_inactive")([{"id":1},{"id":2,"active":True}]) == [{"id":1},{"id":2,"active":True}]),
]
for name, fn in TESTS:
    results.append({"name": name, "passed": ok(fn)})
emit({"results": results})
`,
  CG1: PY_COMMON + `
TESTS = [
  ("returns the first char appearing exactly twice", lambda ns: ns.get("first_repeated")("aabbc") == "a"),
  ("respects original string order", lambda ns: ns.get("first_repeated")("abab") == "a" and ns.get("first_repeated")("bbaa") == "b"),
  ("rejects counts of one or three or more", lambda ns: ns.get("first_repeated")("aaab") == "" and ns.get("first_repeated")("abc") == ""),
  ("handles empty and no-match strings", lambda ns: ns.get("first_repeated")("") == "" and ns.get("first_repeated")("abcdefg") == ""),
  ("is case-sensitive", lambda ns: ns.get("first_repeated")("AaA") == "A"),
  ("handles punctuation as characters", lambda ns: ns.get("first_repeated")("!!?") == "!"),
]
for name, fn in TESTS:
    results.append({"name": name, "passed": ok(fn)})
emit({"results": results})
`,
  CG2: PY_COMMON + `
def _same(fn, a, k, expected):
    try:
        return fn(list(a), k) == expected
    except BaseException:
        return False
TESTS = [
  ("rotates right by k", lambda ns: _same(ns.get("rotate"), [1,2,3,4,5], 2, [4,5,1,2,3])),
  ("handles k greater than length", lambda ns: _same(ns.get("rotate"), [1,2,3,4,5], 7, [4,5,1,2,3]) and _same(ns.get("rotate"), [1,2], 3, [2,1])),
  ("zero rotation is unchanged", lambda ns: _same(ns.get("rotate"), [1,2,3,4,5], 0, [1,2,3,4,5])),
  ("empty list does not crash", lambda ns: _same(ns.get("rotate"), [], 3, [])),
  ("a multiple of length is a no-op", lambda ns: _same(ns.get("rotate"), [3,1,4,1], 8, [3,1,4,1])),
  ("single-item list stays unchanged", lambda ns: _same(ns.get("rotate"), [9], 101, [9])),
]
for name, fn in TESTS:
    results.append({"name": name, "passed": ok(fn)})
emit({"results": results})
`,
}

// ---------------------------------------------------------------------------
// Node harness — compile the candidate and its named declarations inside the
// same function scope. This deliberately supports const/let arrow functions as
// well as function declarations (indirect eval + globalThis lost const bindings).
// ---------------------------------------------------------------------------
const NODE_TESTS: Record<string, Array<{ name: string; fn: string }>> = {
  AD2: [
    { name: 'concurrent calls fetch exactly once', fn: `async (env) => { const get=env.get; if(typeof get!=='function') return false; let calls=0; const fetcher=()=>{calls++;return new Promise(r=>setTimeout(()=>r('val'),5))}; const rs=await Promise.all([get('k',fetcher),get('k',fetcher),get('k',fetcher)]); return calls===1 && rs.every(v=>v==='val') }` },
    { name: 'all callers receive the same value', fn: `async (env) => { const get=env.get; if(typeof get!=='function') return false; const [a,b]=await Promise.all([get('same',()=>Promise.resolve('shared')),get('same',()=>Promise.resolve('other'))]); return a==='shared' && b==='shared' }` },
    { name: 'failed fetch clears in-flight so retry works', fn: `async (env) => { const get=env.get; if(typeof get!=='function') return false; let calls=0; const fetcher=()=>{calls++;if(calls===1)return Promise.reject(new Error('boom'));return Promise.resolve('ok')}; try{await get('retry',fetcher)}catch(e){} const v=await get('retry',fetcher); return v==='ok' && calls===2 }` },
    { name: 'resolved values are cached', fn: `async (env) => { const get=env.get; if(typeof get!=='function') return false; let calls=0; const fetcher=()=>{calls++;return Promise.resolve('cached')}; await get('cache',fetcher); const v=await get('cache',fetcher); return v==='cached' && calls===1 }` },
    { name: 'falsy resolved values are cached too', fn: `async (env) => { const get=env.get; if(typeof get!=='function') return false; let calls=0; const fetcher=()=>{calls++;return Promise.resolve(0)}; const a=await get('zero',fetcher); const b=await get('zero',fetcher); return a===0 && b===0 && calls===1 }` },
    { name: 'different keys are cached independently', fn: `async (env) => { const get=env.get; if(typeof get!=='function') return false; const [a,b]=await Promise.all([get('left',()=>Promise.resolve('L')),get('right',()=>Promise.resolve('R'))]); return a==='L' && b==='R' }` },
  ],
  CG3: [
    { name: 'returns the first index of a duplicated key', fn: `async (env) => { const f=env.firstPos; return typeof f==='function' && f([1,2,2,2,3],2)===1 }` },
    { name: 'returns -1 when absent and handles empty input', fn: `async (env) => { const f=env.firstPos; return typeof f==='function' && f([1,2,2,2,3],9)===-1 && f([],5)===-1 }` },
    { name: 'all-equal array returns index zero', fn: `async (env) => { const f=env.firstPos; return typeof f==='function' && f([5,5,5,5],5)===0 }` },
    { name: 'works at both boundaries', fn: `async (env) => { const f=env.firstPos; return typeof f==='function' && f([7],7)===0 && f([1,2,3,4,5,6,7],1)===0 && f([1,2,3,4,5,6,7],7)===6 }` },
    { name: 'handles negative sorted values', fn: `async (env) => { const f=env.firstPos; return typeof f==='function' && f([-9,-4,-4,-1,0],-4)===1 }` },
    { name: 'returns -1 for a key between values', fn: `async (env) => { const f=env.firstPos; return typeof f==='function' && f([1,3,5,7],4)===-1 }` },
  ],
  CG4: [
    { name: 'merges overlapping intervals', fn: `async (env) => { const f=env.mergeIntervals; if(typeof f!=='function') return false; const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b); return eq(f([[1,3],[2,6],[8,10],[15,18]]),[[1,6],[8,10],[15,18]]) }` },
    { name: 'merges intervals that touch', fn: `async (env) => { const f=env.mergeIntervals; if(typeof f!=='function') return false; const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b); return eq(f([[1,4],[4,5]]),[[1,5]]) }` },
    { name: 'sorts unsorted input', fn: `async (env) => { const f=env.mergeIntervals; if(typeof f!=='function') return false; const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b); return eq(f([[8,10],[1,3],[2,6]]),[[1,6],[8,10]]) }` },
    { name: 'empty input returns empty array', fn: `async (env) => { const f=env.mergeIntervals; return typeof f==='function' && JSON.stringify(f([]))==='[]' }` },
    { name: 'does not mutate input or nested pairs', fn: `async (env) => { const f=env.mergeIntervals; if(typeof f!=='function') return false; const input=[[5,7],[1,3],[2,4]]; const snap=JSON.stringify(input); const out=f(input); return JSON.stringify(input)===snap && JSON.stringify(out)==='[[1,4],[5,7]]' }` },
    { name: 'merges contained and identical intervals', fn: `async (env) => { const f=env.mergeIntervals; return typeof f==='function' && JSON.stringify(f([[1,10],[2,3],[1,10]]))==='[[1,10]]' }` },
    { name: 'handles negative and single-point intervals', fn: `async (env) => { const f=env.mergeIntervals; return typeof f==='function' && JSON.stringify(f([[0,0],[-4,-2],[-2,1]]))==='[[-4,1]]' }` },
  ],
  AF1: [
    { name: 'allows requests below the limit', fn: `async (env) => { const f=env.isAllowed; if(typeof f!=='function') return false; const r=[]; for(let i=0;i<4;i++) r.push(f('u1',5,60000)); return r.every(Boolean) }` },
    { name: 'blocks the first request over the limit', fn: `async (env) => { const f=env.isAllowed; if(typeof f!=='function') return false; const r=[]; for(let i=0;i<5;i++) r.push(f('u2',5,60000)); return r.every(Boolean) && f('u2',5,60000)===false }` },
    { name: 'users are counted independently', fn: `async (env) => { const f=env.isAllowed; if(typeof f!=='function') return false; for(let i=0;i<5;i++) f('u3',5,60000); return f('u4',5,60000)===true }` },
    { name: 'expired timestamps allow a new request', fn: `async (env) => { const f=env.isAllowed; if(typeof f!=='function') return false; const original=Date.now; let now=100000; Date.now=()=>now; try { const first=f('expiry',1,1000); const blocked=f('expiry',1,1000); now+=1000; return first===true && blocked===false && f('expiry',1,1000)===true } finally { Date.now=original } }` },
    { name: 'uses custom max and window values', fn: `async (env) => { const f=env.isAllowed; return typeof f==='function' && f('custom',1,250)===true && f('custom',1,250)===false }` },
    { name: 'middleware calls next when allowed', fn: `async (env) => { const f=env.rateLimitMiddleware; if(typeof f!=='function') return false; let nextCalls=0; const res={headers:{},statusCode:0,body:null,setHeader(k,v){this.headers[k]=v;return this},status(c){this.statusCode=c;return this},json(v){this.body=v;return this}}; f({ip:'middleware-allow'},res,()=>{nextCalls++}); return nextCalls===1 && res.statusCode===0 }` },
    { name: 'middleware responds 429 with Retry-After when blocked', fn: `async (env) => { const f=env.rateLimitMiddleware; if(typeof f!=='function') return false; let nextCalls=0; const makeRes=()=>({headers:{},statusCode:0,body:null,setHeader(k,v){this.headers[k]=v;return this},status(c){this.statusCode=c;return this},json(v){this.body=v;return this}}); let last; for(let i=0;i<6;i++){const res=makeRes(); f({ip:'middleware-block'},res,()=>{nextCalls++}); if(i===5) last=res} return nextCalls===5 && last.statusCode===429 && Number(last.headers['Retry-After'])>0 }` },
    { name: 'middleware keeps separate user windows', fn: `async (env) => { const f=env.rateLimitMiddleware; if(typeof f!=='function') return false; const makeRes=()=>({statusCode:0,setHeader(){return this},status(c){this.statusCode=c;return this},json(){return this}}); let allowed=false; for(let i=0;i<6;i++) f({ip:'middleware-a'},makeRes(),()=>{}); f({ip:'middleware-b'},makeRes(),()=>{allowed=true}); return allowed }` },
  ],
}

const NODE_COMMON = `
const fs = require('fs')
const RESULT_MARKER = ${JSON.stringify(NODE_RESULT_MARKER)}
const TESTS = __TESTS__
const code = fs.readFileSync(0, 'utf8')
const emit = (payload) => process.stdout.write(RESULT_MARKER + JSON.stringify(payload) + '\\n')
const candidateModule = { exports: {} }
const originalConsoleMethods = {}
for (const method of ['log', 'info', 'warn', 'error', 'debug']) {
  originalConsoleMethods[method] = console[method]
  console[method] = () => {}
}
let candidateEnv = {}
try {
  // Most submissions are snippets, but tolerate common exported declarations.
  // The wrapper exposes lexical const/let declarations to tests.
  const source = code.replace(/(^|\\n)\\s*export\\s+(?=(?:async\\s+)?(?:function|const|let|var|class)\\b)/g, '$1')
  const expose = new Function('module', 'exports', source + '\\nreturn {\\n' +
    '  isAllowed: typeof isAllowed === "undefined" ? undefined : isAllowed,\\n' +
    '  rateLimitMiddleware: typeof rateLimitMiddleware === "undefined" ? undefined : rateLimitMiddleware,\\n' +
    '  get: typeof get === "undefined" ? undefined : get,\\n' +
    '  firstPos: typeof firstPos === "undefined" ? undefined : firstPos,\\n' +
    '  mergeIntervals: typeof mergeIntervals === "undefined" ? undefined : mergeIntervals,\\n' +
    '  ...(module && module.exports && typeof module.exports === "object" ? module.exports : {})\\n' +
    '}')
  candidateEnv = expose(candidateModule, candidateModule.exports) || {}
} catch (e) {
  emit({ results: TESTS.map(t => ({ name: t.name, passed: false })), error: 'Your code failed to run: ' + (e && e.message ? e.message : String(e)) })
  process.exit(0)
} finally {
  for (const method of Object.keys(originalConsoleMethods)) console[method] = originalConsoleMethods[method]
}
const env = () => candidateEnv
const fns = TESTS.map((t) => ({ name: t.name, fn: (0, eval)('(' + t.fn + ')') }))
const results = []
const watchdog = setTimeout(() => {
  emit({ error: 'Timed out (possible infinite loop).' })
  process.exit(0)
}, 3500)
async function runAll() {
  for (const t of fns) {
    try { results.push({ name: t.name, passed: !!(await t.fn(env())) }) }
    catch (e) { results.push({ name: t.name, passed: false }) }
  }
  clearTimeout(watchdog)
  emit({ results })
  process.exit(0)
}
runAll()
`

const NODE_HARNESS: Record<string, string> = {}
for (const [taskId, tests] of Object.entries(NODE_TESTS)) {
  NODE_HARNESS[taskId] = NODE_COMMON.replace('__TESTS__', JSON.stringify(tests))
}
