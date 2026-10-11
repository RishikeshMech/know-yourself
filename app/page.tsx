'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Navbar } from '@/components/Navbar'
import { HeroMockup } from '@/components/HeroMockup'
import { useStore } from '@/lib/store'
import { Typewriter } from '@/components/Typewriter'
import { StudentTestimonials } from '@/components/StudentTestimonials'
import { CompanyBadge } from '@/components/company/CompanyBadge'
import { COMPANY_BY_SLUG, companyMockFacts } from '@/lib/company/catalog'
import { signedInLandingRoute, afterSignInRoute } from '@/lib/nextStep'
import { isProfileComplete } from '@/lib/validate'
import { getLiveUser } from '@/lib/session'

const MODULES = [
  'English Communication', 'Problem Solving', 'AI Debugging',
  'AI Feature Dev', 'Prompt Engineering', 'Cognitive Assessment',
]

const SHOWCASE_SLUGS = [
  'capgemini',
  'tcs',
  'cognizant',
  'meta',
  'google',
  'infosys',
  'accenture',
  'amazon',
  'microsoft',
  'wipro',
  'phonepe',
  'goldman-sachs',
]

const SHOWCASE_COMPANIES = SHOWCASE_SLUGS.map((slug) => COMPANY_BY_SLUG[slug]).filter(Boolean)

function Landing() {
  const router = useRouter()
  const { user, profile, hydrated, setUser, reconcileForUser } = useStore()
  const sentRef = useRef(false)
  const [redirecting, setRedirecting] = useState(false)

  // A signed-in candidate should never see the marketing home page (or the login
  // screen). If they land here while authenticated — via the Supabase email
  // confirmation redirect, the browser back button or a direct URL — send them
  // smoothly to their actual next step (dashboard or onboarding).
  //
  // The cached `user`/`profile` cannot be trusted on its own: after an account
  // is deleted in Supabase and re-created, the old profile still sits in
  // localStorage and would route the "new" user straight to the dashboard. So
  // validate against Supabase Auth first, re-hydrate from the DB if the cached
  // account no longer matches, and only then route.
  useEffect(() => {
    if (!hydrated || !user || sentRef.current) return
    sentRef.current = true
    setRedirecting(true)
    ;(async () => {
      let route = signedInLandingRoute(profile)
      const live = await getLiveUser()
      if (live === null) {
        // Supabase no longer knows this account (deleted / no session) — wipe
        // the stale cache so the next sign-in starts from scratch.
        localStorage.clear()
        setUser(null)
        router.replace('/login')
        return
      }
      if (live && live.id !== user.id) {
        // The cached account belongs to a different live user — re-hydrate the
        // real one from the DB and route by its actual onboarding/result state.
        const { profile: p, hasAssessment } = await reconcileForUser(live)
        route = afterSignInRoute({ has_assessment: hasAssessment, has_onboarding: isProfileComplete(p) })
      }
      router.replace(route)
    })()
  }, [user, profile, hydrated, router, setUser, reconcileForUser])

  if (!hydrated || user || redirecting) {
    if (user || redirecting) {
      return (
        <div className="flex min-h-screen items-center justify-center">
          <div className="glass-card animate-fade-up flex items-center gap-3 px-6 py-4">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
            <span className="text-sm font-bold text-slate-700">Connecting to your dashboard…</span>
          </div>
        </div>
      )
    }
    return null
  }

  const startHref = '/login'
  return (
    <div>
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Hero — copy kept to the essentials; the MacBook window does the talking */}
        <section className="pt-12 sm:pt-20 pb-12 grid lg:grid-cols-2 gap-14 items-center">
          <div className="animate-fade-up">
            <span className="chip text-indigo-700 border-indigo-200 bg-indigo-50/70">
              <span className="w-2 h-2 rounded-full bg-emerald-500" /> Trusted employability assessment
            </span>
            <h1 className="mt-5 text-4xl sm:text-5xl lg:text-[3.4rem] font-black leading-[1.05] tracking-tight text-slate-900">
              <Typewriter text="Your skills." delay={90} />
              <br />
              One <span className="text-gradient">verified score.</span>
            </h1>
            <p className="mt-4 text-slate-500 text-lg max-w-md">
              Communication, problem solving, AI skills &amp; cognition — one signal employers trust.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href={startHref} className="btn-primary">Start your free assessment →</Link>
              <Link href="/sample-report" className="btn-soft">See a sample report</Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-5 text-sm text-slate-500">
              {['⏱ 120 minutes', '🧩 6 skill modules', '📄 PDF credential'].map(t => (
                <span key={t} className="flex items-center gap-1.5">{t}</span>
              ))}
            </div>
          </div>

          {/* MacBook window: typing report + self-drawing graph, ambient chart behind */}
          <HeroMockup />
        </section>

        {/* What you get — three tiles, one line each */}
        <section className="py-10">
          <div className="text-center text-[11px] font-bold uppercase tracking-[.25em] text-indigo-500">What you get</div>
          <div className="mt-6 grid sm:grid-cols-3 gap-4">
            {[
              { icon: '🎯', t: 'One score, every skill', d: 'Six skills. One 1000-point credential.' },
              { icon: '🧠', t: 'AI-verified evidence', d: 'Objective scoring, AI-reviewed.' },
              { icon: '📄', t: 'Shareable PDF report', d: 'A credential employers can verify.' },
            ].map((c, i) => (
              <div key={c.t} className="glass-card hover-lift !p-6 animate-fade-up" style={{ animationDelay: `${0.05 * i}s` }}>
                <div className="w-10 h-10 rounded-xl calibiai-gradient flex items-center justify-center text-lg shadow-lg shadow-indigo-200">{c.icon}</div>
                <div className="mt-3 font-bold text-slate-800">{c.t}</div>
                <div className="text-sm text-slate-500 mt-0.5">{c.d}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Assessment CTA & 50+ Company Mocks Showcase */}
        <section className="py-10">
          <div className="glass-card !p-8 sm:!p-12 text-center animate-fade-up relative overflow-hidden">
            {/* Subtle ambient background glow */}
            <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-72 w-96 rounded-full bg-gradient-to-br from-indigo-200/40 via-violet-200/30 to-pink-200/20 blur-3xl -z-10" />

            <span className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50/90 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-indigo-700 shadow-2xs">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" /> 50+ Exam-Oriented Company Mocks
            </span>

            <h2 className="mt-4 text-3xl sm:text-4xl font-black tracking-tight text-slate-900">
              Ready when you are.
            </h2>
            <p className="mt-2 text-base text-slate-600 max-w-2xl mx-auto leading-relaxed">
              120 minutes · Six skill modules · One score employers trust. Plus, realistic mocks reverse-engineered to the latest exam patterns of 50+ leading companies.
            </p>

            {/* Core skill modules chips */}
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {MODULES.map((m, i) => (
                <span
                  key={m}
                  className="chip !bg-white/80 !text-slate-700 font-semibold shadow-2xs hover:border-indigo-300 hover:text-indigo-700 transition"
                >
                  <span className="text-indigo-600 font-black">{i + 1}.</span> {m}
                </span>
              ))}
            </div>

            {/* 50+ Companies sliding ticker */}
            <div className="mt-9 overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-b from-slate-50/70 via-white to-indigo-50/30 p-4 sm:p-5 shadow-sm text-left">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/60 pb-3.5">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-8 w-8 place-items-center rounded-xl bg-indigo-600 text-base text-white shadow-xs" aria-hidden>🏢</span>
                  <div>
                    <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-900">
                      50+ Company-Specific Hiring Mocks
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Exact test blueprints for Capgemini, TCS, Cognizant, Meta, Google, Infosys &amp; more
                    </p>
                  </div>
                </div>
                <Link
                  href="/company-assessments"
                  className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-violet-600 transition"
                >
                  Explore all 50+ companies <span aria-hidden>→</span>
                </Link>
              </div>

              {/* Infinite horizontal sliding marquee */}
              <div className="relative mt-4 overflow-hidden py-1">
                {/* Gradient edge fades */}
                <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-white via-white/80 to-transparent z-10" />
                <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-white via-white/80 to-transparent z-10" />

                <div className="animate-marquee-track gap-3.5">
                  {[...SHOWCASE_COMPANIES, ...SHOWCASE_COMPANIES].map((company, index) => {
                    const facts = companyMockFacts(company)
                    return (
                      <Link
                        key={`${company.slug}-${index}`}
                        href={`/company-assessments/${company.slug}`}
                        className="group flex shrink-0 items-center gap-3 rounded-2xl border border-slate-200/90 bg-white p-3 shadow-xs transition duration-200 hover:-translate-y-1 hover:border-indigo-300 hover:shadow-md"
                        title={`Take ${company.name} Mock Assessment`}
                      >
                        <CompanyBadge company={company} size={36} />
                        <div className="text-left min-w-[130px]">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-black text-slate-900 group-hover:text-indigo-600 transition">
                              {company.name}
                            </span>
                            <span className="rounded bg-indigo-50 px-1.5 py-0.2 text-[9px] font-black text-indigo-700 border border-indigo-100">
                              Pattern Mock
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-[10px] font-medium text-slate-500 max-w-[155px]">
                            {company.track}
                          </p>
                          <div className="mt-1 flex items-center gap-1.5 text-[9px] font-semibold text-slate-400">
                            <span>⏱ {facts.minutes}m</span>
                            <span>·</span>
                            <span>{facts.rounds} rounds</span>
                            <span>·</span>
                            <span>{facts.questions} Qs</span>
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Why candidates use this platform — 3 value cards */}
            <div className="mt-8 grid gap-4 text-left sm:grid-cols-3">
              <div className="group rounded-2xl border border-indigo-100 bg-white/85 p-5 shadow-xs transition duration-200 hover:-translate-y-1 hover:border-indigo-300 hover:bg-white hover:shadow-md">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 shadow-xs border border-indigo-100/80 transition group-hover:scale-110">
                  <span className="text-xl" aria-hidden>🎯</span>
                </div>
                <h4 className="mt-3.5 text-sm font-black text-slate-900 group-hover:text-indigo-600 transition">
                  100% Pattern-Accurate Mocks
                </h4>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                  Replicating the exact recruitment patterns of TCS NQT, Capgemini, Cognizant, Meta, and 50+ companies. Sectional cutoffs, negative markings, and authentic question difficulty.
                </p>
              </div>

              <div className="group rounded-2xl border border-indigo-100 bg-white/85 p-5 shadow-xs transition duration-200 hover:-translate-y-1 hover:border-indigo-300 hover:bg-white hover:shadow-md">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600 shadow-xs border border-violet-100/80 transition group-hover:scale-110">
                  <span className="text-xl" aria-hidden>⏱️</span>
                </div>
                <h4 className="mt-3.5 text-sm font-black text-slate-900 group-hover:text-violet-600 transition">
                  Real Proctored Simulation
                </h4>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                  Timed environments with strict full-screen anti-cheat proctoring. Experience real hiring pressure beforehand so you walk into campus and off-campus drives fully prepared.
                </p>
              </div>

              <div className="group rounded-2xl border border-indigo-100 bg-white/85 p-5 shadow-xs transition duration-200 hover:-translate-y-1 hover:border-indigo-300 hover:bg-white hover:shadow-md">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 shadow-xs border border-emerald-100/80 transition group-hover:scale-110">
                  <span className="text-xl" aria-hidden>📊</span>
                </div>
                <h4 className="mt-3.5 text-sm font-black text-slate-900 group-hover:text-emerald-600 transition">
                  Instant AI Feedback &amp; Score
                </h4>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                  Automatic code execution on hidden stress tests, section-wise score analytics, and a verified 1000-point CalibiAI Score credential you can attach directly to your resume.
                </p>
              </div>
            </div>

            {/* Primary Action Buttons */}
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3.5">
              <Link
                href={startHref}
                className="btn-primary !px-8 !py-3.5 text-sm sm:text-base font-black shadow-xl shadow-indigo-200 transition hover:scale-[1.02] active:scale-[0.98]"
              >
                Start your free assessment →
              </Link>
              <Link
                href="/company-assessments"
                className="btn-soft !px-6 !py-3.5 text-sm font-bold transition hover:scale-[1.02] active:scale-[0.98]"
              >
                Explore 50+ company mocks →
              </Link>
            </div>
            <p className="mt-3 text-xs text-slate-400 font-medium">
              Free to begin · 6 skill modules · Pattern-matched hiring papers · Instant verified report
            </p>
          </div>
        </section>

        {/* Student testimonials — auto-sliding carousel, 5s per story */}
        <section className="pt-10 pb-16">
          <StudentTestimonials />
        </section>
      </main>
    </div>
  )
}

export default function Page() {
  return <Landing />
}
