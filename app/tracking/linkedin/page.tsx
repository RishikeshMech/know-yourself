'use client'
import { Navbar } from '@/components/Navbar'
import { StoreProvider, useStore } from '@/lib/store'
import { Stepper } from '@/components/Stepper'

function Inner(){
  const {tracking,setTracking,user} = useStore()
  const complete = async ()=>{
    setTracking({...tracking, linkedin:true})
    try {
      await fetch('/api/user/tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user?.id, action: 'follow_linkedin', completed: true }),
      })
    } catch { /* demo mode */ }
    setTimeout(()=> window.location.href='/confirmation', 450)
  }
  return (
    <div>
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <Stepper step={5} />
        <div className="mt-6 glass-card text-center animate-fade-up">
          <div className="w-16 h-16 rounded-2xl bg-sky-600 mx-auto flex items-center justify-center text-2xl font-black text-white shadow-lg shadow-sky-200">in</div>
          <h1 className="mt-4 text-2xl font-black text-slate-900">Showcase your score on LinkedIn</h1>
          <p className="text-slate-500 mt-2 text-sm max-w-md mx-auto">Follow Calibiai and share your verified score as a credential employers can check.</p>

          <div className="mt-6 panel p-4 flex items-center gap-4 text-left max-w-md mx-auto">
            <div className="w-12 h-12 rounded-2xl bg-sky-600 flex items-center justify-center text-white font-black shrink-0">C</div>
            <div className="text-sm">
              <div className="font-bold text-slate-800">Calibiai — Employability Standard</div>
              <div className="text-slate-500 text-xs">Follow for hiring partner updates</div>
            </div>
          </div>

          <div className="mt-7 flex justify-center gap-3">
            <a href="https://linkedin.com/company/calibiai" target="_blank" rel="noreferrer" onClick={complete} className="btn-primary !bg-none bg-sky-600 !shadow-sky-300/50 hover:bg-sky-700">Follow on LinkedIn →</a>
            <button onClick={complete} className="btn-soft">I followed ✓</button>
          </div>
          <button onClick={()=>window.location.href='/confirmation'} className="mt-4 text-xs font-semibold text-slate-400 hover:text-slate-600">Continue →</button>
          {tracking.linkedin && <div className="mt-4 text-xs text-emerald-600 font-semibold animate-pop">✓ Done</div>}
        </div>
      </main>
    </div>
  )
}
export default function Page(){ return <StoreProvider><Inner/></StoreProvider> }
