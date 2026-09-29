/**
 * Small shared helpers for the /api/company-assessments/* route handlers.
 */
import { NextResponse } from 'next/server'
import { checkRateLimit, getClientIp } from '../rateLimit.ts'

export async function readJson(req: Request): Promise<any | null> {
  try {
    return await req.json()
  } catch {
    return null
  }
}

export function jsonError(status: number, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status, headers: { 'Cache-Control': 'no-store' } })
}

export function ok(body: Record<string, unknown>) {
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } })
}

/** Per-IP abuse backstop (campuses share NAT IPs, so this is deliberately generous). */
export function limited(req: Request, bucket: string, limit = 3000): NextResponse | null {
  const rl = checkRateLimit(`company:${bucket}:${getClientIp(req)}`, limit, 60_000)
  if (rl.allowed) return null
  return NextResponse.json(
    { error: 'Too many requests — please slow down.' },
    { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
  )
}
