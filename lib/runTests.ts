// Real test-runner for the coding modules (AI Debugging + AI Feature Dev).
// Executes the candidate's submitted code in an isolated subprocess (node for
// JS tasks, python3 for Python tasks) with a hard timeout and runs the ACTUAL
// hidden test cases. Unlike the old mock, empty/incomplete/wrong code fails the
// tests — nothing is fabricated from the length of the submission.
//
// Candidate code is fed to the child via STDIN (no shell interpolation), run in
// a throwaway subprocess with a strict timeout. In a shared/real deployment
// this should move to a hardened, network-less sandbox (docs/AI_EVALUATION.md).

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

const TIMEOUT_MS = 4000
const TOTALS: Record<string, number> = { AD1: 4, AD2: 4, AD3: 3, AF1: 5 }
const PY_TASKS: Record<string, boolean> = { AD1: true, AD3: true }

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
    const finish = (f: TestRunResult) => {
      if (settled) return
      settled = true
      resolve(f)
    }
    child.on('error', (e) => finish({ passed: 0, total: 0, results: [], engine, error: String(e?.message || e) }))
    child.on('close', () => {
      if (timedOut) return
      let json: any = null
      try { json = JSON.parse(stdout.trim()) } catch { /* ignore */ }
      if (json && json.results) {
        const results: TestCaseResult[] = json.results.map((r: any) => ({ name: String(r.name), passed: !!r.passed }))
        finish({ passed: results.filter((r) => r.passed).length, total: results.length, results, engine })
      } else {
        const err = (json && json.error) || (stderr || '').trim().slice(0, 500) || 'No result — code may have crashed.'
        finish({ passed: 0, total: 0, results: [], engine, error: err })
      }
    })
    const watchdog = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
      finish({ passed: 0, total: 0, results: [], engine, timedOut: true, error: 'Timed out (possible infinite loop).' })
    }, TIMEOUT_MS)
    child.stdin.write(candidate)
    child.stdin.end()
    child.on('exit', () => clearTimeout(watchdog))
  })
}

export async function runTests(taskId: string, code: string): Promise<TestRunResult> {
  const c = (code || '').trim()
  const total = TOTALS[taskId] || 0
  const engine: 'node' | 'python' = PY_TASKS[taskId] ? 'python' : 'node'
  // Honest baseline: nothing submitted means zero tests pass — never fabricate.
  if (!c) return { passed: 0, total, results: [], engine, error: 'No code submitted — 0 tests passed.' }
  const harness = PY_TASKS[taskId] ? PY_HARNESS[taskId] : NODE_HARNESS[taskId]
  if (!harness) return { passed: 0, total, results: [], engine, error: `Unknown task ${taskId}` }
  return runStdin(engine, harness, c)
}

// ---------------------------------------------------------------------------
// Python harness — the candidate's function is defined in a namespace, then
// each test calls it. Results are emitted as JSON on stdout.
// ---------------------------------------------------------------------------
const PY_COMMON = `
import json, sys, traceback
CAND = sys.stdin.read()
ns = {}
try:
    exec(CAND, ns)
except Exception as e:
    print(json.dumps({"error": "Your code failed to run: " + str(e)}))
    sys.exit(0)
def ok(fn):
    try:
        return bool(fn(ns))
    except Exception as e:
        return False
results = []
`

const PY_HARNESS: Record<string, string> = {
  AD1: PY_COMMON + `
TESTS = [
  ("page=1 returns first page", lambda ns: ns.get("paginate")(list(range(20)),1,5) == [0,1,2,3,4]),
  ("page=2 returns second page", lambda ns: ns.get("paginate")(list(range(20)),2,5) == [5,6,7,8,9]),
  ("handles page < 1 without crashing", lambda ns: isinstance(ns.get("paginate")(list(range(20)),0,5), list)),
  ("handles size<=0 and beyond last page", lambda ns: isinstance(ns.get("paginate")(list(range(20)),1,0), list) and isinstance(ns.get("paginate")(list(range(20)),99,5), list)),
]
for name, fn in TESTS:
    results.append({"name": name, "passed": ok(fn)})
print(json.dumps({"results": results}))
`,
  AD3: PY_COMMON + `
TESTS = [
  ("removes every inactive user", lambda ns: ns.get("remove_inactive")([{"active": True},{"active": False},{"active": False},{"active": True}]) == [{"active": True},{"active": True}]),
  ("preserves order of remaining users", lambda ns: [u["id"] for u in ns.get("remove_inactive")([{"id":1,"active":True},{"id":2,"active":False},{"id":3,"active":True}])] == [1,3]),
  ("no inactive user left behind", lambda ns: not any(u["active"] is False for u in ns.get("remove_inactive")([{"active": True},{"active": False},{"active": True}]))),
]
for name, fn in TESTS:
    results.append({"name": name, "passed": ok(fn)})
print(json.dumps({"results": results}))
`,
}

// ---------------------------------------------------------------------------
// Node harness — candidate code is evaled into the global scope; tests pull the
// candidate's functions from shared globals (isAllowed / get), run them (async
// aware) and emit JSON.
// ---------------------------------------------------------------------------
const NODE_COMMON = `
const fs = require('fs');
let code;
try {
  code = fs.readFileSync(0, 'utf8');
} catch (e) { console.log(JSON.stringify({error:'read'})); process.exit(0); }
try { (0, eval)(code); } catch (e) { console.log(JSON.stringify({error:'Your code failed to run: ' + e.message})); process.exit(0); }
function env() {
  const o = {};
  ['isAllowed','get'].forEach(k => {
    try { o[k] = (typeof globalThis[k] !== 'undefined') ? globalThis[k] : undefined; } catch(e){}
  });
  return o;
}
const results = [];
const TESTS = __TESTS__;
const fns = TESTS.map((t) => ({ name: t.name, fn: (0, eval)('(' + t.fn + ')') }));
function runAll() {
  return fns.reduce((acc, t) => acc.then(async () => {
    try { results.push({ name: t.name, passed: !!(await t.fn(env())) }); }
    catch (e) { results.push({ name: t.name, passed: false }); }
  }), Promise.resolve());
}
runAll().then(() => {
  console.log(JSON.stringify({ results }));
  process.exit(0);
});
setTimeout(() => { console.log(JSON.stringify({error:'Timed out'})); process.exit(0); }, 3500);
`

const NODE_TESTS: Record<string, Array<{ name: string; fn: string }>> = {
  AD2: [
    { name: 'concurrent calls fetch exactly once', fn: `async (env) => { const get = env.get; if (typeof get !== 'function') return false; let calls = 0; const fetcher = () => { calls++; return new Promise(r => setTimeout(() => r('val'), 5)); }; const rs = await Promise.all([get('k',fetcher),get('k',fetcher),get('k',fetcher)]); return calls === 1 && rs.every(v => v === 'val'); }` },
    { name: 'all callers receive the same value', fn: `async (env) => { const get = env.get; if (typeof get !== 'function') return false; const fetcher = () => Promise.resolve('shared'); const [a,b] = await Promise.all([get('x',fetcher),get('x',fetcher)]); return a === 'shared' && b === 'shared'; }` },
    { name: 'failed fetch clears in-flight so retry works', fn: `async (env) => { const get = env.get; if (typeof get !== 'function') return false; let calls = 0; const fetcher = () => { calls++; if (calls === 1) return Promise.reject(new Error('boom')); return Promise.resolve('ok'); }; try { await get('r',fetcher); } catch(e) {} const v = await get('r',fetcher); return v === 'ok' && calls === 2; }` },
    { name: 'returns cached value without refetch', fn: `async (env) => { const get = env.get; if (typeof get !== 'function') return false; let calls = 0; const fetcher = () => { calls++; return Promise.resolve('cached'); }; await get('z',fetcher); const v = await get('z',fetcher); return v === 'cached' && calls === 1; }` },
  ],
  AF1: [
    { name: 'allows fewer than maxRequests within window', fn: `async (env) => { const isAllowed = env.isAllowed; if (typeof isAllowed !== 'function') return false; const r=[]; for (let i=0;i<4;i++) r.push(isAllowed('u1',5,60000)); return r.every(Boolean); }` },
    { name: 'blocks when the limit is exceeded', fn: `async (env) => { const isAllowed = env.isAllowed; if (typeof isAllowed !== 'function') return false; let r=[]; for (let i=0;i<5;i++) r.push(isAllowed('u2',5,60000)); const blocked = isAllowed('u2',5,60000); return r.every(Boolean) && blocked === false; }` },
    { name: 'users are counted independently', fn: `async (env) => { const isAllowed = env.isAllowed; if (typeof isAllowed !== 'function') return false; for (let i=0;i<5;i++) isAllowed('u3',5,60000); return isAllowed('u4',5,60000) === true; }` },
    { name: 'still blocks immediately after the window elapses', fn: `async (env) => { const isAllowed = env.isAllowed; if (typeof isAllowed !== 'function') return false; let last=true; for (let i=0;i<3;i++) last=isAllowed('u5',3,60000); return isAllowed('u5',3,60000) === false; }` },
    { name: 'different users do not share a window', fn: `async (env) => { const isAllowed = env.isAllowed; if (typeof isAllowed !== 'function') return false; for (let i=0;i<3;i++) isAllowed('u6',3,60000); return isAllowed('u7',5,60000) === true; }` },
  ],
}

const NODE_HARNESS: Record<string, string> = {}
for (const [taskId, tests] of Object.entries(NODE_TESTS)) {
  NODE_HARNESS[taskId] = NODE_COMMON.replace('__TESTS__', JSON.stringify(tests))
}
