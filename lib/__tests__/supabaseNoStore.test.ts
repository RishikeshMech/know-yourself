/**
 * Server-side Supabase requests must never be served from Next.js's fetch
 * Data Cache.
 *
 * `next build` swaps the global `fetch` for a caching one. In a production
 * build every GET a server module makes was written to
 * `.next/cache/fetch-cache` with a one-year revalidate and replayed from disk
 * — and that directory survives a rebuild and a restart. Supabase reads were
 * therefore answered from a frozen snapshot: a submitted company attempt came
 * back as "no attempt", so the dashboard showed no report and the
 * one-attempt-per-company guard let the candidate start the test again.
 *
 * `lib/supabaseServer.ts` fixes this by giving the client a transport that
 * forces `cache: 'no-store'`. These tests pin that behaviour — a bare `fetch`
 * there is silently cached for a year, with no visible error.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { getServerClient, getServiceRoleClient } from '../supabaseServer.ts'

interface Seen { url: string; cache: unknown; method: string }

/** Swap in a recording fetch, run `fn`, then restore. */
async function record(fn: () => Promise<unknown>): Promise<Seen[]> {
  const seen: Seen[] = []
  const real = globalThis.fetch
  globalThis.fetch = (async (input: any, init: any) => {
    seen.push({
      url: String(input?.url ?? input),
      cache: init?.cache,
      method: String(init?.method || 'GET').toUpperCase(),
    })
    return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch
  try {
    await fn()
  } finally {
    globalThis.fetch = real
  }
  return seen
}

test('a service-role read opts out of the Next.js fetch cache', async () => {
  const sb = getServiceRoleClient()
  assert.ok(sb, 'the built-in project must produce a service-role client')
  const seen = await record(() =>
    sb!.from('company_assessment_attempts').select('*').eq('company_slug', 'tcs'),
  )
  assert.equal(seen.length, 1, 'the query must reach the transport')
  assert.match(seen[0].url, /company_assessment_attempts/)
  assert.equal(
    seen[0].cache,
    'no-store',
    'without cache: "no-store" this GET is stored in .next/cache/fetch-cache for a year and replayed, ' +
      'so a submitted attempt reads back as "no attempt"',
  )
})

test('a service-role write opts out too (no cached 2xx replay)', async () => {
  const sb = getServiceRoleClient()
  const seen = await record(() =>
    sb!.from('company_assessment_attempts').upsert({ id: '00000000-0000-0000-0000-000000000000' }),
  )
  assert.equal(seen.length, 1)
  assert.equal(seen[0].cache, 'no-store')
})

test('the auth client opts out, so a token is re-verified instead of cached', async () => {
  const sb = getServerClient()
  assert.ok(sb, 'the built-in project must produce an auth client')
  const seen = await record(() => sb!.auth.getUser('not-a-real-token'))
  assert.ok(seen.length >= 1, 'getUser must reach the transport')
  for (const s of seen) {
    assert.equal(s.cache, 'no-store', `${s.url} was left cacheable`)
  }
})
