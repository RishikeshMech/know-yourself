'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { Navbar } from '@/components/Navbar'
import { StoreProvider, useStore } from '@/lib/store'
import { isProfileComplete } from '@/lib/validate'

function Inner(){
  const [scores,setScores]=useState<any>(null)
  const [profile,setProfile]=useState<any>(null)
  const [resume,setResume]=useState<any>(null)
  const { user, hydrated } = useStore()
  // Protect the student dashboard: a signed-out visitor is sent to /login.
  // Render nothing until the session is known so the page never flashes.
  useEffect(()=>{
    if (hydrated && !user) window.location.replace('/login')
  },[hydrated, user])
  if (!hydrated) return null
  if (!user) return null
  const onboarded = isProfileComplete(profile)
  // The right place to continue: finish onboarding if we never did, otherwise
  // jump to the assessment instructions (which start/create the session). This
  // never sends a signed-in user back to /login.
  const startHref = onboarded ? '/instructions' : '/onboarding'
  useEffect(()=>{
    const s=localStorage.getItem('calibiai_scores'); if(s) setScores(JSON.parse(s))
    const p=localStorage.getItem('calibiai_profile'); if(p) setProfile(JSON.parse(p))
    const r=localStorage.getItem('calibiai_resume'); if(r) setResume(JSON.parse(r))
    // Load from DB if user is logged in
    if(user?.id){
      fetch('/api/user/profile?user_id='+user.id).then(r=>r.json()).then(data=>{
        if(data.profile) setProfile(data.profile)
      }).catch(()=>{})
      fetch('/api/user/resume?student_id='+user.id).then(r=>r.json()).then(data=>{
        if(data.analysis) setResume(data.analysis)
      }).catch(()=>{})
      fetch('/api/user/scores?student_id='+user.id).then(r=>r.json()).then(data=>{
        if(data.result) {
          const payload = {
            session_id: data.result.session_id,
            ...data.result.scores,
            total: data.result.total,
            grade: data.result.grade,
            percentile: data.result.percentile,
            verifiable_hash: data.result.verifiable_hash,
            cognitive: data.result.scores?.cognitive,
            english: data.result.scores?.english,
            detail: data.result.scores?.detail,
          }
          setScores(payload)
          localStorage.setItem('calibiai_scores', JSON.stringify(payload))
        }
      }).catch(()=>{})
      fetch('/api/user/tracking?user_id='+user.id).then(r=>r.json()).then(data=>{
        if(data.tracking) {
          const tracking = { whatsapp: false, linkedin: false }
          data.tracking.forEach((e:any) => {
            if(e.action === 'join_whatsapp') tracking.whatsapp = e.completed
            if(e.action === 'follow_linkedin') tracking.linkedin = e.completed
          })
          // Could update store tracking here if needed
        }
      }).catch(()=>{})
    }
  },[user])

  return (
    <div>
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="animate-fade-up">
          <h1 className="text-2xl font-black text-slate-900">Hello{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''} 👋</h1>
          <p className="text-slate-500 text-sm mt-1">Here's your readiness overview and next steps.</p>
        </div>

        <div className="mt-6 grid lg:grid-cols-3 gap-6">
          {/* Score */}
          <div className="lg:col-span-2 glass-card animate-fade-up" style={{animationDelay:'.05s'}}>
            <div className="text-sm font-bold text-slate-700">Latest CalibiAI Score</div>
            {scores ? (
              <div className="mt-4">
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="text-5xl font-black text-gradient">{scores.total}</span>
                  <span className="text-slate-400 font-bold">/1000</span>
                  <span className="chip text-indigo-700 border-indigo-200 bg-indigo-50/70">Grade {scores.grade} · {scores.percentile}th percentile</span>
                </div>
                <div className="mt-5 grid sm:grid-cols-2 gap-2.5">
                  {[
                    ['English', scores.english.total, 200],['Problem Solving', scores.problem_solving, 200],
                    ['AI Debugging', scores.ai_debugging, 150],['AI Feature Dev', scores.ai_feature, 150],
                    ['Prompt Eng', scores.prompt_engineering, 100],['Cognitive', scores.cognitive.total, 200],
                  ].map(([k,v,m])=>(
                    <div key={k as string} className="panel p-3">
                      <div className="flex justify-between text-xs mb-1"><span className="text-slate-600 font-medium">{k}</span><span className="font-mono font-bold text-slate-700">{v}/{m}</span></div>
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full calibiai-gradient rounded-full" style={{width:`${(v as number)/(m as number)*100}%`}}/></div>
                    </div>
                  ))}
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                  <a href="/result" className="btn-primary !py-2.5 text-xs">View full report</a>
                  <button onClick={()=>window.print()} className="btn-soft !py-2.5 text-xs">⬇ Download PDF</button>
                </div>
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/40 p-8 text-center">
                <div className="text-4xl">🎯</div>
                <p className="mt-2 text-sm text-slate-500">You haven't taken the assessment yet.</p>
                <a href={startHref} className="btn-primary mt-4 inline-flex">Start your assessment →</a>
              </div>
            )}
          </div>

          {/* Side */}
          <div className="space-y-5">
            <div className="glass-card !p-5 animate-fade-up" style={{animationDelay:'.1s'}}>
              <div className="text-sm font-bold text-slate-700">Resume score</div>
              {resume ? (
                <div className="mt-3">
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 rounded-full border-4 border-indigo-500 flex items-center justify-center font-black text-indigo-600">{resume.resume_score}</div>
                    <div className="text-xs text-slate-500">out of 100</div>
                  </div>
                  <div className="mt-3 text-xs font-bold text-emerald-600">Strengths</div>
                  <ul className="list-disc ml-4 text-xs text-slate-600">{resume.feedback.strengths.slice(0,2).map((s:string)=><li key={s}>{s}</li>)}</ul>
                  <a href="/resume" className="mt-3 inline-block text-xs font-semibold text-indigo-600">Update resume →</a>
                </div>
              ) : <p className="text-xs text-slate-400 mt-2">No resume uploaded yet. <a href="/resume" className="text-indigo-600 font-semibold">Upload →</a></p>}
            </div>

            <div className="rounded-3xl calibiai-gradient p-5 text-white shadow-xl shadow-indigo-200 animate-fade-up" style={{animationDelay:'.15s'}}>
              <div className="text-sm font-bold">Recommended next steps</div>
              <ul className="mt-2 text-xs space-y-1.5 opacity-95 list-disc ml-4">
                {scores?.cognitive?.behavioral ? <li>Strengthen your lower-scoring behavioural traits with team exercises</li> : <li>Take the 120-minute assessment to unlock your score</li>}
                <li>Practice prompt engineering with 3 daily drills</li>
                <li>Add quantified impact to your resume projects</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Profile strip */}
        {profile && (
          <div className="glass-card !p-5 mt-6 animate-fade-up" style={{animationDelay:'.2s'}}>
            <div className="text-sm font-bold text-slate-700">Your profile</div>
            <div className="mt-2 text-sm text-slate-600 grid sm:grid-cols-3 gap-2">
              <div>👤 {profile.full_name || '—'}</div>
              <div>🎓 {profile.college || '—'}</div>
              <div>🛠 {profile.skills || '—'}</div>
            </div>
            <a href="/profile" className="mt-3 inline-block text-xs font-semibold text-indigo-600">Edit profile →</a>
          </div>
        )}
      </main>
    </div>
  )
}
export default function Page(){ return <StoreProvider><Inner/></StoreProvider> }
