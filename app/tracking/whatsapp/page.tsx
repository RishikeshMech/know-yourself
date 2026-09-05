'use client'
import { Navbar } from '@/components/Navbar'
import { StoreProvider, useStore } from '@/lib/store'
import { Stepper } from '@/components/Stepper'

function Inner(){
  const {tracking,setTracking} = useStore()
  const complete = ()=>{
    const nt={...tracking, whatsapp:true}
    setTracking(nt)
    // audit log
    setTimeout(()=> window.location.href='/tracking/linkedin', 400)
  }
  return (
    <div>
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        <Stepper step={4} />
        <div className="mt-6 rounded-[24px] glass p-6 sm:p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500 mx-auto flex items-center justify-center text-2xl">💬</div>
          <h1 className="mt-4 text-xl font-black">Join WhatsApp Community</h1>
          <p className="text-sm text-white/60 mt-1">Get assessment updates, placement alerts, and peer learning. Tracking is internal (audit logged, no external dependency).</p>
          <div className="mt-6 rounded-2xl bg-white text-navy-900 p-4 flex items-center gap-4 text-left max-w-md mx-auto">
            <div className="w-12 h-12 rounded-xl bg-emerald-500 flex items-center justify-center text-white font-black">WA</div>
            <div className="text-sm"><div className="font-bold">Calibiai Students — Global</div><div className="text-black/60">~124k members • Updates & jobs</div></div>
          </div>
          <div className="mt-6 flex justify-center gap-3">
            <a href="https://whatsapp.com" target="_blank" onClick={complete} className="px-6 py-3 rounded-full bg-emerald-500 text-white font-bold text-sm">Join WhatsApp →</a>
            <button onClick={complete} className="px-6 py-3 rounded-full bg-white/10 text-sm font-semibold">I have joined ✓</button>
          </div>
          <div className="mt-3 text-xs text-white/40">Clicking marks POST /api/v1/tracking/complete {'{join_whatsapp}'} • idempotent</div>
          <div className="mt-4">
            <button onClick={()=>window.location.href='/tracking/linkedin'} className="text-xs text-sky-400">Skip for now → (not recommended)</button>
          </div>
          {tracking.whatsapp && <div className="mt-4 text-xs text-emerald-400">✓ Tracked — audit_log entry created</div>}
        </div>
      </main>
    </div>
  )
}
export default function Page(){ return <StoreProvider><Inner/></StoreProvider> }
