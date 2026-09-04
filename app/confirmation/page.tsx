'use client'
import { Navbar } from '@/components/Navbar'
import { StoreProvider, useStore } from '@/lib/store'
import { Stepper } from '@/components/Stepper'

function Inner(){
  const {profile, resume, tracking} = useStore()
  const ready = profile && resume && tracking.whatsapp && tracking.linkedin
  return (
    <div>
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        <Stepper step={6} />
        <div className="mt-6 rounded-[24px] glass p-6 sm:p-8">
          <h1 className="text-xl font-black">Confirmation</h1>
          <p className="text-sm text-white/60">Review before assessment. All actions audit-logged.</p>
          <div className="mt-6 space-y-3 text-sm">
            <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10"><span>Profile</span><span className={profile?'text-emerald-400':'text-amber-300'}>{profile?'✓ Complete':'✗ Missing'}</span></div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10"><span>Resume Analysis</span><span className={resume?'text-emerald-400':'text-amber-300'}>{resume?`✓ ${resume.resume_score}/100`:'✗ Upload required'}</span></div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10"><span>Join WhatsApp</span><span className={tracking.whatsapp?'text-emerald-400':'text-amber-300'}>{tracking.whatsapp?'✓ Tracked':'✗ Pending'}</span></div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10"><span>Follow LinkedIn</span><span className={tracking.linkedin?'text-emerald-400':'text-amber-300'}>{tracking.linkedin?'✓ Tracked':'✗ Pending'}</span></div>
          </div>
          <label className="mt-6 flex gap-2 text-xs text-white/70"><input type="checkbox" defaultChecked /> I confirm details are accurate and agree to 120-min assessment terms (tab-switch monitored, timer server-controlled).</label>
          <div className="mt-6 flex gap-3">
            <button onClick={()=>window.location.href='/instructions'} className={`px-6 py-3 rounded-full font-bold text-sm ${ready?'calibiai-gradient text-white':'bg-white/10 text-white/40 cursor-not-allowed'}`} disabled={!ready}>Proceed to Instructions →</button>
            {!ready && <span className="text-xs text-amber-300 self-center">Complete all steps to continue</span>}
          </div>
          <div className="mt-2 text-xs text-white/30">You can still proceed — demo allows, but prod enforces all tracking completed.</div>
          <button onClick={()=>window.location.href='/instructions'} className="mt-2 text-xs text-sky-400">Continue anyway →</button>
        </div>
      </main>
    </div>
  )
}
export default function Page(){ return <StoreProvider><Inner/></StoreProvider> }
