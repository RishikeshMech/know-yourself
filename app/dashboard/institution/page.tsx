'use client'
export const dynamic = 'force-dynamic'
import { Navbar } from '@/components/Navbar'
import { StoreProvider } from '@/lib/store'
import { useState, useEffect } from 'react'

const institutions = [
  {name:'IIT Madras', avg:742, students:4200},
  {name:'IIT Delhi', avg:738, students:3800},
  {name:'BITS Pilani', avg:715, students:3100},
  {name:'Your Institution', avg:728, students:1240, isYours:true},
]

function Inner(){
  const [minScore,setMinScore]=useState(750)
  const candidates = [
    {name:'Priya Sharma', score:842, skills:['Python','React'], college:'IIT Madras'},
    {name:'Ananya Singh', score:884, skills:['Python','SQL'], college:'IIT Madras'},
    {name:'Rohan Mehta', score:721, skills:['Java'], college:'BITS'},
    {name:'Sara Joseph', score:760, skills:['React','Node'], college:'IIT Delhi'},
  ].filter(c=>c.score>=minScore)

  const [apiKey] = useState('calibiai_live_demo')
  useEffect(()=>{}, [])

  return (
    <div>
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="animate-fade-up">
          <h1 className="text-2xl font-black text-slate-900">Institution dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">Benchmark your students and shortlist verified talent.</p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {l:'Total students', v:'2.4M', s:'+12% this month', sColor:'text-emerald-600'},
            {l:'Average CalibiAI', v:728, s:'National avg 702'},
            {l:'Placement-ready', v:'38%', s:'Grade S + A'},
          ].map((c,i)=>(
            <div key={i} className="glass-card !p-5 hover-lift animate-fade-up" style={{animationDelay:`${.05*i}s`}}>
              <div className="text-xs text-slate-500 font-semibold">{c.l}</div>
              <div className="text-2xl font-black text-slate-900 mt-1">{c.v}</div>
              <div className={`text-xs ${c.sColor || 'text-slate-400'}`}>{c.s}</div>
            </div>
          ))}
          <div className="rounded-3xl calibiai-gradient p-5 text-white shadow-xl shadow-indigo-200 animate-fade-up" style={{animationDelay:'.15s'}}>
            <div className="text-xs opacity-80 font-semibold">Your rank</div>
            <div className="text-2xl font-black mt-1">#12 <span className="text-sm font-medium opacity-80">/ 240</span></div>
            <div className="text-xs opacity-80">Top 5% zone: 760+</div>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="glass-card !p-5 animate-fade-up">
            <div className="text-sm font-bold text-slate-700">Cross-institution benchmarking</div>
            <div className="mt-3 space-y-2">
              {institutions.map(inst=>(
                <div key={inst.name} className={`flex items-center gap-3 p-2.5 rounded-xl ${inst.isYours ? 'calibiai-gradient text-white shadow-md shadow-indigo-200' : 'panel'}`}>
                  <span className="flex-1 text-sm font-semibold">{inst.name}{inst.isYours && ' · You'}</span>
                  <span className={`text-xs font-mono ${inst.isYours ? 'text-white/90' : 'text-slate-500'}`}>avg {inst.avg}</span>
                  <div className={`w-24 h-2 rounded-full overflow-hidden ${inst.isYours ? 'bg-white/25' : 'bg-slate-200'}`}><div className={`h-full ${inst.isYours ? 'bg-white' : 'calibiai-gradient'}`} style={{width:`${(inst.avg/900)*100}%`}}/></div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-card !p-5 animate-fade-up" style={{animationDelay:'.05s'}}>
            <div className="text-sm font-bold text-slate-700">Hiring partner API</div>
            <div className="mt-3 code-panel p-4 text-xs">
              <div className="text-slate-400">API key (scoped to your institution)</div>
              <div className="mt-1.5 flex items-center gap-2">
                <code className="flex-1 bg-black/30 rounded-lg px-2 py-1.5 break-all">{apiKey}</code>
                <button onClick={()=>navigator.clipboard?.writeText(apiKey)} className="px-3 py-1.5 rounded-full bg-white text-slate-900 font-bold">Copy</button>
              </div>
              <div className="mt-2.5 text-slate-400 leading-relaxed">GET /enterprise/candidates?min_score=750 · POST /enterprise/verify · webhook evaluation.completed</div>
            </div>
            <p className="mt-3 text-xs text-slate-400">Every score carries a verifiable hash — employers can confirm it without accessing private student data.</p>
          </div>
        </div>

        <div className="glass-card !p-5 animate-fade-up">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-bold text-slate-700">Bulk hiring pipeline</div>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span>Min score</span>
              <input type="range" min={400} max={900} value={minScore} onChange={e=>setMinScore(Number(e.target.value))} className="accent-indigo-600" />
              <span className="font-mono font-bold text-slate-700 w-10">{minScore}</span>
            </div>
          </div>
          <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {candidates.map(c=>(
              <div key={c.name} className="panel p-4 hover-lift">
                <div className="flex items-center justify-between"><span className="font-bold text-sm text-slate-800">{c.name}</span><span className="px-2 py-0.5 rounded-full calibiai-gradient text-white text-xs font-bold">{c.score}</span></div>
                <div className="text-xs text-slate-500 mt-1">{c.college} · {c.skills.join(', ')}</div>
                <div className="mt-3 flex gap-2">
                  <button onClick={()=>alert('Verified ✓ score '+c.score)} className="flex-1 py-1.5 rounded-full btn-primary !py-1.5 !text-xs">Verify</button>
                  <button onClick={()=>alert('Added to your pipeline')} className="flex-1 py-1.5 rounded-full btn-soft !py-1.5 !text-xs">Add to pipeline</button>
                </div>
              </div>
            ))}
            {candidates.length===0 && <div className="text-sm text-slate-400 col-span-full py-6 text-center">No candidates at ≥ {minScore} — lower the minimum score.</div>}
          </div>
        </div>
      </main>
    </div>
  )
}
export default function Page(){ return <StoreProvider><Inner/></StoreProvider> }
