/**
 * SERVER-ONLY loader for the company-assessment question bank.
 *
 * `data/company/bank.json` contains every MCQ answer key and every hidden
 * coding test, so it is read from disk here instead of being imported: an
 * accidental import from a client component fails the build (`fs` cannot be
 * bundled for the browser) rather than silently shipping the keys. The
 * lib/__tests__/companySecurity.test.ts guard additionally scans client code.
 */
import fs from 'fs'
import path from 'path'
import type { BankQuestion, QuestionBank } from './types.ts'

export interface LoadedBank {
  version: string
  questions: BankQuestion[]
  byId: Map<string, BankQuestion>
}

let fileOverride: string | null = null
let cache: (LoadedBank & { file: string; mtimeMs: number }) | null = null

/** Test seam: point the loader at another bank file (null restores the default). */
export function setBankFile(file: string | null): void {
  fileOverride = file
  cache = null
}

export function bankFilePath(): string {
  return fileOverride || path.join(process.cwd(), 'data', 'company', 'bank.json')
}

/** Load (and memoise, revalidating on mtime) the question bank. */
export function loadBank(): LoadedBank {
  const file = bankFilePath()
  let mtimeMs = 0
  try {
    mtimeMs = fs.statSync(file).mtimeMs
  } catch {
    throw new Error(`Company question bank not found at ${file}. Run "npm run build:company-bank".`)
  }
  if (cache && cache.file === file && cache.mtimeMs === mtimeMs) return cache
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as QuestionBank
  const questions = Array.isArray(raw?.questions) ? raw.questions : []
  const byId = new Map(questions.map((q) => [q.id, q]))
  cache = { version: String(raw?.version || 'unknown'), questions, byId, file, mtimeMs }
  return cache
}
