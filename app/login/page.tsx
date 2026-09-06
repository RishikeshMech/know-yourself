'use client'
import { useState } from 'react'
import { StoreProvider, useStore } from '@/lib/store'
import { getSupabase } from '@/lib/supabase'
import { Logo } from '@/components/Logo'

function LoginInner() {
  const { setUser } = useStore()
  // Never pre-fill credentials — the form must start empty so one user's
  // details are never shown to the next person on a shared device.
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: any) => {
    e.preventDefault()
    setErr('')
    if (!email.includes('@')) return setErr('Please enter a valid email address.')
    if (password.length < 6) return setErr('Password must be at least 6 characters.')
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
      const user = data.user
      // A brand new account is signed in immediately — no second sign-in step.
      setUser({ id: user.id, email: user.email, role: user.role || 'student', institution_id: user.institution_id || 'inst_iitm', name: user.name || user.email.split('@')[0] })
      // When Supabase is the backend, hand the session to supabase-js in the
      // browser so RLS policies and Storage uploads work client-side.
      try {
        const sb = getSupabase()
        if (sb && data.access_token && data.refresh_token) {
          await sb.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token })
        }
      } catch { /* demo mode / unreachable backend */ }
      if (mode === 'signup') {
        // Straight into onboarding.
        window.location.href = '/onboarding'
        return
      }
      if (data.has_assessment) {
        window.location.href = '/dashboard/student'
      } else if (data.has_onboarding) {
        // Completed onboarding but no result yet — continue the flow at
        // the edit entry point instead of re-running onboarding.
        window.location.href = '/profile'
      } else {
        window.location.href = '/onboarding'
      }
    } catch (e: any) {
      setErr(e?.message || 'Sign in failed. Please try again.')
    } finally { setBusy(false) }
  }

  // Swap modes, keeping the form clean (no auto-filled credentials).
  const switchMode = (next: 'signin' | 'signup') => {
    setMode(next)
    setErr('')
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Ambient glassmorphism backdrop — blobs + soft grid */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="blob-a absolute -left-28 top-[-6rem] h-96 w-96 rounded-full bg-violet-400/25 blur-3xl" />
        <div className="blob-b absolute -right-24 top-1/3 h-[26rem] w-[26rem] rounded-full bg-indigo-400/25 blur-3xl" />
        <div className="absolute bottom-[-8rem] left-1/3 h-80 w-80 rounded-full bg-fuchsia-300/20 blur-3xl" />
      </div>

      <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
        <a href="/" className="flex items-center gap-2.5 animate-fade-up">
          <Logo height={40} className="drop-shadow-lg" />
          <span className="text-lg font-extrabold tracking-tight text-slate-900">
            CALIBIAI<span className="text-indigo-600"> SCORE</span>
          </span>
        </a>

        <div className="animate-fade-up mt-8 w-full max-w-md" style={{ animationDelay: '.08s' }}>
          <div className="glass-card hover-lift !p-8 sm:!p-10">
            {/* Segmented mode toggle */}
            <div className="grid grid-cols-2 gap-1 rounded-2xl border border-white/70 bg-white/50 p-1 backdrop-blur">
              {(['signin', 'signup'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => switchMode(m)}
                  className={`rounded-xl px-3 py-2 text-xs font-bold transition-all duration-200 ${
                    mode === m ? 'calibiai-gradient text-white shadow-md shadow-indigo-300/50' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {m === 'signin' ? 'Sign in' : 'Create account'}
                </button>
              ))}
            </div>

            <h1 className="mt-6 text-center text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
              {mode === 'signin' ? 'Welcome back' : 'Get started'}
            </h1>
            <p className="mt-1.5 text-center text-sm text-slate-500">
              {mode === 'signin'
                ? 'Sign in to continue your assessment journey.'
                : 'Create your account — we’ll take you straight to onboarding.'}
            </p>

            <form onSubmit={submit} className="mt-7 space-y-4">
              <div>
                <label htmlFor="email" className="text-xs font-semibold text-slate-600">Email address</label>
                <input
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@university.edu"
                  autoComplete="email"
                  className="field mt-1.5"
                />
              </div>
              <div>
                <label htmlFor="password" className="text-xs font-semibold text-slate-600">Password</label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  className="field mt-1.5"
                />
              </div>

              {err && (
                <div className="animate-fade-in rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-600">
                  {err}
                </div>
              )}

              <button type="submit" disabled={busy} className="btn-primary w-full !py-3">
                {busy ? 'Please wait…' : <>{mode === 'signup' ? 'Create account →' : 'Continue →'}</>}
              </button>
            </form>

            <div className="mt-5 flex items-center justify-between text-xs">
              {mode === 'signin' ? (
                <button type="button" className="font-semibold text-indigo-600 hover:text-indigo-700">Forgot password?</button>
              ) : <span />}
              <button type="button" onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')} className="font-bold text-indigo-600 hover:text-indigo-700">
                {mode === 'signin' ? 'New here? Create an account' : 'Already have an account? Sign in'}
              </button>
            </div>
          </div>

          <p className="mt-5 text-center text-[11px] text-slate-400">
            Institution SSO is also supported · Your data stays private
          </p>
        </div>
      </div>
    </div>
  )
}

export default function Page() {
  return <StoreProvider><LoginInner /></StoreProvider>
}
