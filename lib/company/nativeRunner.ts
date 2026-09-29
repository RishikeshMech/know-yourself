import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import type { CodingQuestion, CodingTest } from './types.ts'
import { CODE_LANGUAGES, type CodeLang, type CompiledCodeLang } from './languages.ts'
import type { TestCaseResult, TestRunResult } from '../runTests.ts'
import { createNativeHarness } from './nativeCode.ts'
import { expandTestArgs } from './generators.ts'
import { stripCodeFence } from '../runTests.ts'

interface CommandResult {
  stdout: string
  stderr: string
  code: number | null
  timedOut: boolean
  launchError?: string
}

const OUTPUT_LIMIT = 16 * 1024 * 1024
const COMPILE_TIMEOUT_MS = 60_000
const PROCESS_BUDGET_MS = 45_000
const RESULT_MARKER = '__KNOW_YOURSELF_NATIVE_RESULT_'
const TOOLCHAIN_CHECK_TTL_MS = 60_000
let toolchainCache: { checkedAt: number; languages: CodeLang[] } | null = null

function toolAvailable(command: string, args: string[]): boolean {
  try {
    const result = spawnSync(command, args, { encoding: 'utf8', timeout: 2500, stdio: 'ignore' })
    return !result.error && result.status === 0
  } catch { return false }
}

/** Languages visible to candidates are limited to runtimes installed on this host. */
export function availableCodeLanguages(): CodeLang[] {
  if (toolchainCache && Date.now() - toolchainCache.checkedAt < TOOLCHAIN_CHECK_TTL_MS) return [...toolchainCache.languages]
  const languages = CODE_LANGUAGES.filter(({ id }) => {
    if (id === 'python') return toolAvailable('python3', ['--version'])
    if (id === 'javascript') return toolAvailable('node', ['--version'])
    if (id === 'c') return toolAvailable('gcc', ['--version'])
    if (id === 'cpp') return toolAvailable('g++', ['--version'])
    if (id === 'java') return toolAvailable('javac', ['-version']) && toolAvailable('java', ['-version'])
    if (id === 'rust') return toolAvailable('rustc', ['--version'])
    return toolAvailable('go', ['version'])
  }).map(({ id }) => id)
  toolchainCache = { checkedAt: Date.now(), languages }
  return [...languages]
}

function execute(command: string, args: string[], cwd: string, timeoutMs: number, maxOutput = OUTPUT_LIMIT): Promise<CommandResult> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(command, args, {
        cwd,
        env: {
          PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
          HOME: cwd,
          TMPDIR: cwd,
          TMP: cwd,
          TEMP: cwd,
          LANG: 'C.UTF-8',
          LC_ALL: 'C.UTF-8',
          GO111MODULE: 'off',
          NODE_ENV: process.env.NODE_ENV || 'production',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
      })
    } catch (error: any) {
      resolve({ stdout: '', stderr: '', code: null, timedOut: false, launchError: String(error?.message || error) })
      return
    }

    let stdout = ''
    let stderr = ''
    let timedOut = false
    let outputExceeded = false
    let settled = false
    let timer: ReturnType<typeof setTimeout>
    const kill = () => {
      try {
        if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL')
        else child.kill('SIGKILL')
      } catch { try { child.kill('SIGKILL') } catch { /* already exited */ } }
    }
    const finish = (code: number | null, launchError?: string) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({
        stdout: stdout.slice(0, maxOutput),
        stderr: stderr.slice(0, maxOutput),
        code,
        timedOut,
        ...(launchError ? { launchError } : {}),
        ...(outputExceeded ? { launchError: 'Program output exceeded the judge limit.' } : {}),
      })
    }
    child.stdout?.on('data', (chunk: Buffer) => {
      if (stdout.length < maxOutput) stdout += chunk.toString('utf8')
      if (stdout.length + stderr.length > maxOutput && !outputExceeded) { outputExceeded = true; kill() }
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderr.length < maxOutput) stderr += chunk.toString('utf8')
      if (stdout.length + stderr.length > maxOutput && !outputExceeded) { outputExceeded = true; kill() }
    })
    child.on('error', (error: Error) => finish(null, error.message))
    child.on('close', (code: number | null) => finish(code))
    timer = setTimeout(() => { timedOut = true; kill() }, Math.max(1, timeoutMs))
  })
}

function compilerFor(lang: CompiledCodeLang, directory: string) {
  switch (lang) {
    case 'c': return { command: 'gcc', args: ['-std=c11', '-O2', '-pipe', '-w', 'main.c', '-lm', '-o', join(directory, 'candidate')], executable: join(directory, 'candidate') }
    case 'cpp': return { command: 'g++', args: ['-std=c++17', '-O2', '-pipe', '-w', 'Main.cpp', '-o', join(directory, 'candidate')], executable: join(directory, 'candidate') }
    case 'java': return { command: 'javac', args: ['-encoding', 'UTF-8', '-d', directory, 'Main.java'], executable: 'java' }
    case 'rust': return { command: 'rustc', args: ['--edition=2021', '-O', 'main.rs', '-o', join(directory, 'candidate')], executable: join(directory, 'candidate') }
    case 'go': return { command: 'go', args: ['build', '-trimpath', '-o', join(directory, 'candidate'), 'main.go'], executable: join(directory, 'candidate') }
  }
}

function runArgs(lang: CompiledCodeLang, executable: string, directory: string, index: number): string[] {
  if (lang === 'java') return ['-Xms16m', '-Xmx256m', '-cp', directory, 'Main', String(index)]
  return lang === 'go' ? [String(index)] : [String(index)]
}

function canonical(value: any): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value === undefined ? null : value)
}

function compareShape(value: any, mode: CodingQuestion['compare']): any {
  if (mode === 'unordered' && Array.isArray(value)) return [...value].sort((a, b) => canonical(a).localeCompare(canonical(b)))
  if (mode === 'unordered-nested' && Array.isArray(value)) {
    return value.map((row) => Array.isArray(row) ? [...row].sort((a, b) => canonical(a).localeCompare(canonical(b))) : row)
      .sort((a, b) => canonical(a).localeCompare(canonical(b)))
  }
  return value
}

function digest(value: any, mode: CodingQuestion['compare']): string {
  // The judge uses SHA-256 over a canonical JSON representation for large
  // expected outputs. Node's crypto is only used by the trusted parent process.
  return createHash('sha256').update(canonical(compareShape(value, mode)), 'utf8').digest('hex')
}

function same(got: any, expected: any, question: CodingQuestion): boolean {
  if (expected && typeof expected === 'object' && !Array.isArray(expected) && Object.keys(expected).length === 1 && '$digest' in expected) {
    return digest(got, question.compare) === expected.$digest
  }
  if (question.compare === 'float') return Math.abs(Number(got) - Number(expected)) < 1e-6
  return canonical(compareShape(got, question.compare)) === canonical(compareShape(expected, question.compare))
}

function display(value: any): string {
  let text: string
  try { text = canonical(value) } catch { text = String(value) }
  return text.length <= 300 ? text : `${text.slice(0, 297)}...`
}

function testcaseLimit(test: CodingTest, lang: CompiledCodeLang): number {
  const value = test.limitMs
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
  if (value && typeof value === 'object') {
    const limit = Number((value as Record<string, unknown>)[lang])
    if (Number.isFinite(limit) && limit > 0) return limit
  }
  return 1000
}

function emptyResult(q: CodingQuestion, lang: CompiledCodeLang, error: string): TestRunResult {
  return { passed: 0, total: q.tests.length, results: [], engine: lang, error: error.slice(0, 500) }
}

function readOutput(stdout: string, marker: string): { value?: any; error?: string } {
  const at = stdout.lastIndexOf(marker)
  if (at < 0) return { error: 'The solution did not return a result.' }
  const line = stdout.slice(at + marker.length).split(/\r?\n/, 1)[0].trim()
  try { return { value: JSON.parse(line) } }
  catch { return { error: 'The solution returned output that could not be read as JSON.' } }
}

export async function runNativeCodingTests(q: CodingQuestion, rawCode: string, lang: CompiledCodeLang): Promise<TestRunResult> {
  const code = stripCodeFence(String(rawCode || '').trim())
  if (!code) return emptyResult(q, lang, 'No code submitted — 0 tests passed.')
  if (Buffer.byteLength(code, 'utf8') > 64 * 1024) return emptyResult(q, lang, 'Code is too large to run.')

  const marker = `${RESULT_MARKER}${randomUUID()}__:`
  const directory = await mkdtemp(join(tmpdir(), 'company-assessment-'))
  try {
    const harness = createNativeHarness(q, code, lang, marker)
    await writeFile(join(directory, harness.filename), harness.source, 'utf8')
    const build = compilerFor(lang, directory)
    const compiled = await execute(build.command, build.args, directory, COMPILE_TIMEOUT_MS, 128 * 1024)
    if (compiled.launchError || compiled.code !== 0 || compiled.timedOut) {
      const reason = compiled.launchError
        ? `${lang} compiler could not be started: ${compiled.launchError}`
        : compiled.timedOut
          ? 'Compilation exceeded the 60-second limit.'
          : `Compilation failed${compiled.stderr.trim() ? `:\n${compiled.stderr.trim()}` : compiled.stdout.trim() ? `:\n${compiled.stdout.trim()}` : '.'}`
      return emptyResult(q, lang, reason)
    }

    const results: TestCaseResult[] = []
    let passed = 0
    let normalTles = 0
    let stressTles = 0
    const deadline = Date.now() + PROCESS_BUDGET_MS
    for (let index = 0; index < q.tests.length; index++) {
      const test = q.tests[index]
      if ((!test.stress && normalTles >= 2) || (test.stress && stressTles >= 2)) {
        results.push({ name: test.name, passed: false, status: 'tle', ms: 0, message: 'Not run — earlier tests exceeded the time limit.', ...(test.stress ? { stress: true } : {}) })
        continue
      }
      const remaining = deadline - Date.now()
      if (remaining <= 0) {
        results.push({ name: test.name, passed: false, status: 'tle', ms: 0, message: 'Not run — the total run-time budget was exceeded.', ...(test.stress ? { stress: true } : {}) })
        continue
      }
      const markerText = marker
      const started = Date.now()
      const args = lang === 'java' ? runArgs(lang, build.executable, directory, index) : [String(index)]
      const command = lang === 'java' ? 'java' : build.executable
      const run = await execute(command, args, directory, Math.min(testcaseLimit(test, lang), remaining))
      const ms = Date.now() - started
      const flags = { ...(test.stress ? { stress: true } : {}), ...(test.sample ? { sample: true } : {}) }
      if (run.timedOut) {
        if (test.stress) stressTles++
        else normalTles++
        results.push({ name: test.name, passed: false, status: 'tle', ms, message: 'Time limit exceeded.', ...flags })
        continue
      }
      if (run.launchError || run.code !== 0) {
        const message = run.launchError || run.stderr.trim().slice(-240) || `Program exited with status ${run.code}.`
        results.push({ name: test.name, passed: false, status: 'error', ms, message: message.slice(0, 240), ...flags })
        continue
      }
      const output = readOutput(run.stdout, markerText)
      if (output.error) {
        results.push({ name: test.name, passed: false, status: 'error', ms, message: output.error, ...flags })
        continue
      }
      let expected: any
      try { expected = expandTestArgs(test.expected) }
      catch { expected = test.expected }
      const ok = same(output.value, expected, q)
      const row: TestCaseResult = { name: test.name, passed: ok, status: ok ? 'passed' : 'wrong', ms, ...flags }
      if (!ok && test.sample) { row.got = display(output.value); row.expected = display(expected) }
      results.push(row)
      if (ok) passed++
    }
    return { passed, total: q.tests.length, results, engine: lang }
  } catch (error: any) {
    return emptyResult(q, lang, String(error?.message || error))
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }
}
