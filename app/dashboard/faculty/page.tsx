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
  useEffect(()=>{
    const s=localStorage.getItem('calibiai_scores'); if(s) setMyScore(JSON.parse(s).total)
  },[])
  const students = myScore ? [{name:'You (demo)', score: myScore, grade: myScore>=900?'S':myScore>=750?'A':myScore>=600?'B':'C', resume:78, cohort:'CSE 2026'}, ...mockStudents] : mockStudents
  const avg = Math.round(students.reduce((a,b)=>a+b.score,0)/students.length)
  const top = students.reduce((a,b)=>a.score>b.score?a:b, students[0])

  return (
    <div>
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-black">Faculty Dashboard</h1>
            <p className="text-sm text-white/60">Batch performance • student comparison • analytics — read-replica + ClickHouse.</p>
          </div>
          <div className="flex gap-2 text-xs">
            <select className="rounded-full bg-white/10 border border-white/10 px-3 py-1.5"><option>CSE 2026</option><option>ECE 2026</option><option>All cohorts</option></select>
            <button onClick={()=>alert('CSV export streaming from ClickHouse (mock)')} className="px-3 py-1.5 rounded-full bg-white text-navy-900 font-bold">Export CSV</button>
          </div>
        </div>

        <div className="mt-6 grid sm:grid-cols-4 gap-3">
          <div className="rounded-2xl glass p-4"><div className="text-xs text-white/50">Avg Score</div><div className="text-2xl font-black">{avg}</div><div className="text-xs text-white/40">/1000 across {students.length} students</div></div>
          <div className="rounded-2xl glass p-4"><div className="text-xs text-white/50">Median</div><div className="text-2xl font-black">728</div><div className="text-xs text-white/40">Grade B</div></div>
          <div className="rounded-2xl glass p-4"><div className="text-xs text-white/50">Top Performer</div><div className="text-sm font-bold">{top.name}</div><div className="text-xs text-emerald-300">{top.score} • Grade {top.grade}</div></div>
          <div className="rounded-2xl calibiai-gradient p-4 text-white"><div className="text-xs opacity-80">Grade Distribution</div><div className="mt-2 text-xs space-y-1"><div className="flex justify-between"><span>S (900+)</span><span>2</span></div><div className="flex justify-between"><span>A (750+)</span><span>3</span></div><div className="flex justify-between"><span>B (600+)</span><span>3</span></div></div></div>
        </div>

        <div className="mt-6 grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 rounded-2xl glass p-4">
            <div className="text-sm font-bold">Student Comparison</div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-white/40"><tr><th className="text-left py-2">Name</th><th>Cohort</th><th>Score</th><th>Grade</th><th>Resume</th><th></th></tr></thead>
                <tbody>
                  {students.sort((a,b)=>b.score-a.score).map(s=>(
                    <tr key={s.name} className="border-t border-white/5">
                      <td className="py-2.5 font-semibold">{s.name} {s.name.includes('You') && <span className="text-sky-400">(you)</span>}</td>
                      <td className="text-white/60">{s.cohort}</td>
                      <td className="font-mono font-bold">{s.score}</td>
                      <td><span className={`px-2 py-0.5 rounded-full text-xs font-bold ${s.grade==='S'?'bg-violet-500 text-white': s.grade==='A'?'bg-emerald-500 text-white': s.grade==='B'?'bg-sky-500 text-white':'bg-amber-500 text-navy-900'}`}>{s.grade}</span></td>
                      <td className="text-white/60">{s.resume}</td>
                      <td><button onClick={()=>alert('Download report for '+s.name+' (MinIO presigned)')} className="text-sky-400">PDF</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 text-xs text-white/40">Data from Postgres read replica (tenant-sharded), analytics from ClickHouse. Bulk PDF zip streams from MinIO.</div>
          </div>
          <div className="space-y-4">
            <div className="rounded-2xl glass p-4">
              <div className="text-sm font-bold">Module Averages (cohort)</div>
              <div className="mt-3 space-y-2 text-xs">
                {[
                  ['English', 142, 200],
                  ['Problem Solving', 138, 200],
                  ['AI Debugging', 98, 150],
                  ['AI Feature', 94, 150],
                  ['Prompt Eng', 64, 100],
                  ['Cognitive', 132, 200],
                ].map(([k,v,max])=>(
                  <div key={String(k)} className="flex items-center gap-2"><span className="w-28 text-white/60">{k}</span><div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-sky-500" style={{width:`${(Number(v)/Number(max))*100}%`}} /></div><span className="w-12 text-right font-mono">{String(v)}</span></div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl glass p-4">
              <div className="text-sm font-bold">Analytics</div>
              <div className="mt-2 h-20 flex items-end gap-1">
                {['S','A','B','C','D'].map(g=>(
                  <div key={g} className="flex-1 flex flex-col items-center gap-1"><div className="w-full bg-violet-500 rounded-t" style={{height: `${g==='B'?48:g==='A'?36:g==='C'?22:g==='S'?16:12}px`}} /><span className="text-xs">{g}</span></div>
                ))}
              </div>
              <div className="text-xs text-white/40 mt-2">Heatmap + cohort comparison via ClickHouse approx quantiles, updated hourly.</div>
            </div>
            <button onClick={()=>alert('Bulk zip download: streaming from MinIO (mock)')} className="w-full py-2.5 rounded-full calibiai-gradient text-xs font-bold">Download All Reports (zip)</button>
          </div>
        </div>
      </main>
    </div>
  )
}
export default function Page(){ return <StoreProvider><Inner/></StoreProvider> }
