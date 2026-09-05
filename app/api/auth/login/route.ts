import { NextResponse } from 'next/server'
export async function POST(req: Request){
  const body = await req.json()
  // Argon2id verify (mock), RS256 JWT mint (mock), audit log -> Kafka
  return NextResponse.json({
    access_token: 'mock.jwt.'+Buffer.from(body.email||'user').toString('base64').slice(0,20),
    refresh_token: 'refresh_'+Math.random().toString(16).slice(2),
    expires_in: 900,
    user: { id: 'u_'+Math.random().toString(16).slice(2,6), email: body.email, role: body.role||'student', institution_id: 'inst_iitm'}
  })
}
