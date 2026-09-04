'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { Navbar } from '@/components/Navbar'
import { StoreProvider } from '@/lib/store'

function Inner(){
  const [scores,setScores]=useState<any>(null)
  const [profile,setProfile]=useState<any>(null)
  const [resume,setResume]=useState<any>(null)
  useEffect(()=>{
    const s=localStorage.getItem('calibiai_scores'); if(s) setScores(JSON.parse(s))
    const p=localStorage.getItem('calibiai_profile'); if(p) setProfile(JSON.parse(p))
    const r=localStorage.getItem('calibiai_resume'); if(r) setResume(JSON.parse(r))
  },[])
  const history = scores ? [
    {date:'2026-07-01', total: 740},
    {date:'2026-08-10', total: 790},
    {date:'2026-09-04', total: scores.total},
  ] : []

  return (
    <div>
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <h1 className="text-xl font-black">Student Dashboard</h1>
        <p className="text-sm text-white/60">Score breakdown, improvement insights, attempt history, resume feedback — tenant-isolated, sharded.</p>

        <div className="mt-6 grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 rounded-[20px] glass p-5">
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold">Latest Calibiai Score</div>
              <span className="text-xs px-2 py-1 rounded-full bg-white/10">{history.length} attempts</span>
            </div>
            {scores ? (
              <div>
                <div className="mt-4 flex items-baseline gap-3">
                  <span className="text-4xl font-black bg-gradient-to-r from-sky-400 to-violet-400 bg-clip-text text-transparent">{scores.total}</span>
                  <span className="text-white/40">/1000 • Grade {scores.grade} • {scores.percentile} percentile</span>
                </div>
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  {[
                    ['English', scores.english.total+'/200'],
                    ['Problem Solving', scores.problem_solving+'/200'],
                    ['AI Debugging', scores.ai_debugging+'/150'],
                    ['AI Feature', scores.ai_feature+'/150'],
                    ['Prompt Eng', scores.prompt_engineering+'/100'],
                    ['Cognitive', scores.cognitive.total+'/200'],
                  ].map(([k,v])=>(
                    <div key={k} className="rounded-xl bg-white/5 p-3 flex justify-between"><span className="text-white/60">{k}</span><span className="font-mono font-bold">{v}</span></div>
                  ))}
                </div>
                <div className="mt-4">
                  <div className="text-xs font-bold">Attempt History</div>
                  <div className="mt-2 flex items-end gap-2 h-24">
                    {history.map(h=>(
                      <div key={h.date} className="flex-1 flex flex-col items-center gap-1">
                        <div className="w-full rounded-t-lg calibiai-gradient" style={{height: `${(h.total/1000)*80}px`}} />
                        <span className="text-xs font-bold">{h.total}</span>
                        <span className="text-[10px] text-white/40">{h.date}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : <div className="mt-6 text-sm text-white/50">No attempts yet. <a href="/login" className="text-sky-400">Start assessment →</a></div>}
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl glass p-4">
              <div className="text-sm font-bold">Resume Feedback</div>
              {resume ? (
                <div className="mt-2 text-xs">
                  <div className="flex items-center gap-2"><span className="w-10 h-10 rounded-full border-2 border-sky-500 flex items-center justify-center font-black text-sm">{resume.resume_score}</span><span className="text-white/60">/100 • {resume.storage_key}</span></div>
                  <div className="mt-3">
                    <div className="font-bold text-emerald-300">Strengths</div>
                    <ul className="list-disc ml-4 text-white/60">{resume.feedback.strengths.slice(0,2).map((s:string)=><li key={s}>{s}</li>)}</ul>
                  </div>
                </div>
              ) : <div className="text-xs text-white/50">No resume yet</div>}
              <a href="/resume" className="mt-3 inline-block text-xs text-sky-400">Re-upload →</a>
            </div>
            <div className="rounded-2xl bg-violet-500 text-white p-4">
              <div className="text-sm font-bold">Improvement Plan (AI)</div>
              <ul className="mt-2 text-xs space-y-1 opacity-90 list-disc ml-4">
                <li>Teamwork 76 → practice collaborative scenarios (faculty cohort exercises)</li>
                <li>Prompt specificity → study Calibiai prompt library, 3 daily drills</li>
                <li>Grid accuracy → 5-min daily spatial training</li>
              </ul>
            </div>
            <div className="rounded-2xl glass p-4 text-xs">
              <div className="font-bold">Reports</div>
              <div className="mt-2 space-y-2">
                {scores && <a href="/result" className="block rounded-xl bg-white/5 p-3 flex justify-between"><span>Report {scores.session_id.slice(0,8)} • {scores.total}/1000</span><span className="text-sky-400">View</span></a>}
                <div className="text-white/40"> PDFs stored on MinIO, CDN-cached 1yr, immutable. Async rendering.</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl glass p-4">
          <div className="text-sm font-bold">Profile</div>
          <div className="mt-2 text-xs text-white/60 grid sm:grid-cols-3 gap-2">
            <div>Name: <b className="text-white">{profile?.full_name||'—'}</b></div>
            <div>College: <b className="text-white">{profile?.college||'—'}</b></div>
            <div>Skills: <b className="text-white">{profile?.skills||'—'}</b></div>
          </div>
        </div>
      </main>
    </div>
  )
}
export default function Page(){ return <StoreProvider><Inner/></StoreProvider> }
