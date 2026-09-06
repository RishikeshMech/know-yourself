'use client'
import { Navbar } from '@/components/Navbar'
import { HeroMockup } from '@/components/HeroMockup'
import { StoreProvider } from '@/lib/store'

const MODULES = [
  'English Communication', 'Problem Solving', 'AI Debugging',
  'AI Feature Dev', 'Prompt Engineering', 'Cognitive Assessment',
]

function Landing() {
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
              Your skills.<br />
              One <span className="text-gradient">verified score.</span>
            </h1>
            <p className="mt-4 text-slate-500 text-lg max-w-md">
              Communication, problem solving, AI skills &amp; cognition — one signal employers trust.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href="/login" className="btn-primary">Start your assessment →</a>
              <a href="/sample-report" className="btn-soft">See a sample report</a>
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

        {/* CTA band */}
        <section className="pb-16">
          <div className="glass-card !p-8 sm:!p-10 text-center">
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900">Ready when you are.</h2>
            <p className="mt-1.5 text-sm text-slate-500">120 minutes. Six modules. One score.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {MODULES.map((m, i) => (
                <span key={m} className="chip !bg-white/70 !text-slate-700 font-semibold">
                  <span className="text-indigo-500 font-black">{i + 1}.</span> {m}
                </span>
              ))}
            </div>
            <a href="/login" className="btn-primary mt-7">Start your assessment →</a>
          </div>
        </section>
      </main>
    </div>
  )
}

export default function Page() {
  return <StoreProvider><Landing /></StoreProvider>
}
