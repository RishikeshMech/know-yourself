'use client'
import { Navbar } from '@/components/Navbar'
import { StoreProvider } from '@/lib/store'

function Landing(){
  return (
    <div>
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* Hero */}
        <section className="pt-12 sm:pt-20 pb-10 grid lg:grid-cols-2 gap-10 items-center">
          <div className="animate-fade-up">
            <span className="chip text-indigo-700 border-indigo-200 bg-indigo-50/70">
              <span className="w-2 h-2 rounded-full bg-emerald-500" /> Trusted employability assessment
            </span>
            <h1 className="mt-5 text-4xl sm:text-5xl font-black leading-[1.1] tracking-tight text-slate-900">
              Your skills. One <span className="text-gradient">verified score</span>. A clearer path forward.
            </h1>
            <p className="mt-4 text-slate-500 leading-relaxed text-lg">
              Complete a focused, evidence-based assessment and get your <b className="text-slate-700">Calibiai Score out of 1000</b> — communication, problem solving, AI skills and cognition, in one credential you can share.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href="/login" className="btn-primary">Start your assessment →</a>
              <a href="/result" className="btn-soft">See a sample report</a>
            </div>
            <div className="mt-8 flex flex-wrap gap-5 text-sm text-slate-500">
              {['⏱ 120 minutes','🧩 6 skill modules','📄 PDF credential'].map(t=>(
                <span key={t} className="flex items-center gap-1.5">{t}</span>
              ))}
            </div>
          </div>

          {/* Score card mock */}
          <div className="relative animate-fade-up" style={{animationDelay:'.12s'}}>
            <div className="glass-card hover-lift">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-700">Your Calibiai Score</span>
                <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500 text-white font-bold shadow shadow-emerald-300">✓ VERIFIED</span>
              </div>
              <div className="mt-5 flex items-baseline gap-2">
                <span className="text-6xl font-black text-gradient">842</span>
                <span className="text-slate-400 text-xl font-bold">/ 1000</span>
              </div>
              <div className="mt-1 text-sm text-slate-500">Grade <b className="text-indigo-600">A</b> · Strong · 92nd percentile</div>
              <div className="mt-5 space-y-2.5">
                {[
                  ['English', 172, 200],['Problem Solving', 168, 200],['AI Debugging', 132, 150],
                  ['AI Feature Dev', 128, 150],['Prompt Eng', 88, 100],['Cognitive', 154, 200],
                ].map(([k,v,m])=>(
                  <div key={k as string}>
                    <div className="flex justify-between text-xs mb-1"><span className="text-slate-600 font-medium">{k}</span><span className="font-mono font-bold text-slate-700">{v}/{m}</span></div>
                    <div className="h-2 rounded-full bg-slate-200/70 overflow-hidden"><div className="h-full calibiai-gradient rounded-full" style={{width: `${(v as number)/(m as number)*100}%`}} /></div>
                  </div>
                ))}
              </div>
              <div className="mt-5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 p-4 text-white shadow-lg shadow-emerald-200">
                <div className="text-xs opacity-80 font-semibold">Hiring recommendation</div>
                <div className="mt-0.5 font-bold text-sm">Interview-ready — recommended for final rounds</div>
              </div>
            </div>
          </div>
        </section>

        {/* What you get */}
        <section className="py-10">
          <h2 className="text-2xl font-black text-slate-900 text-center">What you'll walk away with</h2>
          <p className="text-slate-500 text-center mt-2 max-w-xl mx-auto text-sm">Everything in one 120-minute assessment, designed to show employers exactly what you can do.</p>
          <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {icon:'🎯', t:'One score, every skill', d:'Communication, problem solving, AI-assisted coding, prompt engineering and cognition — combined into a single /1000 score.'},
              {icon:'📈', t:'Interactive feedback', d:'See exactly where you shine and what to improve, with clear strengths and next steps for every section.'},
              {icon:'📄', t:'A shareable PDF report', d:'Download a verified credential you can attach to applications or share with your network.'},
            ].map((c,i)=>(
              <div key={c.t} className="glass-card hover-lift !p-6 animate-fade-up" style={{animationDelay:`${.05*i}s`}}>
                <div className="w-12 h-12 rounded-2xl calibiai-gradient flex items-center justify-center text-2xl shadow-lg shadow-indigo-200">{c.icon}</div>
                <div className="mt-4 font-bold text-slate-800">{c.t}</div>
                <div className="text-sm text-slate-500 mt-1 leading-relaxed">{c.d}</div>
              </div>
            ))}
          </div>
        </section>

        {/* 6 modules strip */}
        <section className="py-6 pb-14">
          <div className="glass-card text-center">
            <h3 className="text-lg font-black text-slate-900">The 6 assessment modules</h3>
            <div className="mt-5 flex flex-wrap justify-center gap-2.5">
              {['English Communication','Problem Solving','AI Debugging','AI Feature Dev','Prompt Engineering','Cognitive'].map((m,i)=>(
                <span key={m} className="chip !bg-white/70 !text-slate-700 font-semibold"><span className="text-indigo-500 font-black">{i+1}.</span> {m}</span>
              ))}
            </div>
            <a href="/login" className="btn-primary mt-7">Begin now →</a>
          </div>
        </section>
      </main>
    </div>
  )
}

export default function Page(){
  return <StoreProvider><Landing/></StoreProvider>
}
