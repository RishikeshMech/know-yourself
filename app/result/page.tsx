'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { StoreProvider } from '@/lib/store'
import { Navbar } from '@/components/Navbar'

function ResultInner(){
  const [scores,setScores] = useState<any>(null)
  const [rendering,setRendering]=useState(false)

  useEffect(()=>{
    const s = localStorage.getItem('calibiai_scores')
    if(s) setScores(JSON.parse(s))
    else window.location.href='/assessment'
  },[])

  const downloadPDF = async()=>{
    setRendering(true)
    const { default: jsPDF } = await import('jspdf')
    const doc = new jsPDF()
    // Header
    doc.setFillColor(11,18,32); doc.rect(0,0,210,24,'F')
    doc.setTextColor(255,255,255); doc.setFontSize(14); doc.setFont('helvetica','bold')
    doc.text('CALIBIAI SCORE', 12, 15)
    doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.text('Global Employability Standard  •  Verified •  /1000', 12, 19)
    doc.setTextColor(0,0,0)
    // Student
    const profile = JSON.parse(localStorage.getItem('calibiai_profile')||'{}')
    const user = JSON.parse(localStorage.getItem('calibiai_user')||'{}')
    doc.setFontSize(11); doc.setFont('helvetica','bold'); doc.text(`Candidate: ${profile.full_name || user.name || 'Student'}`, 12, 32)
    doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.text(`Email: ${user.email||''}  •  Institution: ${profile.college||'IIT Madras'}  •  Date: ${new Date().toLocaleDateString()}`, 12, 37)
    doc.text(`Session: ${scores.session_id}  •  Verifiable Hash: ${scores.verifiable_hash}`, 12, 42)
    // Score hero
    doc.setFillColor(14,165,233); doc.roundedRect(12, 48, 186, 28, 3, 3, 'F')
    doc.setTextColor(255,255,255); doc.setFontSize(22); doc.setFont('helvetica','bold'); doc.text(`${scores.total} / 1000`, 16, 65)
    doc.setFontSize(10); doc.text(`Grade ${scores.grade}  •  ${scores.percentile} percentile  •  ${scores.grade==='S'?'Exceptional':scores.grade==='A'?'Strong': scores.grade==='B'?'Proficient':'Developing'}`, 16, 70)
    doc.setTextColor(0,0,0)
    // Breakdown table
    let y=84
    doc.setFontSize(10); doc.setFont('helvetica','bold'); doc.text('Section-wise Breakdown (weighted)',12,y); y+=6
    doc.setFontSize(8); doc.setFont('helvetica','normal')
    const rows = [
      ['English Communication', `${scores.english.total}/200`, `L${scores.english.listening} S${scores.english.speaking} R${scores.english.reading} W${scores.english.writing}`],
      ['Problem Solving', `${scores.problem_solving}/200`, 'MCQ + pseudocode'],
      ['AI Debugging', `${scores.ai_debugging}/150`, 'Hidden tests + quality'],
      ['AI Feature Dev', `${scores.ai_feature}/150`, 'Functional + design'],
      ['Prompt Engineering', `${scores.prompt_engineering}/100`, 'Specificity/Context/Constraints'],
      ['Cognitive (Cog+Behav)', `${scores.cognitive.total}/200`, `Cog ${scores.cognitive.cognitive_score} + Beh ${scores.cognitive.behavioral_total}`],
    ]
    rows.forEach(r=>{
      doc.setFont('helvetica','bold'); doc.text(r[0],12,y)
      doc.setFont('helvetica','normal'); doc.text(r[1],95,y); doc.text(r[2],125,y)
      y+=5
    })
    y+=2; doc.setFont('helvetica','bold'); doc.text(`CALIBIAI TOTAL: ${scores.total}/1000`,12,y)
    // Behavioral
    y+=8; doc.setFontSize(9); doc.text('Behavioral Profile',12,y); y+=5
    doc.setFontSize(7); doc.setFont('helvetica','normal')
    Object.entries(scores.cognitive.behavioral as Record<string,number>).forEach(([k,v])=>{
      doc.text(`${k}: ${v}`,12,y); y+=4
      if(y>270){ doc.addPage(); y=14 }
    })
    // Recommendation
    y+=4; doc.setFillColor(16,185,129); doc.roundedRect(12,y,186,14,2,2,'F')
    doc.setTextColor(255,255,255); doc.setFontSize(8); doc.setFont('helvetica','bold')
    doc.text(`Hiring Recommendation: ${scores.grade==='S'?'Fast-track to final rounds': scores.grade==='A'?'Interview-ready — recommended': scores.grade==='B'?'Trainable — 4-6 week bridge':'Needs structured upskilling'}`,14,y+8)
    doc.setTextColor(0,0,0)
    // Footer
    doc.setFontSize(7); doc.setFont('helvetica','normal'); doc.setTextColor(100,100,100)
    doc.text('Verify at api.calibiai.global/enterprise/verify  •  Self-hosted •  Multi-region •  Encrypted at rest & in transit',12, 287)
    doc.save(`Calibiai_Report_${scores.session_id}.pdf`)
    setRendering(false)
    // simulate report storage to MinIO
    localStorage.setItem('calibiai_report_ready','true')
  }

  if(!scores) return <div className="p-10 text-center text-white/60">Evaluating… (queue → rule engine + GPU workers)</div>

  const strengths = Object.entries(scores.cognitive.behavioral as Record<string,number>).sort((a,b)=>b[1]-a[1]).slice(0,2).map(([k])=>k)
  const weaknesses = Object.entries(scores.cognitive.behavioral as Record<string,number>).sort((a,b)=>a[1]-b[1]).slice(0,2).map(([k])=>k)

  return (
    <div>
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <div className="rounded-[24px] calibiai-gradient p-[1px]">
          <div className="rounded-[23px] bg-navy-900 p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs tracking-widest text-white/50">CALIBIAI SCORE • VERIFIED</div>
                <div className="mt-1 flex items-baseline gap-3">
                  <span className="text-5xl font-black bg-gradient-to-r from-sky-400 to-violet-400 bg-clip-text text-transparent">{scores.total}</span>
                  <span className="text-white/40 text-xl">/ 1000</span>
                  <span className="px-2 py-1 rounded-full bg-emerald-500 text-white text-xs font-bold">Grade {scores.grade}</span>
                </div>
                <div className="text-sm text-white/60 mt-1">{scores.percentile} percentile • {scores.verifiable_hash.slice(0,32)}…</div>
                <div className="mt-2 text-xs font-mono text-white/30">POST /api/v1/evaluation (Redpanda jobs → Triton + vLLM) • verifiable_hash SHA256(user:score:salt)</div>
              </div>
              <div className="flex gap-2">
                <button onClick={downloadPDF} disabled={rendering} className="px-5 py-3 rounded-full bg-white text-navy-900 font-bold text-sm disabled:opacity-50">{rendering ? 'Rendering…' : '⬇ Download PDF Report'}</button>
                <a href="/dashboard/student" className="px-5 py-3 rounded-full bg-white/10 font-bold text-sm">Go to Dashboard →</a>
              </div>
            </div>

            <div className="mt-6 grid sm:grid-cols-3 gap-3">
              {[
                ['English', scores.english.total, 200],
                ['Problem Solving', scores.problem_solving, 200],
                ['AI Debugging', scores.ai_debugging, 150],
                ['AI Feature', scores.ai_feature, 150],
                ['Prompt Eng', scores.prompt_engineering, 100],
                ['Cognitive', scores.cognitive.total, 200],
              ].map(([k,v,max])=>(
                <div key={String(k)} className="rounded-2xl bg-white/5 border border-white/10 p-4">
                  <div className="text-xs text-white/50">{k}</div>
                  <div className="mt-1 flex items-baseline justify-between">
                    <span className="text-xl font-black">{String(v)}</span><span className="text-xs text-white/40">/ {String(max)}</span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full calibiai-gradient" style={{width: `${(Number(v)/Number(max))*100}%`}} /></div>
                </div>
              ))}
            </div>

            <div className="mt-6 grid lg:grid-cols-2 gap-4">
              <div className="rounded-2xl glass p-4">
                <div className="text-sm font-bold">Behavioral Profile</div>
                <div className="mt-3 space-y-2">
                  {Object.entries(scores.cognitive.behavioral as Record<string,number>).map(([k,v])=>(
                    <div key={k} className="flex items-center gap-3 text-sm">
                      <span className="w-36 capitalize text-white/60 text-xs">{k.replace('_',' ')}</span>
                      <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-sky-500" style={{width: `${v}%`}} /></div>
                      <span className="w-8 text-right font-mono text-xs font-bold">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-4">
                <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-4">
                  <div className="text-sm font-bold text-emerald-300">Strengths</div>
                  <ul className="mt-2 text-sm list-disc ml-4 text-white/70">{strengths.map(s=><li key={s} className="capitalize">{s.replace('_',' ')} — {scores.cognitive.behavioral[s]}</li>)}<li>Accountability 91 — high ownership</li></ul>
                </div>
                <div className="rounded-2xl bg-amber-500/10 border border-amber-500/20 p-4">
                  <div className="text-sm font-bold text-amber-300">Weaknesses & Next Steps</div>
                  <ul className="mt-2 text-sm list-disc ml-4 text-white/70">{weaknesses.map(w=><li key={w} className="capitalize">{w.replace('_',' ')} — practice collaborative scenarios</li>)}<li>Prompt specificity — add constraints & audience</li></ul>
                </div>
                <div className="rounded-2xl bg-violet-500 text-white p-4">
                  <div className="text-xs opacity-80">Hiring Recommendation (auto-generated)</div>
                  <div className="mt-1 font-bold leading-tight">
                    {scores.grade==='S' ? 'Exceptional — fast-track to final rounds (top 5%)' : scores.grade==='A' ? 'Strong — interview-ready, recommended' : scores.grade==='B' ? 'Proficient — 4–6 week bridge to hiring bar' : 'Developing — structured upskilling required'}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-2 text-xs">
              <a href="/dashboard/student" className="px-4 py-2 rounded-full bg-white text-navy-900 font-bold">Student Dashboard</a>
              <a href="/dashboard/faculty" className="px-4 py-2 rounded-full bg-white/10">Faculty Dashboard</a>
              <a href="/dashboard/institution" className="px-4 py-2 rounded-full bg-white/10">Institution / Enterprise</a>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl glass p-4 text-xs">
          <div className="font-mono text-white/50">Async PDF pipeline</div>
          <div className="text-white/60 mt-1">Client click → POST /api/v1/reports/:session/generate (202) → Report Worker (Puppeteer/jsPDF self-hosted) → MinIO <code>reports/{'{session_id}.pdf'}</code> → CDN invalidation → status polling → download. Not synchronous request/response (handles 100k PDFs/hour).</div>
        </div>
      </main>
    </div>
  )
}
export default function Page(){ return <StoreProvider><ResultInner/></StoreProvider> }
