'use client'
export const dynamic = 'force-dynamic'
import { Navbar } from '@/components/Navbar'
import { StoreProvider } from '@/lib/store'
import { useEffect, useState } from 'react'

const mockStudents = [
  {name:'Priya Sharma', score:842, grade:'A', resume:78, cohort:'CSE 2026'},
  {name:'Rohan Mehta', score:721, grade:'B', resume:66, cohort:'CSE 2026'},
  {name:'Ananya Singh', score:884, grade:'A', resume:82, cohort:'CSE 2026'},
  {name:'Karthik Nair', score:610, grade:'B', resume:59, cohort:'CSE 2026'},
  {name:'Sara Joseph', score:760, grade:'A', resume:74, cohort:'ECE 2026'},
  {name:'Vikram Patel', score:540, grade:'C', resume:61, cohort:'CSE 2026'},
  {name:'Neha Gupta', score:695, grade:'B', resume:71, cohort:'CSE 2026'},
]

function Inner(){
  const [myScore,setMyScore]=useState<number|null>(null)
  useEffect(()=>{ const s=localStorage.getItem('calibiai_scores'); if(s) setMyScore(JSON.parse(s).total) },[])
  const students = myScore ? [{name:'You (demo)', score: myScore, grade: myScore>=900?'S':myScore>=750?'A':myScore>=600?'B':'C', resume:78, cohort:'CSE 2026'}, ...mockStudents] : mockStudents
  const avg = Math.round(students.reduce((a,b)=>a+b.score,0)/students.length)
  const top = students.reduce((a,b)=>a.score>b.score?a:b, students[0])
  const gradeChip = (g:string) => g==='S' ? 'bg-violet-100 text-violet-700' : g==='A' ? 'bg-emerald-100 text-emerald-700' : g==='B' ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'

  return (
    <div>
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3 animate-fade-up">
          <div>
            <h1 className="text-2xl font-black text-slate-900">Faculty dashboard</h1>
            <p className="text-sm text-slate-500 mt-1">Batch performance and student comparison at a glance.</p>
          </div>
          <div className="flex gap-2 text-xs">
            <select className="rounded-full bg-white/70 border border-slate-200 px-3 py-1.5 text-slate-600"><option>CSE 2026</option><option>ECE 2026</option><option>All cohorts</option></select>
            <button onClick={()=>alert('CSV export (demo)')} className="btn-soft !py-1.5 !px-4 !text-xs font-bold">Export CSV</button>
          </div>
        </div>

        <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {l:'Average score', v: avg, s:`/1000 · ${students.length} students`},
            {l:'Median', v: 728, s:'Grade B band'},
            {l:'Top performer', v: top.name, s:`${top.score} · Grade ${top.grade}`, big:false},
          ].map((c,i)=>(
            <div key={i} className="glass-card !p-4 hover-lift animate-fade-up" style={{animationDelay:`${.05*i}s`}}>
              <div className="text-xs text-slate-500 font-semibold">{c.l}</div>
              <div className="text-2xl font-black text-slate-900 mt-1">{c.v}</div>
              <div className="text-xs text-slate-400">{c.s}</div>
            </div>
          ))}
          <div className="rounded-3xl calibiai-gradient p-5 text-white shadow-xl shadow-indigo-200 animate-fade-up" style={{animationDelay:'.15s'}}>
            <div className="text-xs opacity-80 font-semibold">Grade distribution</div>
            <div className="mt-2 text-xs space-y-1"><div className="flex justify-between"><span>S (900+)</span><span>2</span></div><div className="flex justify-between"><span>A (750+)</span><span>3</span></div><div className="flex justify-between"><span>B (600+)</span><span>3</span></div></div>
          </div>
        </div>

        <div className="mt-6 grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 glass-card !p-5 animate-fade-up">
            <div className="text-sm font-bold text-slate-700">Student comparison</div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-slate-400"><tr><th className="text-left py-2 font-semibold">Name</th><th className="font-semibold">Cohort</th><th className="font-semibold">Score</th><th className="font-semibold">Grade</th><th className="font-semibold">Resume</th></tr></thead>
                <tbody>
                  {students.sort((a,b)=>b.score-a.score).map(s=>(
                    <tr key={s.name} className="border-t border-slate-100">
                      <td className="py-2.5 font-semibold text-slate-700">{s.name} {s.name.includes('You') && <span className="text-indigo-600">(you)</span>}</td>
                      <td className="text-slate-500 text-center">{s.cohort}</td>
                      <td className="font-mono font-bold text-slate-800 text-center">{s.score}</td>
                      <td className="text-center"><span className={`px-2 py-0.5 rounded-full text-xs font-bold ${gradeChip(s.grade)}`}>{s.grade}</span></td>
                      <td className="text-slate-500 text-center">{s.resume}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="glass-card !p-5 animate-fade-up" style={{animationDelay:'.1s'}}>
            <div className="text-sm font-bold text-slate-700">Cohort module averages</div>
            <div className="mt-3 space-y-2.5 text-xs">
              {[['English',142,200],['Problem Solving',138,200],['AI Debugging',98,150],['AI Feature',94,150],['Prompt Eng',64,100],['Cognitive',132,200]].map(([k,v,max])=>(
                <div key={String(k)} className="flex items-center gap-2">
                  <span className="w-24 text-slate-500">{k}</span>
                  <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full calibiai-gradient rounded-full" style={{width:`${Number(v)/Number(max)*100}%`}}/></div>
                  <span className="w-10 text-right font-mono text-slate-600">{String(v)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
export default function Page(){ return <StoreProvider><Inner/></StoreProvider> }
