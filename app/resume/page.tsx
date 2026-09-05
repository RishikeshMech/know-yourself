'use client'
import { useState } from 'react'
import { Navbar } from '@/components/Navbar'
import { StoreProvider, useStore } from '@/lib/store'
import { Stepper } from '@/components/Stepper'
import { getSupabase } from '@/lib/supabase'

function ResumeInner(){
  const {resume, setResume} = useStore()
  const [fileName,setFileName] = useState('')
  const [analyzing,setAnalyzing] = useState(false)
  const [done,setDone] = useState<any>(resume)

  const onUpload = async (e:any)=>{
    const f = e.target.files?.[0]
    if(!f) return
    setFileName(f.name)
    setAnalyzing(true)
    const sb = getSupabase()
    let storageKey = `resume_${Date.now()}.pdf`
    try{
      if(sb){
        const { data:{ user } } = await sb.auth.getUser()
        if(user){
          const path = `${user.id}/${Date.now()}_${f.name}`
          const up = await sb.storage.from('resumes').upload(path, f, { upsert:true, contentType: f.type })
          if(!up.error) storageKey = path
        }
      }
    }catch{ /* demo mode */ }
    setTimeout(async ()=>{
      const mock = {
        resume_score: 78,
        parsed:{ name:'Your Name', skills:['Python','React','SQL','Docker'], experience_years:1.2, projects:2 },
        feedback:{
          strengths:['Strong project section','Clear formatting','Good skill coverage'],
          gaps:['Missing quantified impact','No certifications listed','Experience descriptions could be more concise'],
          suggestions:['Add metrics, e.g. “Improved API latency by 30%”','Include GitHub links for projects','Add certifications if any'],
        },
        storage_key: storageKey
      }
      setDone(mock); setResume(mock); setAnalyzing(false)
      try{
        if(sb){
          const { data:{ user } } = await sb.auth.getUser()
          if(user) await sb.from('resume_analyses').insert({ student_id: user.id, storage_key: storageKey, resume_score: mock.resume_score, parsed: mock.parsed, feedback: mock.feedback })
        }
      }catch{ /* demo mode */ }
    }, 1800)
  }

  return (
    <div>
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <Stepper step={3} />
        <div className="mt-6 grid lg:grid-cols-2 gap-6">
          {/* Upload */}
          <div className="glass-card animate-fade-up">
            <h1 className="text-2xl font-black text-slate-900">Upload your resume</h1>
            <p className="text-sm text-slate-500 mt-1">We'll analyse it and give you an instant score with personalised tips.</p>

            <label className="mt-6 block rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/40 p-10 text-center cursor-pointer hover:bg-indigo-50 transition">
              <input type="file" accept=".pdf,.docx" className="hidden" onChange={onUpload} />
              <div className="text-4xl">📄</div>
              <div className="mt-3 text-sm font-bold text-slate-700">{fileName || 'Drag & drop or browse'}</div>
              <div className="text-xs text-slate-400 mt-1">PDF or DOCX · up to 5 MB</div>
            </label>

            {analyzing && (
              <div className="mt-4 rounded-2xl bg-indigo-50 border border-indigo-200 p-4 text-sm flex items-center gap-3 text-indigo-700 animate-fade-in">
                <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                Analysing your resume…
              </div>
            )}

            <div className="mt-6 flex gap-3">
              <a href="/tracking/whatsapp" className={`btn-primary ${!done ? 'pointer-events-none opacity-40' : ''}`}>Continue →</a>
              <a href="/profile" className="btn-soft">Back</a>
            </div>
          </div>

          {/* Analysis */}
          <div className="glass-card animate-fade-up" style={{animationDelay:'.1s'}}>
            <h3 className="font-black text-slate-900 text-lg">Resume analysis</h3>
            {!done && !analyzing && <p className="mt-6 text-sm text-slate-400">Upload a resume to see your score, strengths and tips.</p>}
            {done && (
              <div className="mt-5 animate-fade-in">
                <div className="flex items-center gap-4">
                  <div className="relative w-24 h-24">
                    <svg viewBox="0 0 36 36" className="w-24 h-24 -rotate-90">
                      <circle cx="18" cy="18" r="16" fill="none" stroke="#e2e8f0" strokeWidth="3" />
                      <circle cx="18" cy="18" r="16" fill="none" stroke="url(#g)" strokeWidth="3" strokeLinecap="round"
                        strokeDasharray={`${done.resume_score} ${100-done.resume_score}`} pathLength={100} />
                      <defs><linearGradient id="g"><stop offset="0%" stopColor="#6366f1"/><stop offset="100%" stopColor="#a855f7"/></linearGradient></defs>
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center font-black text-xl text-slate-800">{done.resume_score}</div>
                  </div>
                  <div className="text-sm">
                    <div className="font-bold text-slate-800">{done.parsed.name}</div>
                    <div className="text-slate-500">{done.parsed.experience_years} yrs exp · {done.parsed.projects} projects</div>
                    <div className="text-slate-400 text-xs mt-1">Skills: {done.parsed.skills.join(', ')}</div>
                  </div>
                </div>
                <div className="mt-5 grid sm:grid-cols-2 gap-3 text-xs">
                  <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-3">
                    <div className="font-bold text-emerald-700">Strengths</div>
                    <ul className="mt-1 list-disc ml-4 space-y-0.5 text-slate-600">{done.feedback.strengths.map((s:string)=><li key={s}>{s}</li>)}</ul>
                  </div>
                  <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3">
                    <div className="font-bold text-amber-700">Gaps</div>
                    <ul className="mt-1 list-disc ml-4 space-y-0.5 text-slate-600">{done.feedback.gaps.map((s:string)=><li key={s}>{s}</li>)}</ul>
                  </div>
                </div>
                <div className="mt-3 rounded-2xl panel p-3 text-xs">
                  <div className="font-bold text-indigo-700">💡 Suggestions</div>
                  <ul className="mt-1 list-disc ml-4 space-y-0.5 text-slate-600">{done.feedback.suggestions.map((s:string)=><li key={s}>{s}</li>)}</ul>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
export default function Page(){ return <StoreProvider><ResumeInner/></StoreProvider> }
