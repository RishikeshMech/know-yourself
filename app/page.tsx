'use client'
import { Navbar } from '@/components/Navbar'
import { StoreProvider } from '@/lib/store'

function Landing(){
  return (
    <div>
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6">
        <section className="py-10 sm:py-16 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <div className="inline-flex items-center gap-2 text-xs px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/70 mb-4">Zero SaaS dependency • Self-hosted AI • Multi-region • 100M+ scale</div>
            <h1 className="text-4xl sm:text-5xl font-black leading-tight">The <span className="bg-gradient-to-r from-sky-400 to-violet-400 bg-clip-text text-transparent">credit score</span> for employability.</h1>
            <p className="mt-4 text-white/60 leading-relaxed">One unified, portable, trusted score: <b className="text-white">CALIBIAI SCORE /1000</b>. Evaluates communication, problem solving, AI skills and cognition at population scale. Built as the default readiness layer between education and hiring.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href="/login" className="px-6 py-3 rounded-full calibiai-gradient font-bold text-sm shadow-lg shadow-sky-900/30">Start Assessment →</a>
              <a href="/dashboard/student" className="px-6 py-3 rounded-full bg-white text-navy-900 font-bold text-sm">View Demo Dashboards</a>
              <a href="/docs" className="px-6 py-3 rounded-full bg-white/5 border border-white/10 font-semibold text-sm">Architecture</a>
            </div>
            <div className="mt-8 grid grid-cols-3 gap-4 text-center">
              {[{k:'Students',v:'100M+'},{k:'Countries',v:'50+'},{k:'Latency p95',v:'<200ms'}].map(x=>(
                <div key={x.k} className="rounded-2xl glass p-4">
                  <div className="text-xl font-black">{x.v}</div><div className="text-xs text-white/50">{x.k}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="relative">
            <div className="rounded-[28px] p-6 glass border border-white/10 shadow-2xl">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">CALIBIAI SCORE</span><span className="text-xs px-2 py-1 rounded-full bg-emerald-500 text-white font-bold">VERIFIED</span>
              </div>
              <div className="mt-6 flex items-baseline gap-2">
                <span className="text-6xl font-black bg-gradient-to-br from-sky-400 to-violet-400 bg-clip-text text-transparent">842</span><span className="text-white/40 text-xl">/ 1000</span>
              </div>
              <div className="mt-2 text-sm text-white/60">Grade <b className="text-white">A • Strong • 92.4 percentile</b></div>
              <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
                {[
                  ['English', '172/200'],
                  ['Problem Solving', '168/200'],
                  ['AI Debugging', '132/150'],
                  ['AI Feature', '128/150'],
                  ['Prompt Eng', '88/100'],
                  ['Cognitive', '154/200'],
                ].map(([k,v])=>(
                  <div key={k} className="flex justify-between bg-white/5 rounded-xl px-3 py-2"><span className="text-white/60">{k}</span><span className="font-mono font-bold">{v}</span></div>
                ))}
              </div>
              <div className="mt-4 rounded-full h-2 bg-white/10 overflow-hidden"><div className="h-full w-[84.2%] calibiai-gradient" /></div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl p-4 glass">
                <div className="text-xs text-white/50">Cognitive Profile</div>
                <div className="mt-2 text-sm space-y-1">
                  <div className="flex justify-between"><span>Adaptability</span><span className="font-bold">88</span></div>
                  <div className="flex justify-between"><span>Accountability</span><span className="font-bold">91</span></div>
                  <div className="flex justify-between"><span>Teamwork</span><span className="font-bold text-amber-300">76</span></div>
                </div>
              </div>
              <div className="rounded-2xl p-4 bg-emerald-500 text-navy-900">
                <div className="text-xs opacity-70">Hiring Recommendation</div>
                <div className="mt-1 font-bold leading-tight">Interview-ready — recommended for final rounds</div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-8 grid md:grid-cols-3 gap-4">
          {[
            {t:'Student', d:'Score breakdown, resume feedback, attempt history, improvement insights.', href:'/dashboard/student'},
            {t:'Faculty', d:'Batch performance, student comparison, avg score, top performers.', href:'/dashboard/faculty'},
            {t:'Institution / Enterprise', d:'Cross-institution benchmarking, bulk hiring pipelines, verified score API.', href:'/dashboard/institution'},
          ].map(c=>(
            <a key={c.t} href={c.href} className="rounded-2xl glass p-5 hover:bg-white/10 transition">
              <div className="text-sm font-bold">{c.t} Dashboard</div><div className="text-sm text-white/60 mt-1">{c.d}</div><div className="mt-3 text-xs font-semibold text-sky-400">Open →</div>
            </a>
          ))}
        </section>

        <section className="py-6 rounded-2xl glass p-6">
          <h3 className="font-bold">User Flow (millions concurrent)</h3>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {['LOGIN','PROFILE','RESUME UPLOAD','RESUME ANALYSIS','JOIN WHATSAPP','FOLLOW LINKEDIN','CONFIRMATION','INSTRUCTIONS','120-MIN TIMER','6 MODULES','SUBMIT','AI EVALUATION','CALIBIAI /1000','PDF REPORT','DASHBOARDS'].map((s,i)=>(
              <span key={s} className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-full bg-white text-navy-900 font-bold">{s}</span>
                {i<14 && <span className="text-white/30">→</span>}
              </span>
            ))}
          </div>
        </section>

        <footer className="py-10 text-xs text-white/30 text-center">Built for hyperscale from day one — custom JWT auth, self-hosted Whisper + LLaMA, S3-compatible storage, Postgres sharding, Redpanda streaming. No external SaaS.</footer>
      </main>
    </div>
  )
}

export default function Page(){
  return <StoreProvider><Landing/></StoreProvider>
}
