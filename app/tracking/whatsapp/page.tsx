'use client'
import { Navbar } from '@/components/Navbar'
import { StoreProvider, useStore } from '@/lib/store'
import { Stepper } from '@/components/Stepper'

function Inner(){
  const {tracking,setTracking} = useStore()
  const complete = ()=>{
    setTracking({...tracking, whatsapp:true})
    setTimeout(()=> window.location.href='/tracking/linkedin', 450)
  }
  return (
    <div>
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <Stepper step={4} />
        <div className="mt-6 glass-card text-center animate-fade-up">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500 mx-auto flex items-center justify-center text-3xl shadow-lg shadow-emerald-200">💬</div>
          <h1 className="mt-4 text-2xl font-black text-slate-900">Join our student community</h1>
          <p className="text-slate-500 mt-2 text-sm max-w-md mx-auto">Get assessment tips, placement alerts and study with peers — all on WhatsApp. Optional but recommended.</p>

          <div className="mt-6 panel p-4 flex items-center gap-4 text-left max-w-md mx-auto">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500 flex items-center justify-center text-white font-black shrink-0">WA</div>
            <div className="text-sm">
              <div className="font-bold text-slate-800">Calibiai Students</div>
              <div className="text-slate-500 text-xs">Placement updates, tips & jobs</div>
            </div>
          </div>

          <div className="mt-7 flex justify-center gap-3">
            <a href="https://whatsapp.com" target="_blank" rel="noreferrer" onClick={complete} className="btn-primary !bg-none bg-emerald-500 !shadow-emerald-300/50 hover:bg-emerald-600">Join WhatsApp →</a>
            <button onClick={complete} className="btn-soft">I've joined ✓</button>
          </div>
          <button onClick={()=>window.location.href='/tracking/linkedin'} className="mt-4 text-xs font-semibold text-slate-400 hover:text-slate-600">Skip for now</button>
          {tracking.whatsapp && <div className="mt-4 text-xs text-emerald-600 font-semibold animate-pop">✓ Done</div>}
        </div>
      </main>
    </div>
  )
}
export default function Page(){ return <StoreProvider><Inner/></StoreProvider> }
