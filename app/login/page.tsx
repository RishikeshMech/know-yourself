'use client'
import { useState } from 'react'
import { Navbar } from '@/components/Navbar'
import { StoreProvider, useStore } from '@/lib/store'
import { Stepper } from '@/components/Stepper'

function LoginInner(){
  const {setUser} = useStore()
  const [email,setEmail] = useState('priya@iitm.ac.in')
  const [password,setPassword] = useState('password123')
  const [role,setRole] = useState('student')
  const [err,setErr] = useState('')

  const submit = (e:any)=>{
    e.preventDefault()
    setErr('')
    if(!email.includes('@')) return setErr('Enter valid email')
    if(password.length<6) return setErr('Password min 6 chars')
    // custom JWT simulation — store user, no external IdP
    const user = { id: 'u_'+Math.random().toString(16).slice(2,8), email, role, institution_id:'inst_iitm', name: email.split('@')[0] }
    setUser(user)
    // audit log simulation
    localStorage.setItem('calibiai_jwt', 'mock.jwt.'+btoa(email).slice(0,12))
    window.location.href='/profile'
  }

  return (
    <div>
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <Stepper step={1} />
        <div className="mt-6 grid md:grid-cols-2 gap-6 items-start">
          <div className="rounded-[24px] glass p-6 sm:p-8">
            <h1 className="text-2xl font-black">Sign in to Calibiai</h1>
            <p className="text-sm text-white/60 mt-1">Custom JWT auth — no Auth0, no Firebase. Institution SSO federation supported.</p>

            <div className="mt-4 flex gap-2">
              {['student','faculty','institution'].map(r=>(
                <button key={r} onClick={()=>setRole(r)} className={`px-3 py-1.5 rounded-full text-xs font-bold capitalize ${role===r ? 'bg-white text-navy-900' : 'bg-white/10 text-white/70'}`}>{r}</button>
              ))}
            </div>

            <form onSubmit={submit} className="mt-6 space-y-4">
              <div>
                <label className="text-xs text-white/60">Email</label>
                <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@university.edu" className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sm outline-none focus:border-sky-500" />
              </div>
              <div>
                <label className="text-xs text-white/60">Password (Argon2id on server)</label>
                <input type="password" value={password} onChange={e=>setPassword(e.target.value)} className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sm outline-none focus:border-sky-500" />
              </div>
              {err && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{err}</div>}
              <button type="submit" className="w-full py-3 rounded-full calibiai-gradient font-bold text-sm">Continue →</button>
              <div className="text-xs text-white/40 text-center">Demo: any email works. JWT stored in httpOnly in prod, localStorage for demo.</div>
            </form>

            <div className="mt-6 rounded-xl bg-white/5 border border-white/10 p-3 text-xs leading-relaxed">
              <div className="font-bold text-white/80">Security note</div>
              <div className="text-white/50">Passwords hashed with Argon2id. JWT RS256, 15m access + 7d refresh, rotated via Vault. Rate-limited at Kong + Redis.</div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[24px] calibiai-gradient p-6 text-white">
              <div className="text-sm font-bold">Why this is defensible IP</div>
              <ul className="mt-3 text-sm space-y-2 opacity-90">
                <li>• No wrapper around OpenAI — self-hosted LLaMA + Whisper on owned GPU fleet</li>
                <li>• Unit economics hold at 100M users (no per-token SaaS margin)</li>
                <li>• Every layer scales independently & survives regional failover</li>
              </ul>
            </div>
            <div className="rounded-2xl glass p-5">
              <div className="text-sm font-bold">Institution SSO</div>
              <div className="text-xs text-white/60 mt-1">We broker SAML/OIDC as SP. Institutions federate to us; runtime never depends on external IdP (cached assertions). Works for national rollouts.</div>
              <button onClick={()=>alert('SSO demo: redirect to institution IdP → SAML assertion → JWT minted')} className="mt-3 px-3 py-2 rounded-full bg-white text-navy-900 text-xs font-bold">Simulate SSO Login</button>
            </div>
            <div className="rounded-2xl glass p-5">
              <div className="text-xs font-mono text-white/50">Architecture • Multi-region</div>
              <div className="mt-2 font-mono text-xs leading-relaxed text-white/70">
                GeoDNS (Anycast) → Kong Gateway → Auth Service (JWT) → Assessment Service → Redpanda → GPU Workers (Triton/vLLM) → Postgres (sharded) + MinIO + Redis
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default function Page(){
  return <StoreProvider><LoginInner/></StoreProvider>
}
