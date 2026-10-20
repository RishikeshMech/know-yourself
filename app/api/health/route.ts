import fs from 'fs'
import path from 'path'
import { NextResponse } from 'next/server'
import { supabaseCredentialReport } from '@/lib/supabaseServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Health / readiness probe.
 *
 * This is what a load balancer (nginx `health_check`, PM2, an ALB, or a
 * cluster manager) should point at. It reports REAL state instead of the old
 * hardcoded "postgres: up, redis: up, …" string, so a failing worker can
 * actually be pulled out of rotation.
 *
 *   - `status` / `ready`      reflect whether the process can write to its
 *                             working directory (the JSON store). LB drains the
 *                             node when this is false.
 *   - `memory` / `uptime`     let ops spot a node that is about to OOM.
 *   - `pid` / `node`          help correlate to PM2 `id`.
 *   - `supabase`              the EFFECTIVE server credentials: which project
 *                             the server actually talks to, and whether the API
 *                             key belongs to it. `key_matches_url: false` is the
 *                             reason assessments would not open, save or score.
 */
export async function GET() {
  let storeOk = true
  let storeError = ''
  try {
    const probe = path.join(process.cwd(), '.health-probe')
    fs.writeFileSync(probe, String(Date.now()))
    fs.unlinkSync(probe)
  } catch (e: any) {
    storeOk = false
    storeError = String(e?.message || e)
  }

  const mem = process.memoryUsage()
  const creds = supabaseCredentialReport()
  const body = {
    status: storeOk ? 'ok' : 'degraded',
    ready: storeOk,
    version: '1.0.0',
    region: process.env.REGION || process.env.NEXT_PUBLIC_REGION || 'ap-south-1',
    uptime_sec: Math.round(process.uptime()),
    pid: process.pid,
    node: process.version,
    memory: {
      rss_mb: Math.round(mem.rss / 1048576),
      heap_used_mb: Math.round(mem.heapUsed / 1048576),
      heap_total_mb: Math.round(mem.heapTotal / 1048576),
    },
    store: { ok: storeOk, error: storeError },
    supabase_url: creds.urlFromEnv ? creds.url : 'FALLBACK (built-in project)',
    service_role_configured: creds.serviceRoleReady,
    env_key_role: creds.keyRole,
    env_key_ref: creds.keyRef,
    supabase: {
      client_ready: creds.clientReady,
      service_role_ready: creds.serviceRoleReady,
      url_project_ref: creds.urlRef,
      key_project_ref: creds.keyRef === 'unknown' || creds.keyRef === 'invalid' ? null : creds.keyRef,
      key_matches_url: creds.matches,
    },
  }

  return NextResponse.json(body, {
    status: storeOk ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  })
}
