/**
 * Server-side Supabase credential pairing.
 *
 * A Supabase API key only works for the project it was issued for: the JWT's
 * `ref` claim must match the project in the URL. The server used to take the
 * URL from `NEXT_PUBLIC_SUPABASE_URL` but ALWAYS use a hard-coded service-role
 * key, so a deployment configured for a different project had every call
 * rejected with `401 Invalid API key` — which showed up as "the company
 * assessment will not open", "answers are not saving" and "results are not
 * showing". These tests pin the pairing rules.
 *
 * `lib/supabaseServer.ts` memoises its clients per process, so each scenario
 * runs in a fresh child process with its own environment.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const serverModule = path.join(here, '..', 'supabaseServer.ts')

/** Minimal JWTs with a `ref` claim, standing in for real Supabase keys. */
const KEY = (ref: string, role: string) =>
  `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ iss: 'supabase', ref, role, iat: 1, exp: 2 })).toString('base64url')}.sig`

const OWN_PROJECT = 'https://ownproject.supabase.co'
const OTHER_PROJECT = 'https://otherproject.supabase.co'
const OWN_REF = 'ownproject'
const OTHER_REF = 'otherproject'

interface Report {
  url: string
  urlFromEnv: boolean
  key: string
  keyRole: string
  keyRef: string
  urlRef: string
  matches: boolean
  serviceRoleReady: boolean
  clientReady: boolean
}

/** Import the server module in a fresh process with `env` and report its credentials. */
function report(env: Record<string, string>): Report {
  const script = `
    const mod = await import(${JSON.stringify(serverModule)})
    process.stdout.write(JSON.stringify(mod.supabaseCredentialReport()))
  `
  const out = execFileSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', script], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  // Strip any Node warning lines that precede the JSON payload.
  const json = out.slice(out.indexOf('{'))
  return JSON.parse(json) as Report
}

test('no env: the built-in project is used end to end (zero-config deployment)', () => {
  const r = report({
    NEXT_PUBLIC_SUPABASE_URL: '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
    SUPABASE_SERVICE_ROLE_KEY: '',
  })
  assert.equal(r.urlFromEnv, false)
  assert.equal(r.url, 'https://anegoqdlwnmcwbkrjhqm.supabase.co')
  assert.equal(r.matches, true)
  assert.equal(r.serviceRoleReady, true, 'the built-in service-role client must still work')
  assert.equal(r.clientReady, true)
})

test('env URL + a service key issued for that same project: used as configured', () => {
  const r = report({
    NEXT_PUBLIC_SUPABASE_URL: OWN_PROJECT,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: KEY(OWN_REF, 'anon'),
    SUPABASE_SERVICE_ROLE_KEY: KEY(OWN_REF, 'service_role'),
  })
  assert.equal(r.urlFromEnv, true)
  assert.equal(r.url, OWN_PROJECT)
  assert.equal(r.urlRef, 'ownproject')
  assert.equal(r.keyRef, 'ownproject')
  assert.equal(r.keyRole, 'service_role')
  assert.equal(r.matches, true)
  assert.equal(r.serviceRoleReady, true)
})

test('env URL with NO service key: no client — the built-in key is never borrowed', () => {
  // Before the fix this silently paired the env URL with the built-in
  // service-role key, so every request was rejected with 401 Invalid API key.
  const r = report({
    NEXT_PUBLIC_SUPABASE_URL: OWN_PROJECT,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
    SUPABASE_SERVICE_ROLE_KEY: '',
  })
  assert.equal(r.url, OWN_PROJECT)
  assert.equal(r.key, '')
  assert.equal(r.serviceRoleReady, false)
  assert.equal(r.clientReady, false)
})

test('env URL + a service key from a DIFFERENT project: rejected, not silently mixed', () => {
  const r = report({
    NEXT_PUBLIC_SUPABASE_URL: OWN_PROJECT,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: KEY(OWN_REF, 'anon'),
    SUPABASE_SERVICE_ROLE_KEY: KEY(OTHER_REF, 'service_role'),
  })
  assert.equal(r.url, OWN_PROJECT)
  assert.equal(r.keyRef, 'otherproject')
  assert.equal(r.matches, false)
  assert.equal(r.serviceRoleReady, false, 'a mismatched key must not produce a client')
  assert.equal(r.clientReady, false)
})

test('env URL + anon key only: auth-only client, but no trusted write client', () => {
  const r = report({
    NEXT_PUBLIC_SUPABASE_URL: OWN_PROJECT,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: KEY(OWN_REF, 'anon'),
    SUPABASE_SERVICE_ROLE_KEY: '',
  })
  assert.equal(r.serviceRoleReady, false, 'writes must never run on the anon key')
  assert.equal(r.clientReady, true, 'the anon client can still verify a caller JWT')
  assert.equal(r.matches, true)
})

test('no env URL but an explicit key for the built-in project: still paired correctly', () => {
  const r = report({
    NEXT_PUBLIC_SUPABASE_URL: '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
    SUPABASE_SERVICE_ROLE_KEY: KEY('anegoqdlwnmcwbkrjhqm', 'service_role'),
  })
  assert.equal(r.url, 'https://anegoqdlwnmcwbkrjhqm.supabase.co')
  assert.equal(r.keyRef, 'anegoqdlwnmcwbkrjhqm')
  assert.equal(r.matches, true)
  assert.equal(r.serviceRoleReady, true)
})

test('no env URL but a key for another project: built-in pair kept, not mixed', () => {
  const r = report({
    NEXT_PUBLIC_SUPABASE_URL: '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
    SUPABASE_SERVICE_ROLE_KEY: KEY(OTHER_REF, 'service_role'),
  })
  assert.equal(r.url, 'https://anegoqdlwnmcwbkrjhqm.supabase.co')
  assert.equal(r.matches, true, 'the built-in key belongs to the built-in project')
  assert.equal(r.serviceRoleReady, true)
})
