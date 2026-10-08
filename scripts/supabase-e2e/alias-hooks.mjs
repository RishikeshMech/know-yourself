// Node resolve hook: maps the repo's "@/..." path alias onto the repo root so the
// app's route handlers can be imported and executed outside Next.js.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// The repository root: this file lives in scripts/supabase-e2e/.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const EXTS = ['', '.ts', '.tsx', '.js', '.mjs', '/index.ts', '/index.tsx']

export async function resolve(specifier, context, next) {
  // Node's ESM resolver does not add extensions for Next's package entry points.
  if (specifier === 'next/server') return next('next/server.js', context)
  if (specifier.startsWith('@/')) {
    const base = path.join(ROOT, specifier.slice(2))
    for (const ext of EXTS) {
      const f = base + ext
      if (fs.existsSync(f) && fs.statSync(f).isFile()) {
        return next(pathToFileURL(f).href, context)
      }
    }
  }
  return next(specifier, context)
}
