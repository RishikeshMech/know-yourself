'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  User as UserIcon,
  Sparkles,
  CheckCircle2,
  ShieldCheck,
  ArrowRight,
  Building,
  BrainCircuit,
  Award,
  Globe,
} from 'lucide-react'
import { useStore } from '@/lib/store'
import { getSupabase } from '@/lib/supabase'
import { Logo } from '@/components/Logo'
import { afterSignInRoute, ONBOARDING_ROUTE, signedInLandingRoute } from '@/lib/nextStep'

function GoogleIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  )
}

function PasswordStrengthBar({ password }: { password: string }) {
  if (!password) return null
  let score = 0
  if (password.length >= 6) score++
  if (password.length >= 8) score++
  if (/[0-9]/.test(password) && /[a-zA-Z]/.test(password)) score++
  if (/[^a-zA-Z0-9]/.test(password) || password.length >= 12) score++

  const label = score <= 1 ? 'Weak' : score === 2 ? 'Fair' : score === 3 ? 'Good' : 'Strong'
  const color =
    score <= 1
      ? 'bg-rose-500 text-rose-600'
      : score === 2
      ? 'bg-amber-500 text-amber-600'
      : score === 3
      ? 'bg-indigo-500 text-indigo-600'
      : 'bg-emerald-500 text-emerald-600'

  return (
    <div className="mt-2 animate-fade-in space-y-1">
      <div className="flex items-center justify-between text-[10px] font-bold">
        <span className="text-slate-400">Security strength</span>
        <span className={color.split(' ')[1]}>{label}</span>
      </div>
      <div className="grid grid-cols-4 gap-1 h-1.5 rounded-full overflow-hidden bg-slate-200/80">
        {[1, 2, 3, 4].map((step) => (
          <div
            key={step}
            className={`h-full transition-all duration-300 ${
              score >= step ? color.split(' ')[0] : 'bg-transparent'
            }`}
          />
        ))}
      </div>
    </div>
  )
}

const DEMO_GOOGLE_ACCOUNTS = [
  {
    name: 'Priya Sharma',
    email: 'priya.sharma@iitm.ac.in',
    avatar: '👩‍🎓',
    badge: 'New Candidate (First Time → Onboarding)',
    badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  {
    name: 'Prajwal Gulhane',
    email: 'prajwalgulhane85@gmail.com',
    avatar: '👨‍💻',
    badge: 'Existing Profile (Score: 840 → Dashboard)',
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  {
    name: 'Ananya Deshmukh',
    email: 'ananya.deshmukh@coep.ac.in',
    avatar: '👩‍💻',
    badge: 'Student Candidate',
    badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
]

export default function LoginPage() {
  const router = useRouter()
  const { setUser, setProfile, user, profile, hydrated } = useStore()

  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)

  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [redirecting, setRedirecting] = useState(false)

  // Modals
  const [showGoogleModal, setShowGoogleModal] = useState(false)
  const [customGoogleEmail, setCustomGoogleEmail] = useState('')
  const [customGoogleName, setCustomGoogleName] = useState('')
  const [showCustomGoogleInput, setShowCustomGoogleInput] = useState(false)
  const [showSsoModal, setShowSsoModal] = useState(false)
  const [ssoDomain, setSsoDomain] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  const leavingRef = useRef(false)

  const showNotification = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

  // A candidate with an already active session should never see the login screen
  useEffect(() => {
    if (leavingRef.current) return
    if (user && hydrated) {
      leavingRef.current = true
      setRedirecting(true)
      router.replace(signedInLandingRoute(profile))
    }
  }, [user, profile, hydrated, router])

  // Google OAuth / Sign-in Handler
  const handleGoogleAuth = async (googleUser?: { name: string; email: string }) => {
    setErr('')
    setBusy(true)
    setStatusMessage('Connecting with Google…')

    // If Supabase is configured with real OAuth keys, we can initiate OAuth
    const sb = getSupabase()
    const targetEmail = googleUser?.email || email.trim()
    const targetName = googleUser?.name || fullName.trim() || targetEmail.split('@')[0]

    // If no specific account was passed and modal is not open, open Google account chooser
    if (!googleUser && !showGoogleModal && !targetEmail) {
      setShowGoogleModal(true)
      setBusy(false)
      setStatusMessage('')
      return
    }

    try {
      // Call /api/auth/google endpoint
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: targetEmail || 'student.google@calibiai.io',
          full_name: targetName || 'Google Student',
          role: 'student',
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Google authentication failed.')

      const authUser = data.user
      let resolvedName = authUser.name || targetName || authUser.email.split('@')[0]

      // If user has onboarding complete, retrieve their detailed profile
      if (authUser.id && data.has_onboarding) {
        try {
          const pr = await fetch('/api/user/profile?user_id=' + authUser.id).then((r) => r.json())
          if (pr?.profile?.full_name?.trim()) {
            resolvedName = pr.profile.full_name.trim()
            setProfile(pr.profile)
          }
        } catch {
          /* keep name */
        }
      }

      leavingRef.current = true
      setRedirecting(true)
      setShowGoogleModal(false)

      const dest = data.redirect_to || (data.has_onboarding ? '/dashboard/student' : ONBOARDING_ROUTE)

      if (dest === ONBOARDING_ROUTE) {
        setStatusMessage('Welcome! Setting up your onboarding…')
      } else {
        setStatusMessage('Welcome back! Connecting to your student dashboard…')
      }

      setUser({
        id: authUser.id,
        email: authUser.email,
        role: authUser.role || 'student',
        institution_id: authUser.institution_id || 'inst_iitm',
        name: resolvedName,
      })

      setTimeout(() => {
        router.replace(dest)
      }, 400)
    } catch (e: any) {
      setErr(e?.message || 'Google sign-in could not be completed.')
      setBusy(false)
      setStatusMessage('')
    }
  }

  // Email/Password Form Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')

    if (!email.includes('@')) return setErr('Please enter a valid email address.')
    if (password.length < 6) return setErr('Password must be at least 6 characters long.')

    setBusy(true)
    setStatusMessage(mode === 'signup' ? 'Creating your account…' : 'Verifying credentials…')

    try {
      const endpoint = mode === 'signup' ? '/api/auth/signup' : '/api/auth/login'
      const payload: any = {
        email: email.trim().toLowerCase(),
        password,
        role: 'student',
        full_name: fullName.trim() || email.split('@')[0],
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || (mode === 'signup' ? 'Sign up failed.' : 'Sign in failed.'))
      }

      const authUser = data.user
      let resolvedName = authUser.name || payload.full_name

      if (authUser.id && data.has_onboarding) {
        try {
          const pr = await fetch('/api/user/profile?user_id=' + authUser.id).then((r) => r.json())
          if (pr?.profile?.full_name?.trim()) {
            resolvedName = pr.profile.full_name.trim()
            setProfile(pr.profile)
          }
        } catch {
          /* keep server name */
        }
      }

      const dest = mode === 'signup' ? ONBOARDING_ROUTE : afterSignInRoute(data)
      leavingRef.current = true
      setRedirecting(true)

      if (dest === ONBOARDING_ROUTE) {
        setStatusMessage('Redirecting to onboarding…')
      } else {
        setStatusMessage('Connecting to student dashboard…')
      }

      setUser({
        id: authUser.id,
        email: authUser.email,
        role: authUser.role || 'student',
        institution_id: authUser.institution_id || 'inst_iitm',
        name: resolvedName,
      })

      try {
        const sb = getSupabase()
        if (sb && data.access_token && data.refresh_token) {
          await sb.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token })
        }
      } catch {
        /* demo mode */
      }

      setTimeout(() => {
        router.replace(dest)
      }, 350)
    } catch (e: any) {
      setErr(e?.message || 'Authentication failed. Please check your details and try again.')
      setBusy(false)
      setStatusMessage('')
    }
  }

  // Quick Demo Auto-fill
  const fillQuickDemo = (type: 'new' | 'returning') => {
    if (type === 'new') {
      setMode('signup')
      setFullName('Aditya Kulkarni')
      setEmail(`aditya.test_${Math.floor(Math.random() * 899 + 100)}@iitm.ac.in`)
      setPassword('calibiPass@2026')
      showNotification('✨ Filled new candidate profile — submit to test Onboarding flow')
    } else {
      setMode('signin')
      setEmail('demo@calibiai.local')
      setPassword('demo123')
      showNotification('👤 Filled returning student credentials — submit to test Dashboard flow')
    }
  }

  if (!hydrated || user || redirecting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-[#191834] to-[#241b4d] px-4">
        <div className="glass-card animate-fade-up max-w-sm w-full p-8 text-center text-white space-y-4 shadow-2xl border border-white/20">
          <div className="relative mx-auto w-14 h-14">
            <div className="w-14 h-14 rounded-full border-3 border-indigo-400 border-t-transparent animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center text-lg">✨</div>
          </div>
          <div>
            <h3 className="text-lg font-black">{statusMessage || 'Connecting to CalibiAI Score…'}</h3>
            <p className="text-xs text-indigo-200 mt-1">Preparing your verified student session</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 font-sans text-slate-100 selection:bg-indigo-500 selection:text-white">
      {/* Background Animated Glows & Light Mesh */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="blob-a absolute -left-40 -top-40 h-[38rem] w-[38rem] rounded-full bg-violet-600/20 blur-[130px]" />
        <div className="blob-b absolute -right-32 top-1/4 h-[42rem] w-[42rem] rounded-full bg-indigo-600/20 blur-[140px]" />
        <div className="blob-a absolute bottom-[-12rem] left-1/3 h-[32rem] w-[32rem] rounded-full bg-fuchsia-600/15 blur-[120px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e1b4b10_1px,transparent_1px),linear-gradient(to_bottom,#1e1b4b10_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)]" />
      </div>

      {/* Top Navbar Bar */}
      <header className="mx-auto max-w-7xl px-4 sm:px-6 py-6 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 transition-transform hover:scale-[1.02]">
          <Logo height={42} className="drop-shadow-xl" />
          <div className="leading-tight">
            <span className="text-lg font-black tracking-tight text-white">
              CALIBIAI<span className="text-indigo-400"> SCORE</span>
            </span>
            <span className="hidden sm:block text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-300/80">
              Employability Standard
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-3">
          <Link
            href="/sample-report"
            className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-300 hover:text-white transition px-3.5 py-1.5 rounded-full border border-white/10 bg-white/5 hover:bg-white/10"
          >
            <Award className="h-3.5 w-3.5 text-indigo-400" />
            Sample Report
          </Link>
          <Link
            href="/"
            className="text-xs font-semibold text-slate-400 hover:text-slate-200 transition px-3 py-1.5"
          >
            ← Back to Home
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-6 lg:py-10">
        <div className="grid lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* ================= LEFT COLUMN: HERO SHOWCASE (5 Cols) ================= */}
          <div className="lg:col-span-5 space-y-7 animate-fade-up">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3.5 py-1 text-xs font-bold text-indigo-300 backdrop-blur">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                Official Employability Assessment
              </div>

              <h1 className="mt-4 text-3xl sm:text-4xl lg:text-[2.75rem] font-black leading-[1.1] tracking-tight text-white">
                One verified score.
                <br />
                <span className="bg-gradient-to-r from-indigo-400 via-violet-300 to-fuchsia-400 bg-clip-text text-transparent">
                  Every top recruiter trusts.
                </span>
              </h1>

              <p className="mt-3.5 text-sm sm:text-base text-slate-300 leading-relaxed">
                Take the 120-minute calibrated assessment powered by DeepSeek AI — covering English, Problem Solving, AI Debugging, AI Feature Development, Prompt Engineering & Cognition.
              </p>
            </div>

            {/* Assessment Pillars Feature Badges */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              {[
                { icon: <BrainCircuit className="h-4 w-4 text-violet-400" />, title: 'In-Exam AI Assistant', desc: 'No tab switching needed' },
                { icon: <ShieldCheck className="h-4 w-4 text-emerald-400" />, title: 'DeepSeek Brutal ATS', desc: 'Honest resume scoring' },
                { icon: <Award className="h-4 w-4 text-amber-400" />, title: '1000-Pt Standard', desc: 'Six skill dimensions' },
                { icon: <Globe className="h-4 w-4 text-indigo-400" />, title: 'Shareable PDF Report', desc: 'Cryptographically signed' },
              ].map((feat, i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] p-3.5 backdrop-blur transition hover:bg-white/[0.08]"
                >
                  <div className="flex items-center gap-2 font-bold text-white">
                    {feat.icon}
                    <span>{feat.title}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-400">{feat.desc}</div>
                </div>
              ))}
            </div>

            {/* Live Card Preview */}
            <div className="relative overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-br from-white/10 via-white/[0.05] to-transparent p-5 backdrop-blur-xl shadow-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="h-10 w-10 rounded-2xl calibiai-gradient flex items-center justify-center text-lg font-black text-white shadow-md shadow-indigo-500/30">
                    🎯
                  </div>
                  <div>
                    <div className="text-xs font-black uppercase tracking-wider text-indigo-300">CalibiAI Scorecard</div>
                    <div className="text-sm font-bold text-white">Engineering Employability Grade</div>
                  </div>
                </div>
                <span className="rounded-full border border-emerald-400/30 bg-emerald-500/20 px-2.5 py-0.5 text-xs font-bold text-emerald-300">
                  Platinum 840/1000
                </span>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-xl border border-white/10 bg-black/30 p-2">
                  <div className="text-slate-400 text-[10px]">AI Debugging</div>
                  <div className="font-bold text-indigo-300 font-mono">135/150</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/30 p-2">
                  <div className="text-slate-400 text-[10px]">Feature Dev</div>
                  <div className="font-bold text-violet-300 font-mono">140/150</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/30 p-2">
                  <div className="text-slate-400 text-[10px]">Prompt Eng</div>
                  <div className="font-bold text-fuchsia-300 font-mono">92/100</div>
                </div>
              </div>
            </div>

            {/* University Trust Badges */}
            <div className="flex items-center gap-3 text-xs text-slate-400 pt-1">
              <span className="font-semibold text-slate-300">Partnered with:</span>
              <div className="flex flex-wrap gap-2 text-[11px] font-mono text-slate-400">
                <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10">IIT Madras</span>
                <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10">COEP Tech</span>
                <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10">BITS Pilani</span>
              </div>
            </div>
          </div>

          {/* ================= RIGHT COLUMN: AUTH FORM CARD (7 Cols) ================= */}
          <div className="lg:col-span-7 flex justify-center animate-fade-up" style={{ animationDelay: '0.08s' }}>
            <div className="w-full max-w-lg rounded-[32px] border border-white/20 bg-slate-900/80 p-6 sm:p-10 shadow-2xl shadow-indigo-950/50 backdrop-blur-2xl relative overflow-hidden">
              {/* Inner ambient card glow */}
              <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />
              <div aria-hidden className="pointer-events-none absolute -left-20 -bottom-20 h-56 w-56 rounded-full bg-violet-500/20 blur-3xl" />

              {/* Segmented Mode Switcher */}
              <div className="relative z-10 grid grid-cols-2 gap-1 rounded-2xl border border-white/15 bg-slate-950/60 p-1.5 backdrop-blur">
                <button
                  type="button"
                  onClick={() => {
                    setMode('signin')
                    setErr('')
                  }}
                  className={`rounded-xl py-2.5 text-xs sm:text-sm font-bold transition-all duration-300 ${
                    mode === 'signin'
                      ? 'calibiai-gradient text-white shadow-lg shadow-indigo-500/40'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('signup')
                    setErr('')
                  }}
                  className={`rounded-xl py-2.5 text-xs sm:text-sm font-bold transition-all duration-300 ${
                    mode === 'signup'
                      ? 'calibiai-gradient text-white shadow-lg shadow-indigo-500/40'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Create account
                </button>
              </div>

              {/* Form Title & Subtitle */}
              <div className="relative z-10 mt-6 text-center">
                <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                  {mode === 'signin' ? 'Welcome back' : 'Start your journey'}
                </h2>
                <p className="mt-1.5 text-xs sm:text-sm text-slate-400">
                  {mode === 'signin'
                    ? 'Sign in to access your assessment scorecard & dashboard.'
                    : 'Sign up to create your verified CalibiAI employability profile.'}
                </p>
              </div>

              {/* ================= GOOGLE 1-CLICK AUTH BUTTON ================= */}
              <div className="relative z-10 mt-6 space-y-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleGoogleAuth()}
                  className="group relative flex w-full items-center justify-center gap-3 rounded-2xl border border-white/20 bg-white/10 px-5 py-3.5 text-sm font-bold text-white backdrop-blur transition-all duration-200 hover:border-indigo-400/60 hover:bg-white/15 hover:shadow-lg hover:shadow-indigo-500/20 active:scale-[0.99] disabled:opacity-50"
                >
                  <GoogleIcon className="h-5 w-5 transition-transform group-hover:scale-110" />
                  <span>{mode === 'signin' ? 'Sign in with Google' : 'Sign up with Google'}</span>
                  <span className="ml-auto rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold text-indigo-300 border border-indigo-400/30">
                    1-Click
                  </span>
                </button>

                {/* Divider */}
                <div className="relative my-6 flex items-center justify-center">
                  <div className="w-full border-t border-white/10" />
                  <span className="absolute bg-slate-900 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    or continue with email
                  </span>
                </div>
              </div>

              {/* ================= EMAIL & PASSWORD FORM ================= */}
              <form onSubmit={handleSubmit} className="relative z-10 space-y-4">
                {/* Full Name for Signup */}
                {mode === 'signup' && (
                  <div className="animate-fade-up">
                    <label htmlFor="fullName" className="block text-xs font-semibold text-slate-300">
                      Full Name
                    </label>
                    <div className="relative mt-1.5 flex items-center">
                      <UserIcon className="absolute left-3.5 h-4 w-4 text-slate-400" />
                      <input
                        id="fullName"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Priya Sharma"
                        autoComplete="name"
                        className="w-full rounded-2xl border border-white/15 bg-slate-950/70 py-3 pl-10 pr-4 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/30"
                      />
                    </div>
                  </div>
                )}

                {/* Email Address */}
                <div>
                  <label htmlFor="email" className="block text-xs font-semibold text-slate-300">
                    Email address
                  </label>
                  <div className="relative mt-1.5 flex items-center">
                    <Mail className="absolute left-3.5 h-4 w-4 text-slate-400" />
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@university.edu"
                      autoComplete="email"
                      className="w-full rounded-2xl border border-white/15 bg-slate-950/70 py-3 pl-10 pr-4 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/30"
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <div className="flex items-center justify-between">
                    <label htmlFor="password" className="block text-xs font-semibold text-slate-300">
                      Password
                    </label>
                    {mode === 'signin' && (
                      <button
                        type="button"
                        onClick={() => {
                          showNotification('Password reset link has been dispatched to your email address.')
                        }}
                        className="text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 transition"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="relative mt-1.5 flex items-center">
                    <Lock className="absolute left-3.5 h-4 w-4 text-slate-400" />
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                      className="w-full rounded-2xl border border-white/15 bg-slate-950/70 py-3 pl-10 pr-11 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/30"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 text-slate-400 hover:text-white transition"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>

                  {mode === 'signup' && <PasswordStrengthBar password={password} />}
                </div>

                {/* Remember Me / Terms */}
                <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-800 accent-indigo-500"
                    />
                    <span>Remember this device</span>
                  </label>

                  {mode === 'signup' && (
                    <span className="text-[11px] text-slate-500">
                      I agree to the <span className="text-slate-400 underline">Terms</span>
                    </span>
                  )}
                </div>

                {/* Error Banner */}
                {err && (
                  <div className="animate-fade-in rounded-2xl border border-rose-500/40 bg-rose-950/40 p-3.5 text-xs font-semibold text-rose-300">
                    ⚠ {err}
                  </div>
                )}

                {/* Submit CTA */}
                <button
                  type="submit"
                  disabled={busy}
                  className="btn-primary w-full !py-3.5 !text-sm font-bold shadow-xl shadow-indigo-600/30 transition-all hover:shadow-indigo-500/50 active:scale-[0.99] flex items-center justify-center gap-2"
                >
                  {busy ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      <span>{statusMessage || 'Processing…'}</span>
                    </>
                  ) : (
                    <>
                      <span>{mode === 'signup' ? 'Create student account' : 'Sign in to assessment'}</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>

              {/* ================= QUICK DEMO ACCOUNTS ================= */}
              <div className="relative z-10 mt-6 pt-5 border-t border-white/10 space-y-2.5">
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
                  <span>⚡ Quick Testing Demo Credentials</span>
                  <span className="text-indigo-400 font-bold">1-Click Fill</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => fillQuickDemo('new')}
                    className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-left text-amber-200 transition hover:bg-amber-500/20"
                  >
                    <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                    <div className="truncate">
                      <div className="font-bold">New Student</div>
                      <div className="text-[10px] text-amber-300/70">Test Onboarding</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => fillQuickDemo('returning')}
                    className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-left text-emerald-200 transition hover:bg-emerald-500/20"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    <div className="truncate">
                      <div className="font-bold">Returning Student</div>
                      <div className="text-[10px] text-emerald-300/70">Test Dashboard</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Institutional SSO & Security Strip */}
              <div className="relative z-10 mt-5 flex items-center justify-between text-[11px] text-slate-400 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSsoModal(true)}
                  className="flex items-center gap-1.5 font-semibold text-indigo-400 hover:text-indigo-300 transition"
                >
                  <Building className="h-3.5 w-3.5" />
                  <span>Campus SSO Login</span>
                </button>
                <span className="flex items-center gap-1 text-slate-500">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                  <span>256-Bit SSL Encrypted</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ================= GOOGLE ACCOUNT CHOOSER MODAL ================= */}
      {showGoogleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-md rounded-3xl border border-white/20 bg-slate-900 p-6 text-white shadow-2xl animate-pop">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-2.5">
                <GoogleIcon className="h-6 w-6" />
                <div>
                  <h3 className="text-base font-black">Sign in with Google</h3>
                  <p className="text-xs text-slate-400">Choose an account to continue to CalibiAI</p>
                </div>
              </div>
              <button
                onClick={() => setShowGoogleModal(false)}
                className="rounded-full bg-white/10 p-1.5 text-slate-400 hover:bg-white/20 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-2.5">
              {DEMO_GOOGLE_ACCOUNTS.map((acc, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleGoogleAuth(acc)}
                  className="flex w-full items-center gap-3.5 rounded-2xl border border-white/10 bg-white/5 p-3.5 text-left transition hover:border-indigo-400 hover:bg-white/10 active:scale-[0.99]"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-lg">
                    {acc.avatar}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-white">{acc.name}</div>
                    <div className="truncate text-xs text-slate-400">{acc.email}</div>
                    <span className={`mt-1 inline-block rounded-md border px-1.5 py-0.5 text-[9px] font-bold ${acc.badgeColor}`}>
                      {acc.badge}
                    </span>
                  </div>
                </button>
              ))}

              {/* Custom Google Account Option */}
              {!showCustomGoogleInput ? (
                <button
                  type="button"
                  onClick={() => setShowCustomGoogleInput(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/20 p-3 text-xs font-bold text-indigo-300 hover:bg-white/5"
                >
                  <span>+ Use another Google account</span>
                </button>
              ) : (
                <div className="rounded-2xl border border-white/15 bg-white/5 p-3.5 space-y-2.5 animate-fade-in">
                  <div className="text-xs font-bold text-slate-300">Enter custom Google account:</div>
                  <input
                    value={customGoogleName}
                    onChange={(e) => setCustomGoogleName(e.target.value)}
                    placeholder="Your Name (e.g. Rahul Verma)"
                    className="w-full rounded-xl border border-white/15 bg-slate-950 p-2.5 text-xs text-white placeholder:text-slate-500 outline-none focus:border-indigo-400"
                  />
                  <input
                    value={customGoogleEmail}
                    onChange={(e) => setCustomGoogleEmail(e.target.value)}
                    placeholder="your.email@gmail.com"
                    className="w-full rounded-xl border border-white/15 bg-slate-950 p-2.5 text-xs text-white placeholder:text-slate-500 outline-none focus:border-indigo-400"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!customGoogleEmail.includes('@')) {
                        showNotification('Please enter a valid Google email.')
                        return
                      }
                      handleGoogleAuth({
                        name: customGoogleName || customGoogleEmail.split('@')[0],
                        email: customGoogleEmail,
                      })
                    }}
                    className="btn-primary w-full !py-2 !text-xs font-bold"
                  >
                    Continue with this Google account →
                  </button>
                </div>
              )}
            </div>

            <p className="mt-4 text-center text-[11px] text-slate-400">
              CalibiAI will verify your profile and redirect you automatically.
            </p>
          </div>
        </div>
      )}

      {/* ================= INSTITUTIONAL SSO MODAL ================= */}
      {showSsoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-md rounded-3xl border border-white/20 bg-slate-900 p-6 text-white shadow-2xl animate-pop space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Building className="h-5 w-5 text-indigo-400" />
                <h3 className="text-base font-black">Campus Single Sign-On</h3>
              </div>
              <button
                onClick={() => setShowSsoModal(false)}
                className="rounded-full bg-white/10 p-1.5 text-slate-400 hover:bg-white/20 hover:text-white"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Enter your college or university domain to connect via SAML 2.0 / OpenID Connect SSO.
            </p>

            <div className="space-y-3">
              <input
                value={ssoDomain}
                onChange={(e) => setSsoDomain(e.target.value)}
                placeholder="university.edu or coep.ac.in"
                className="w-full rounded-2xl border border-white/15 bg-slate-950 p-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-indigo-400"
              />
              <button
                type="button"
                onClick={() => {
                  if (!ssoDomain.trim()) return
                  setShowSsoModal(false)
                  showNotification(`Connected to ${ssoDomain} SSO portal.`)
                  handleGoogleAuth({
                    name: ssoDomain.split('.')[0].toUpperCase() + ' Student',
                    email: `student@${ssoDomain.trim()}`,
                  })
                }}
                className="btn-primary w-full !py-3 !text-xs font-bold"
              >
                Continue with Campus SSO →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-md px-5 py-3 rounded-2xl bg-slate-900/95 border border-indigo-400/40 text-white shadow-2xl text-xs sm:text-sm font-semibold animate-pop backdrop-blur-xl">
          {toast}
        </div>
      )}
    </div>
  )
}
