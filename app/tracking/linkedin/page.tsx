'use client'
import { Navbar } from '@/components/Navbar'
import { StoreProvider, useStore } from '@/lib/store'
import { Stepper } from '@/components/Stepper'

function Inner(){
  const {tracking,setTracking} = useStore()
  const complete = ()=>{
    const nt={...tracking, linkedin:true}
    setTracking(nt)
    setTimeout(()=> window.location.href='/confirmation', 400)
  }
  return (
    <div>
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        <Stepper step={5} />
        <div className="mt-6 rounded-[24px] glass p-6 sm:p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-sky-600 mx-auto flex items-center justify-center text-xl font-black text-white">in</div>
          <h1 className="mt-4 text-xl font-black">Follow on LinkedIn</h1>
          <p className="text-sm text-white/60 mt-1">Stay verified • showcase your Calibiai Score as a portable credential. Tracking internal.</p>
          <div className="mt-6 rounded-2xl bg-white text-navy-900 p-4 flex items-center gap-4 text-left max-w-md mx-auto">
            <div className="w-12 h-12 rounded-xl bg-sky-600 flex items-center justify-center text-white font-black">C</div>
            <div className="text-sm"><div className="font-bold">Calibiai — Global Employability Standard</div><div className="text-black/60">Follow for hiring partner updates</div></div>
          </div>
          <div className="mt-6 flex justify-center gap-3">
            <a href="https://linkedin.com/company/calibiai" target="_blank" onClick={complete} className="px-6 py-3 rounded-full bg-sky-600 text-white font-bold text-sm">Follow on LinkedIn →</a>
            <button onClick={complete} className="px-6 py-3 rounded-full bg-white/10 text-sm font-semibold">I followed ✓</button>
          </div>
          <div className="mt-3 text-xs text-white/40">POST /api/v1/tracking/complete {'{follow_linkedin}'}</div>
          <div className="mt-4">
            <button onClick={()=>window.location.href='/confirmation'} className="text-xs text-sky-400">Continue →</button>
          </div>
          {tracking.linkedin && <div className="mt-4 text-xs text-emerald-400">✓ Tracked</div>}
        </div>
      </main>
    </div>
  )
}
export default function Page(){ return <StoreProvider><Inner/></StoreProvider> }
