/**
 * Generic hidden-test judge for company-assessment coding problems.
 *
 * Every company coding problem is data: a function name per language, JSON
 * test cases and a comparison mode. This module turns that data into a Python
 * or Node harness and executes it through the same hardened subprocess runner
 * (`runStdin`: stdin-fed code, hard process timeout, marked JSON result) as
 * the platform's other in-browser compilers.
 *
 * LeetCode-style judging
 *   - Per-test time limits. A slow (e.g. O(n²)) solution fails only the stress
 *     tests it cannot finish — "Time Limit Exceeded" — instead of the whole
 *     run timing out. Python uses SIGALRM, JavaScript uses `vm` timeouts.
 *   - Deterministic generators. Stress inputs (10⁵ elements) are described as
 *     `{"$gen": "ints", "n": 100000, …}` and expanded inside the harness by a
 *     tiny xorshift PRNG implemented identically in both languages, so the
 *     bank stays small and both languages see byte-identical inputs.
 *   - Digests. Large expected outputs are stored as `{"$digest": sha256}` of
 *     the canonical JSON and compared by hash.
 *   - Per-test verdicts: passed / wrong / tle / error, with timings. Sample
 *     tests (the statement's examples) also report the candidate's output.
 *
 * Comparison is JSON-canonical and type-aware: `True` never equals `1`, and
 * integral floats (Python's `/`) are normalised to integers so `2.0 == 2`.
 * Server-only: it needs the hidden tests.
 */
import { runStdin, stripCodeFence, type TestRunResult } from '../runTests.ts'
import type { CodingQuestion, CodingTest } from './types.ts'
import { SUPPORTED_LANGS, type CodeLang } from './languages.ts'
import { runNativeCodingTests } from './nativeRunner.ts'

export type { CodeLang } from './languages.ts'
export { SUPPORTED_LANGS }

const MARKER = '__CALIBIAI_TEST_RESULT__:'

/** Ignore implausibly large submissions (protects parsing and the child). */
export const MAX_CODE_BYTES = 64 * 1024

/** Default per-test limit for ordinary (small) tests. */
export const DEFAULT_TEST_LIMIT_MS = 1000
/** Stop running ordinary tests after this many consecutive time-outs. */
const TLE_ABORT_AFTER = 2
/** Hard ceiling for one judge process (a safety net — see runBudgetMs). */
export const MAX_RUN_MS = 45_000
/**
 * Time-limit calibration: each judge run times a fixed micro-benchmark and
 * scales every limit by (measured / nominal), clamped to [1, MAX_SPEED_FACTOR],
 * so a slow or busy server does not time out correct solutions. Nominals are
 * the benchmark on the reference hardware (2.6 GHz Xeon).
 */
export const MAX_SPEED_FACTOR = 3
const PY_NOMINAL_S = 0.0065
const JS_NOMINAL_MS = 8

/** Per-test time limit for `lang` (stress tests carry their own limit). */
export function testLimitMs(t: Pick<CodingTest, 'limitMs'>, lang: CodeLang): number {
  const l = t.limitMs
  if (typeof l === 'number' && l > 0) return l
  if (l && typeof l === 'object') {
    const v = Number((l as Record<string, unknown>)[lang])
    if (Number.isFinite(v) && v > 0) return v
  }
  return DEFAULT_TEST_LIMIT_MS
}

function engineFor(lang: CodeLang): TestRunResult['engine'] {
  return lang === 'javascript' ? 'node' : lang
}

/** Whole-process budget: every test at its limit, plus interpreter start-up. */
export function runBudgetMs(q: Pick<CodingQuestion, 'tests'>, lang: CodeLang): number {
  // Ordinary tests and stress tests each stop after TLE_ABORT_AFTER time-outs,
  // so a run can never exceed: every stress limit once + a couple of ordinary
  // limits + the (fast) rest — all scaled by the worst calibration factor.
  const stress = q.tests.filter((t) => t.stress).reduce((s, t) => s + testLimitMs(t, lang), 0)
  const normal = q.tests.filter((t) => !t.stress)
  const normalBudget = normal.reduce((s, t) => s + Math.min(testLimitMs(t, lang), 200), 0) + TLE_ABORT_AFTER * DEFAULT_TEST_LIMIT_MS
  return Math.min(MAX_RUN_MS, 4000 + MAX_SPEED_FACTOR * (stress + normalBudget))
}

function harnessTests(q: CodingQuestion, lang: CodeLang) {
  return q.tests.map((t) => ({
    name: t.name,
    args: t.args,
    expected: t.expected,
    limit: testLimitMs(t, lang),
    ...(t.stress ? { stress: true } : {}),
    ...(t.sample ? { sample: true } : {}),
  }))
}

/* ------------------------------------------------------------------ */
/* Python                                                              */
/* ------------------------------------------------------------------ */

export const PY_GENERATORS = String.raw`
M32 = 0xFFFFFFFF
class _Rng:
    def __init__(self, seed):
        self.x = (int(seed) & M32) or 0x9E3779B9
    def next(self):
        x = self.x
        x ^= (x << 13) & M32
        x ^= x >> 17
        x ^= (x << 5) & M32
        self.x = x
        return x
    def randint(self, lo, hi):
        return lo + self.next() % (hi - lo + 1)

def _gen(spec):
    if isinstance(spec, list):
        return [_gen(x) for x in spec]
    if not isinstance(spec, dict):
        return spec
    if "$gen" not in spec:
        return {k: _gen(v) for k, v in spec.items()}
    g = spec["$gen"]
    r = _Rng(spec.get("seed", 1))
    n = int(spec.get("n", 0))
    if g == "ints":
        lo, hi = spec["lo"], spec["hi"]
        return [r.randint(lo, hi) for _ in range(n)]
    if g == "distinct":
        lo, hi = spec["lo"], spec["hi"]
        seen = set()
        out = []
        while len(out) < n:
            v = r.randint(lo, hi)
            if v not in seen:
                seen.add(v)
                out.append(v)
        return out
    if g == "perm":
        base = spec.get("base", 0)
        a = list(range(base, base + n))
        for i in range(n - 1, 0, -1):
            j = r.randint(0, i)
            a[i], a[j] = a[j], a[i]
        return a
    if g == "str":
        al = spec["alphabet"]
        k = len(al) - 1
        return "".join(al[r.randint(0, k)] for _ in range(n))
    if g == "range":
        return list(range(spec["start"], spec["stop"], spec.get("step", 1)))
    if g == "repeat":
        return [_gen(spec["value"]) for _ in range(n)]
    if g == "strrepeat":
        return str(spec["value"]) * n
    if g == "concat":
        parts = [_gen(p) for p in spec["parts"]]
        if all(isinstance(p, str) for p in parts):
            return "".join(parts)
        out = []
        for p in parts:
            out.extend(p)
        return out
    if g == "sorted":
        v = _gen(spec["of"])
        return sorted(v, reverse=bool(spec.get("desc")))
    if g == "grid":
        if "values" in spec:
            vals = spec["values"]
            k = len(vals) - 1
            return [[vals[r.randint(0, k)] for _ in range(spec["cols"])] for _ in range(spec["rows"])]
        lo, hi = spec["lo"], spec["hi"]
        return [[r.randint(lo, hi) for _ in range(spec["cols"])] for _ in range(spec["rows"])]
    if g == "choice":
        vals = spec["values"]
        k = len(vals) - 1
        return [vals[r.randint(0, k)] for _ in range(n)]
    if g == "shuffle":
        a = list(_gen(spec["of"]))
        for i in range(len(a) - 1, 0, -1):
            j = r.randint(0, i)
            a[i], a[j] = a[j], a[i]
        return a
    if g == "countup":
        base = spec.get("base", 0)
        out = []
        for i in range(int(spec["k"])):
            out.extend([base + i] * (i + 1))
        return out
    if g == "chunks":
        v = _gen(spec["of"])
        size = int(spec["size"])
        out = [v[i:i + size] for i in range(0, len(v), size)]
        if spec.get("sort"):
            out = [sorted(c) for c in out]
        return out
    if g == "col":
        return [row[spec["index"]] for row in _gen(spec["of"])]
    if g == "zip":
        parts = [_gen(p) for p in spec["parts"]]
        return [list(t) for t in zip(*parts)]
    if g == "patch":
        grid = _gen(spec["of"])
        for cell in spec["cells"]:
            grid[cell[0]][cell[1]] = cell[2]
        return grid
    if g == "strs":
        al = spec["alphabet"]
        k = len(al) - 1
        ln = int(spec["len"])
        uniq = bool(spec.get("unique"))
        seen = set()
        out = []
        guard = 0
        while len(out) < n and guard < n * 50:
            guard += 1
            w = "".join(al[r.randint(0, k)] for _ in range(ln))
            if uniq:
                if w in seen:
                    continue
                seen.add(w)
            out.append(w)
        return out
    if g == "affine":
        a, b, c = spec.get("a", 1), spec.get("b", 1), spec.get("c", 0)
        return [[a * i + b * j + c for j in range(spec["cols"])] for i in range(spec["rows"])]
    if g == "intervals":
        lo, hi, mn, mx = spec["lo"], spec["hi"], spec.get("minLen", 0), spec["maxLen"]
        out = []
        for _ in range(n):
            s = r.randint(lo, hi)
            out.append([s, s + r.randint(mn, mx)])
        return out
    if g == "edges":
        m, base = spec["m"], spec.get("base", 0)
        directed = bool(spec.get("directed", True))
        weighted = "wlo" in spec
        wlo, whi = spec.get("wlo", 0), spec.get("whi", 0)
        acyclic = bool(spec.get("acyclic"))
        seen = set()
        out = []
        def add(u, v):
            if acyclic and u > v:
                u, v = v, u
            key = u * n + v if directed else min(u, v) * n + max(u, v)
            if u == v or key in seen:
                return
            seen.add(key)
            e = [u + base, v + base]
            if weighted:
                e.append(r.randint(wlo, whi))
            out.append(e)
        if spec.get("connected", True):
            for v in range(1, n):
                add(r.randint(0, v - 1), v)
        guard = 0
        while len(out) < m and guard < m * 20:
            guard += 1
            add(r.randint(0, n - 1), r.randint(0, n - 1))
        return out
    raise ValueError("unknown generator " + str(g))
`

function pythonHarness(q: CodingQuestion, compute: boolean): string {
  const tests = JSON.stringify(harnessTests(q, 'python'))
  return `
import io, json, sys, time, signal, hashlib
sys.setrecursionlimit(10000)
CAND = sys.stdin.read()
_REAL = sys.stdout
sys.stdout = io.StringIO()
TESTS = json.loads(${JSON.stringify(tests)})
FN = ${JSON.stringify(q.fn.python)}
MODE = ${JSON.stringify(q.compare)}
COMPUTE = ${compute ? 'True' : 'False'}
def emit(p):
    _REAL.write(${JSON.stringify(MARKER)} + json.dumps(p) + "\\n")
    _REAL.flush()
def fail_all(msg):
    emit({"results": [{"name": t["name"], "passed": False, "status": "error"} for t in TESTS], "error": msg})
    sys.exit(0)
${PY_GENERATORS}
ns = {}
try:
    exec(CAND, ns)
except BaseException as e:
    fail_all("Your code failed to run: " + (type(e).__name__ + ": " + str(e))[:300])
fn = ns.get(FN)
if not callable(fn):
    fail_all("Define a function named " + FN + "(...)")
def canon(v):
    if isinstance(v, bool) or v is None or isinstance(v, str):
        return v
    if isinstance(v, float) and v.is_integer():
        return int(v)
    if isinstance(v, (list, tuple)):
        return [canon(x) for x in v]
    if isinstance(v, dict):
        return {str(k): canon(x) for k, x in v.items()}
    return v
def cstr(x):
    return json.dumps(x, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
def shape(v):
    v = canon(v)
    if MODE == "unordered" and isinstance(v, list):
        return sorted(v, key=cstr)
    if MODE == "unordered-nested" and isinstance(v, list):
        return sorted([sorted(x, key=cstr) if isinstance(x, list) else x for x in v], key=cstr)
    return v
def digest(v):
    return hashlib.sha256(cstr(shape(v)).encode("utf-8")).hexdigest()
def same(got, exp):
    if isinstance(exp, dict) and "$digest" in exp and len(exp) == 1:
        return digest(got) == exp["$digest"]
    if MODE == "float":
        try:
            return abs(float(got) - float(exp)) < 1e-6
        except Exception:
            return False
    return cstr(shape(got)) == cstr(shape(exp))
def short(v):
    try:
        s = cstr(canon(v))
    except Exception:
        s = repr(v)
    return s if len(s) <= 300 else s[:297] + "..."
class _TLE(BaseException):
    pass
def _alarm(signum, frame):
    raise _TLE()
# Per-test timers need SIGALRM (Linux/macOS). Elsewhere (e.g. Windows dev
# machines) fall back to the whole-process watchdog instead of crashing.
_HAS_ALARM = hasattr(signal, "SIGALRM") and hasattr(signal, "setitimer")
if _HAS_ALARM:
    signal.signal(signal.SIGALRM, _alarm)
def _timer(seconds):
    if _HAS_ALARM:
        signal.setitimer(signal.ITIMER_REAL, seconds)
def _calibrate():
    best = 1e9
    for _ in range(3):
        t0 = time.perf_counter()
        s = 0
        for i in range(200000):
            s += i & 7
        best = min(best, time.perf_counter() - t0)
    return best
# Scale limits on a slow or busy machine (1x on the reference hardware, max ${MAX_SPEED_FACTOR}x).
SPEED = min(${MAX_SPEED_FACTOR}.0, max(1.0, _calibrate() / ${PY_NOMINAL_S}))
results = []
outputs = []
tles = 0
stress_tles = 0
for t in TESTS:
    if (tles >= ${TLE_ABORT_AFTER} and not t.get("stress")) or (stress_tles >= ${TLE_ABORT_AFTER} and t.get("stress")):
        row = {"name": t["name"], "passed": False, "status": "tle", "ms": 0, "message": "Not run — earlier tests exceeded the time limit."}
        if t.get("stress"):
            row["stress"] = True
        results.append(row)
        continue
    try:
        args = _gen(t["args"])
    except BaseException as e:
        fail_all("Test generation failed: " + str(e)[:200])
    status = "passed"
    message = None
    got = None
    t0 = time.perf_counter()
    try:
        _timer(t["limit"] * SPEED / 1000.0)
        got = fn(*args)
        _timer(0)
    except _TLE:
        status = "tle"
    except RecursionError:
        _timer(0)
        status = "error"
        message = "RecursionError: maximum recursion depth exceeded"
    except BaseException as e:
        _timer(0)
        status = "error"
        message = (type(e).__name__ + ": " + str(e))[:200]
    ms = int((time.perf_counter() - t0) * 1000)
    if status == "tle":
        ms = int(t["limit"] * SPEED)
        if t.get("stress"):
            stress_tles += 1
        else:
            tles += 1
    if COMPUTE:
        outputs.append({"value": canon(shape(got)) if status == "passed" else None, "digest": digest(got) if status == "passed" else None, "status": status, "ms": ms, "message": message})
        continue
    if status == "passed":
        try:
            ok = same(got, t["expected"])
        except BaseException:
            ok = False
        if not ok:
            status = "wrong"
    row = {"name": t["name"], "passed": status == "passed", "status": status, "ms": ms}
    if t.get("stress"):
        row["stress"] = True
    if message:
        row["message"] = message
    if t.get("sample"):
        row["sample"] = True
        if status == "wrong":
            row["got"] = short(got)
            row["expected"] = short(t["expected"])
    results.append(row)
if COMPUTE:
    emit({"results": [], "outputs": outputs, "speed": SPEED})
else:
    emit({"results": results, "speed": SPEED})
`
}

/* ------------------------------------------------------------------ */
/* JavaScript                                                          */
/* ------------------------------------------------------------------ */

export const JS_GENERATORS = String.raw`
function _Rng(seed) {
  let x = (Number(seed) >>> 0) || 0x9E3779B9
  return {
    next() { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x },
    randint(lo, hi) { return lo + (this.next() % (hi - lo + 1)) },
  }
}
function _gen(spec) {
  if (Array.isArray(spec)) return spec.map(_gen)
  if (spec === null || typeof spec !== 'object') return spec
  if (!('$gen' in spec)) { const o = {}; for (const k of Object.keys(spec)) o[k] = _gen(spec[k]); return o }
  const g = spec.$gen
  const r = _Rng(spec.seed === undefined ? 1 : spec.seed)
  const n = Number(spec.n || 0)
  if (g === 'ints') { const out = new Array(n); for (let i = 0; i < n; i++) out[i] = r.randint(spec.lo, spec.hi); return out }
  if (g === 'distinct') {
    const seen = new Set(); const out = []
    while (out.length < n) { const v = r.randint(spec.lo, spec.hi); if (!seen.has(v)) { seen.add(v); out.push(v) } }
    return out
  }
  if (g === 'perm') {
    const base = spec.base || 0; const a = new Array(n)
    for (let i = 0; i < n; i++) a[i] = base + i
    for (let i = n - 1; i > 0; i--) { const j = r.randint(0, i); const t = a[i]; a[i] = a[j]; a[j] = t }
    return a
  }
  if (g === 'str') { const al = spec.alphabet; const k = al.length - 1; let s = ''; for (let i = 0; i < n; i++) s += al[r.randint(0, k)]; return s }
  if (g === 'range') { const out = []; const step = spec.step || 1; for (let v = spec.start; step > 0 ? v < spec.stop : v > spec.stop; v += step) out.push(v); return out }
  if (g === 'repeat') { const out = new Array(n); for (let i = 0; i < n; i++) out[i] = _gen(spec.value); return out }
  if (g === 'strrepeat') return String(spec.value).repeat(n)
  if (g === 'concat') {
    const parts = spec.parts.map(_gen)
    if (parts.every((p) => typeof p === 'string')) return parts.join('')
    const out = []; for (const p of parts) for (const x of p) out.push(x); return out
  }
  if (g === 'sorted') { const v = _gen(spec.of).slice().sort((a, b) => a - b); return spec.desc ? v.reverse() : v }
  if (g === 'grid') {
    const vals = spec.values, k = vals ? vals.length - 1 : 0
    const out = []
    for (let i = 0; i < spec.rows; i++) { const row = new Array(spec.cols); for (let j = 0; j < spec.cols; j++) row[j] = vals ? vals[r.randint(0, k)] : r.randint(spec.lo, spec.hi); out.push(row) }
    return out
  }
  if (g === 'choice') { const vals = spec.values, k = vals.length - 1; const out = new Array(n); for (let i = 0; i < n; i++) out[i] = vals[r.randint(0, k)]; return out }
  if (g === 'shuffle') { const a = _gen(spec.of).slice(); for (let i = a.length - 1; i > 0; i--) { const j = r.randint(0, i); const t = a[i]; a[i] = a[j]; a[j] = t } return a }
  if (g === 'countup') { const base = spec.base || 0; const out = []; for (let i = 0; i < spec.k; i++) for (let c = 0; c <= i; c++) out.push(base + i); return out }
  if (g === 'chunks') { const v = _gen(spec.of), size = spec.size; const out = []; for (let i = 0; i < v.length; i += size) { const c = v.slice(i, i + size); out.push(spec.sort ? c.sort((a, b) => a - b) : c) } return out }
  if (g === 'col') return _gen(spec.of).map((row) => row[spec.index])
  if (g === 'zip') {
    const parts = spec.parts.map(_gen); const len = parts.reduce((m, p) => Math.min(m, p.length), Infinity)
    const out = []; for (let i = 0; i < len; i++) out.push(parts.map((p) => p[i])); return out
  }
  if (g === 'patch') { const grid = _gen(spec.of); for (const c of spec.cells) grid[c[0]][c[1]] = c[2]; return grid }
  if (g === 'strs') {
    const al = spec.alphabet, k = al.length - 1, ln = spec.len, uniq = !!spec.unique
    const seen = new Set(); const out = []; let guard = 0
    while (out.length < n && guard < n * 50) {
      guard++
      let w = ''; for (let i = 0; i < ln; i++) w += al[r.randint(0, k)]
      if (uniq) { if (seen.has(w)) continue; seen.add(w) }
      out.push(w)
    }
    return out
  }
  if (g === 'affine') {
    const a = spec.a === undefined ? 1 : spec.a, b = spec.b === undefined ? 1 : spec.b, c = spec.c || 0
    const out = []; for (let i = 0; i < spec.rows; i++) { const row = []; for (let j = 0; j < spec.cols; j++) row.push(a * i + b * j + c); out.push(row) } return out
  }
  if (g === 'intervals') {
    const mn = spec.minLen || 0; const out = []
    for (let i = 0; i < n; i++) { const s = r.randint(spec.lo, spec.hi); out.push([s, s + r.randint(mn, spec.maxLen)]) }
    return out
  }
  if (g === 'edges') {
    const m = spec.m, base = spec.base || 0, directed = spec.directed === undefined ? true : !!spec.directed
    const weighted = 'wlo' in spec
    const acyclic = !!spec.acyclic
    const seen = new Set(); const out = []
    const add = (u, v) => {
      if (acyclic && u > v) { const t = u; u = v; v = t }
      const key = directed ? u * n + v : Math.min(u, v) * n + Math.max(u, v)
      if (u === v || seen.has(key)) return
      seen.add(key)
      const e = [u + base, v + base]
      if (weighted) e.push(r.randint(spec.wlo, spec.whi))
      out.push(e)
    }
    if (spec.connected === undefined || spec.connected) for (let v = 1; v < n; v++) add(r.randint(0, v - 1), v)
    let guard = 0
    while (out.length < m && guard < m * 20) { guard++; const u = r.randint(0, n - 1); add(u, r.randint(0, n - 1)) }
    return out
  }
  throw new Error('unknown generator ' + g)
}
`

function nodeHarness(q: CodingQuestion, compute: boolean): string {
  const tests = JSON.stringify(harnessTests(q, 'javascript'))
  const fn = q.fn.javascript
  if (!/^[A-Za-z_$][\w$]*$/.test(fn)) throw new Error(`Invalid function name ${fn}`)
  return `
const fs = require('fs')
const vm = require('vm')
const crypto = require('crypto')
const MARKER = ${JSON.stringify(MARKER)}
const TESTS = ${tests}
const MODE = ${JSON.stringify(q.compare)}
const COMPUTE = ${compute ? 'true' : 'false'}
const code = fs.readFileSync(0, 'utf8')
// Pipe writes are asynchronous in Node, so write synchronously (retrying on
// EAGAIN) before exiting — process.exit() would otherwise truncate at 64KB.
const writeAllSync = (str) => {
  const buf = Buffer.from(str, 'utf8')
  let off = 0
  while (off < buf.length) {
    try { off += fs.writeSync(1, buf, off, buf.length - off) }
    catch (e) { if (!e || e.code !== 'EAGAIN') throw e; const until = Date.now() + 2; while (Date.now() < until) {} }
  }
}
const emit = (p) => writeAllSync(MARKER + JSON.stringify(p) + '\\n')
const failAll = (msg) => { emit({ results: TESTS.map((t) => ({ name: t.name, passed: false, status: 'error' })), error: msg }); process.exit(0) }
${JS_GENERATORS}
// Candidate code runs in the MAIN context (a separate vm context makes every
// global lookup such as Math.max ~80x slower, which would unfairly time out
// efficient solutions). vm.runInThisContext still enforces per-test limits.
// require/process/module are shadowed so a solution cannot tamper with the
// harness by accident; its console output is discarded.
const noop = () => {}
for (const k of ['log', 'info', 'warn', 'error', 'debug', 'table', 'dir', 'trace']) console[k] = noop
const candModule = { exports: {} }
try {
  const source = code.replace(/(^|\\n)\\s*export\\s+(?=(?:async\\s+)?(?:function|const|let|var|class)\\b)/g, '$1')
  globalThis.__factory = vm.runInThisContext('(function (require, process, module, exports, __filename, __dirname) {\\n' + source + '\\n;return (typeof ${fn} === "function") ? ${fn} : ((module && module.exports && typeof module.exports.${fn} === "function") ? module.exports.${fn} : (typeof module.exports === "function" ? module.exports : undefined));\\n})', { filename: 'solution.js' })
  globalThis.__mod = candModule
  globalThis.__fn = vm.runInThisContext('__factory(undefined, undefined, __mod, __mod.exports, undefined, undefined)', { timeout: 3000 })
} catch (e) {
  failAll('Your code failed to run: ' + String(e && e.message ? e.message : e).slice(0, 300))
}
if (typeof globalThis.__fn !== 'function') failAll('Define a function named ${fn}(...)')
const stable = (v) => {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']'
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}'
  return JSON.stringify(v === undefined ? null : v)
}
const canon = (v) => JSON.parse(JSON.stringify(v === undefined ? null : v))
const byKey = (a, b) => { const x = stable(a), y = stable(b); return x < y ? -1 : x > y ? 1 : 0 }
const shape = (v) => {
  v = canon(v)
  if (MODE === 'unordered' && Array.isArray(v)) return [...v].sort(byKey)
  if (MODE === 'unordered-nested' && Array.isArray(v)) return v.map((x) => Array.isArray(x) ? [...x].sort(byKey) : x).sort(byKey)
  return v
}
const digest = (v) => crypto.createHash('sha256').update(stable(shape(v)), 'utf8').digest('hex')
const same = (got, exp) => {
  if (exp && typeof exp === 'object' && !Array.isArray(exp) && Object.keys(exp).length === 1 && '$digest' in exp) return digest(got) === exp.$digest
  if (MODE === 'float') return Math.abs(Number(got) - Number(exp)) < 1e-6
  return stable(shape(got)) === stable(shape(exp))
}
const short = (v) => { let s; try { s = stable(canon(v)) } catch (e) { s = String(v) } return s.length <= 300 ? s : s.slice(0, 297) + '...' }
const withTimeout = (p, ms) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'ERR_SCRIPT_EXECUTION_TIMEOUT' })), ms)
  p.then((v) => { clearTimeout(t); resolve(v) }, (e) => { clearTimeout(t); reject(e) })
})
// Scale limits on a slow or busy machine (1x on the reference hardware, max ${MAX_SPEED_FACTOR}x).
const SPEED = (() => {
  let best = Infinity
  for (let k = 0; k < 3; k++) {
    const t0 = process.hrtime.bigint()
    let s = 0
    for (let i = 0; i < 5e6; i++) s = (s + (i & 7)) | 0
    const ms = Number(process.hrtime.bigint() - t0) / 1e6
    if (ms < best) best = ms
    globalThis.__sink = s
  }
  return Math.min(${MAX_SPEED_FACTOR}, Math.max(1, best / ${JS_NOMINAL_MS}))
})()
;(async () => {
  const results = []
  const outputs = []
  let tles = 0, stressTles = 0
  for (const t of TESTS) {
    if ((tles >= ${TLE_ABORT_AFTER} && !t.stress) || (stressTles >= ${TLE_ABORT_AFTER} && t.stress)) {
      results.push({ name: t.name, passed: false, status: 'tle', ms: 0, message: 'Not run — earlier tests exceeded the time limit.', ...(t.stress ? { stress: true } : {}) })
      continue
    }
    let args
    try { args = _gen(t.args) } catch (e) { failAll('Test generation failed: ' + String(e && e.message || e).slice(0, 200)) }
    globalThis.__args = args
    args = null
    let status = 'passed', message, got
    const t0 = process.hrtime.bigint()
    try {
      const lim = Math.round(t.limit * SPEED)
      got = vm.runInThisContext('__fn.apply(null, __args)', { timeout: lim })
      if (got && typeof got.then === 'function') got = await withTimeout(got, lim)
    } catch (e) {
      if (e && e.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') status = 'tle'
      else { status = 'error'; message = String((e && e.name ? e.name + ': ' : '') + (e && e.message ? e.message : e)).slice(0, 200) }
    }
    let ms = Math.round(Number(process.hrtime.bigint() - t0) / 1e6)
    if (status === 'tle') { ms = Math.round(t.limit * SPEED); if (t.stress) stressTles++; else tles++ }
    if (COMPUTE) {
      outputs.push({ value: status === 'passed' ? shape(got) : null, digest: status === 'passed' ? digest(got) : null, status, ms, message: message || null })
      continue
    }
    if (status === 'passed') {
      let ok = false
      try { ok = same(got, t.expected) } catch (e) { ok = false }
      if (!ok) status = 'wrong'
    }
    const row = { name: t.name, passed: status === 'passed', status, ms }
    if (t.stress) row.stress = true
    if (message) row.message = message
    if (t.sample) {
      row.sample = true
      if (status === 'wrong') { row.got = short(got); row.expected = short(t.expected) }
    }
    results.push(row)
  }
  emit(COMPUTE ? { results: [], outputs, speed: SPEED } : { results, speed: SPEED })
  process.exit(0)
})()
`
}

function harnessFor(q: CodingQuestion, lang: 'python' | 'javascript', compute: boolean): string {
  return lang === 'python' ? pythonHarness(q, compute) : nodeHarness(q, compute)
}

function prepare(code: string, lang: CodeLang, total: number): { candidate: string } | { fail: TestRunResult } {
  const engine = engineFor(lang)
  const candidate = stripCodeFence(String(code || '').trim())
  if (!SUPPORTED_LANGS.includes(lang)) return { fail: { passed: 0, total, results: [], engine, error: `Unsupported language: ${lang}` } }
  if (!candidate) return { fail: { passed: 0, total, results: [], engine, error: 'No code submitted — 0 tests passed.' } }
  if (candidate.length > MAX_CODE_BYTES) return { fail: { passed: 0, total, results: [], engine, error: 'Code is too large to run.' } }
  return { candidate }
}

/**
 * Run the hidden tests of `q` against `code`. Never throws; a crash, timeout
 * or missing function is a failed run against the known test count.
 */
export async function runCodingTests(q: CodingQuestion, code: string, lang: CodeLang): Promise<TestRunResult> {
  if (lang !== 'python' && lang !== 'javascript') return runNativeCodingTests(q, code, lang)
  const total = q.tests.length
  const prep = prepare(code, lang, total)
  if ('fail' in prep) return prep.fail
  const engine = engineFor(lang)
  let harness: string
  try {
    harness = harnessFor(q, lang, false)
  } catch (e: any) {
    return { passed: 0, total, results: [], engine, error: String(e?.message || e) }
  }
  const interpreter: 'python' | 'node' = lang === 'python' ? 'python' : 'node'
  const res = await runStdin(interpreter, harness, prep.candidate, { timeoutMs: runBudgetMs(q, lang) })
  return res.total === 0 ? { ...res, total } : res
}

export interface ComputedOutput {
  value: unknown
  digest: string | null
  status: 'passed' | 'tle' | 'error'
  ms: number
  message?: string | null
}

/**
 * Authoring helper: run `code` (a reference solution) and return the raw,
 * canonicalised output of every test instead of judging it. Used by
 * scripts/company-bank/compile-coding.mjs to fill in expected values.
 */
export async function computeOutputs(
  q: CodingQuestion,
  code: string,
  lang: CodeLang,
  timeoutMs = 120_000,
): Promise<{ outputs: ComputedOutput[]; error?: string }> {
  if (lang !== 'python' && lang !== 'javascript') return { outputs: [], error: 'Reference-output generation supports Python 3 and JavaScript only.' }
  const prep = prepare(code, lang, q.tests.length)
  if ('fail' in prep) return { outputs: [], error: prep.fail.error }
  const engine = lang === 'python' ? 'python' : 'node'
  const res: any = await runStdin(engine, harnessFor(q, lang, true), prep.candidate, { timeoutMs, raw: true })
  if (!Array.isArray(res.outputs)) return { outputs: [], error: res.error || 'no outputs' }
  return { outputs: res.outputs, ...(res.error ? { error: res.error } : {}) }
}

/** One-line human summary of a judged run (used in result feedback). */
export function summarizeRun(run: TestRunResult): string {
  const tle = run.results.filter((r) => r.status === 'tle').length
  const wrong = run.results.filter((r) => r.status === 'wrong').length
  const err = run.results.filter((r) => r.status === 'error').length
  const parts = [`${run.passed}/${run.total} hidden tests passed`]
  if (tle) parts.push(`${tle} time limit exceeded`)
  if (wrong) parts.push(`${wrong} wrong answer${wrong > 1 ? 's' : ''}`)
  if (err) parts.push(`${err} runtime error${err > 1 ? 's' : ''}`)
  return parts.join(' · ')
}
