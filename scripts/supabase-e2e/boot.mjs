// Boots the app's server code in-process against the emulator.
//  - installs the "@/" alias hook
//  - routes every request to the Supabase URL into the emulator
//  - points the local JSON store at a scratch directory
import { register } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

register(new URL('./alias-hooks.mjs', import.meta.url))

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

export async function bootApp({ emu, serviceKey = true, scratch } = {}) {
  const { EMU_URL, ANON_KEY, SERVICE_KEY } = await import('./emu.mjs')
  process.env.NEXT_PUBLIC_SUPABASE_URL = EMU_URL
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ANON_KEY
  if (serviceKey) process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY
  else delete process.env.SUPABASE_SERVICE_ROLE_KEY
  delete process.env.ADMIN_SECRET

  const realFetch = globalThis.fetch
  globalThis.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input.url
    if (url.startsWith(EMU_URL)) return emu.handle(new Request(url, init))
    return realFetch(input, init)
  }

  const dir = scratch || fs.mkdtempSync(path.join(os.tmpdir(), 'calibi-store-'))
  const db = await import(pathToFileURL(path.join(REPO, 'lib/db.ts')).href)
  db.setDbDirectory(dir)
  return { dir, db }
}

export const route = (rel) => import(pathToFileURL(path.join(REPO, rel)).href)
