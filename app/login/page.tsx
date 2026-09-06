'use client'
import { useState } from 'react'
import { StoreProvider, useStore } from '@/lib/store'
import { getSupabase } from '@/lib/supabase'

function LoginInner(){
  const {setUser} = useStore()
  const [email,setEmail] = useState('priya@iitm.ac.in')
  const [password,setPassword] = useState('password123')
  const [mode,setMode] = useState<'signin'|'signup'>('signin')
  const [err,setErr] = useState('')
  const [busy,setBusy] = useState(false)

  const submit = async (e:any)=>{
    e.preventDefault()
    setErr('')
    if(!email.includes('@')) return setErr('Please enter a valid email address.')
    if(password.length<6) return setErr('Password must be at least 6 characters.')
    setBusy(true)
    try {
      const endpoint = mode === 'signup' ? '/api/auth/signup' : '/api/auth/login'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, role: 'student', full_name: email.split('@')[0] }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || (mode === 'signup' ? 'Sign up failed.' : 'Sign in failed.'))
      if (mode === 'signup') {
        setErr('Account created — please sign in.')
        setMode('signin')
        return
      }
      const user = data.user
      setUser({ id: user.id, email: user.email, role: user.role || 'student', institution_id: user.institution_id || 'inst_iitm', name: user.name || user.email.split('@')[0] })
      if (data.has_assessment) {
        window.location.href = '/dashboard/student'
      } else {
        window.location.href = '/profile'
      }
    } catch (e: any) {
      setErr(e?.message || 'Sign in failed. Please try again.')
    } finally { setBusy(false) }
  }

  return (
    <div className="min-h-screen">
      <header className="max-w-7xl mx-auto px-6 h-16 flex items-center">
        <a href="/" className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl calibiai-gradient flex items-center justify-center font-black text-white shadow-lg shadow-indigo-300/50">C</div>
          <span className="font-extrabold tracking-tight text-slate-900 text-lg">CALIBIAI<span className="text-indigo-600"> SCORE</span></span>
        </a>
      </header>

      <main className="max-w-6xl mx-auto px-6 pt-6 pb-16 grid lg:grid-cols-2 gap-10 items-center min-h-[calc(100vh-4rem)]">
        {/* Left — value prop */}
        <div className="animate-fade-up hidden lg:block">
          <span className="chip text-indigo-700 border-indigo-200 bg-indigo-50/70">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> Trusted employability assessment
          </span>
          <h1 className="mt-6 text-5xl font-black leading-[1.08] tracking-tight text-slate-900">
            Your skills. One verified score. A clearer path forward.
          </h1>
          <p className="mt-5 text-lg text-slate-500 leading-relaxed">
            Complete a focused, evidence-based assessment and receive your Calibiai Score out of 1000.
          </p>
          <div className="mt-8 flex gap-6 text-sm text-slate-500 font-medium">
            <span className="flex items-center gap-2">✓ 120 minutes</span>
            <span className="flex items-center gap-2">✓ 6 skill modules</span>
            <span className="flex items-center gap-2">✓ PDF credential</span>
          </div>
        </div>

        {/* Right — card */}
        <div className="animate-fade-up" style={{animationDelay:'.1s'}}>
          <div className="glass-card hover-lift !p-7 sm:!p-9 max-w-md lg:ml-auto">
            <div className="text-xs font-bold tracking-widest text-indigo-600 uppercase">
              {mode==='signin' ? 'Welcome back' : 'Create account'}
            </div>
            <h2 className="mt-2 text-2xl font-black text-slate-900">
              {mode==='signin' ? 'Sign in to continue' : 'Get started'}
            </h2>
            <p className="mt-1.5 text-sm text-slate-500">Use your institution email to access your assessment.</p>

            <form onSubmit={submit} className="mt-6 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-600">Email address</label>
                <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@university.edu" className="field mt-1.5" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Password</label>
                <input type="password" value={password} onChange={e=>setPassword(e.target.value)} className="field mt-1.5" />
              </div>
              {err && <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{err}</div>}
              <div className="flex items-center justify-between pt-1">
                <button type="button" className="text-xs font-semibold text-indigo-600 hover:text-indigo-700">Forgot password?</button>
                <button type="submit" disabled={busy} className="btn-primary !px-7 !py-2.5">{busy ? 'Please wait…' : <>Continue →</>}</button>
              </div>
            </form>

            <div className="mt-6 text-center text-xs text-slate-500">
              {mode==='signin' ? (
                <>New here? <button type="button" onClick={()=>setMode('signup')} className="font-bold text-indigo-600 hover:text-indigo-700">Create an account</button></>
              ) : (
                <>Already have an account? <button type="button" onClick={()=>setMode('signin')} className="font-bold text-indigo-600 hover:text-indigo-700">Sign in</button></>
              )}
              <span className="block mt-2 text-slate-400">Institution SSO is also supported.</span>
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
