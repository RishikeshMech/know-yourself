'use client'
import { useState } from 'react'
import { Navbar } from '@/components/Navbar'
import { StoreProvider, useStore } from '@/lib/store'
import { Stepper } from '@/components/Stepper'

function ResumeInner(){
  const {resume, setResume} = useStore()
  const [fileName,setFileName] = useState('')
  const [analyzing,setAnalyzing] = useState(false)
  const [done,setDone] = useState<any>(resume)

  const onUpload = (e:any)=>{
    const f = e.target.files?.[0]
    if(!f) return
    setFileName(f.name)
    setAnalyzing(true)
    // Simulate MinIO presigned upload + queue -> LLaMA 8B parsing
    setTimeout(()=>{
      const mock = {
        resume_score: 78,
        parsed:{ name:'Priya Sharma', skills:['Python','React','SQL','Docker'], experience_years:1.2, projects:2 },
        feedback:{
          strengths:['Strong project section','Clear formatting','Good skill coverage'],
          gaps:['Missing quantified impact','No certifications listed','Experience descriptions could be more concise'],
          suggestions:['Add metrics: “Improved API latency by 30%”','Include GitHub links for projects','Add AWS certification if any']
        },
        storage_key: `minio://resumes/${Date.now()}.pdf`
      }
      setDone(mock); setResume(mock); setAnalyzing(false)
    }, 1800)
  }

  return (
    <div>
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <Stepper step={3} />
        <div className="mt-6 grid lg:grid-cols-2 gap-6">
          <div className="rounded-[24px] glass p-6">
            <h1 className="text-xl font-black">Resume Upload</h1>
            <p className="text-sm text-white/60">Direct to MinIO via presigned POST • queue → self-hosted LLaMA 8B LoRA • no external API</p>

            <label className="mt-6 block rounded-2xl border-2 border-dashed border-white/15 bg-white/5 p-8 text-center cursor-pointer hover:bg-white/10">
              <input type="file" accept=".pdf,.docx" className="hidden" onChange={onUpload} />
              <div className="text-3xl">📄</div>
              <div className="mt-2 text-sm font-bold">{fileName || 'Drag & drop or browse (PDF/DOCX, <5MB)'}</div>
              <div className="text-xs text-white/50 mt-1">Owned S3-compatible storage (MinIO erasure 8+4) • CDN-fronted</div>
            </label>

            {analyzing && (
              <div className="mt-4 rounded-xl bg-sky-500/10 border border-sky-500/20 p-3 text-sm flex items-center gap-3">
                <div className="w-4 h-4 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
                Analyzing with self-hosted LLaMA 8B (resume LoRA)… (~2s batch)
              </div>
            )}

            <div className="mt-4 flex gap-3">
              <button disabled={!done} onClick={()=>window.location.href='/tracking/whatsapp'} className={`px-6 py-3 rounded-full font-bold text-sm ${done ? 'calibiai-gradient text-white' : 'bg-white/10 text-white/40 cursor-not-allowed'}`}>Continue →</button>
              <a href="/profile" className="px-6 py-3 rounded-full bg-white/10 text-sm">Back</a>
            </div>
          </div>

          <div className="rounded-[24px] glass p-6">
            <h3 className="font-bold">Resume Analysis (AI-based parsing + scoring)</h3>
            {!done && !analyzing && <div className="mt-6 text-sm text-white/50">Upload a resume to see parsing, scoring and feedback.</div>}
            {done && (
              <div className="mt-4">
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 rounded-full border-4 border-sky-500 flex items-center justify-center text-xl font-black">{done.resume_score}<span className="text-xs">/100</span></div>
                  <div className="text-sm">
                    <div className="font-bold">{done.parsed.name} • {done.parsed.experience_years} yrs</div>
                    <div className="text-white/60">Skills: {done.parsed.skills.join(', ')}</div>
                    <div className="text-white/40 text-xs">{done.storage_key}</div>
                  </div>
                </div>
                <div className="mt-4 grid sm:grid-cols-2 gap-3 text-xs">
                  <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3">
                    <div className="font-bold text-emerald-300">Strengths</div>
                    <ul className="mt-1 list-disc ml-4 space-y-1 text-white/70">{done.feedback.strengths.map((s:string)=><li key={s}>{s}</li>)}</ul>
                  </div>
                  <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3">
                    <div className="font-bold text-amber-300">Gaps</div>
                    <ul className="mt-1 list-disc ml-4 space-y-1 text-white/70">{done.feedback.gaps.map((s:string)=><li key={s}>{s}</li>)}</ul>
                  </div>
                </div>
                <div className="mt-3 rounded-xl bg-white/5 p-3 text-xs">
                  <div className="font-bold">Suggestions</div>
                  <ul className="mt-1 list-disc ml-4 text-white/70">{done.feedback.suggestions.map((s:string)=><li key={s}>{s}</li>)}</ul>
                </div>
              </div>
            )}
            <div className="mt-4 text-xs font-mono text-white/30">POST /api/v1/resume/presign → MinIO → queue resume.jobs → vLLM LLaMA 8B → JSON</div>
          </div>
        </div>
      </main>
    </div>
  )
}
export default function Page(){ return <StoreProvider><ResumeInner/></StoreProvider> }
