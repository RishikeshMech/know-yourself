'use client'
import { Navbar } from '@/components/Navbar'
import { StoreProvider, useStore } from '@/lib/store'
import { Stepper } from '@/components/Stepper'

function Inner(){
  const {profile, resume, tracking} = useStore()
  const items = [
    {label:'Your profile', done: !!profile, detail: profile?.full_name || 'Not filled'},
    {label:'Resume analysis', done: !!resume, detail: resume ? `${resume.resume_score}/100` : 'Not uploaded'},
    {label:'WhatsApp community', done: tracking.whatsapp, detail: tracking.whatsapp ? 'Joined' : 'Skipped'},
    {label:'LinkedIn', done: tracking.linkedin, detail: tracking.linkedin ? 'Followed' : 'Skipped'},
  ]
  const ready = !!profile && !!resume
  return (
    <div>
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <Stepper step={6} />
        <div className="mt-6 glass-card animate-fade-up">
          <h1 className="text-2xl font-black text-slate-900">You're all set</h1>
          <p className="text-sm text-slate-500 mt-1">A quick check before you begin the assessment.</p>

          <div className="mt-6 space-y-2.5">
            {items.map(it=>(
              <div key={it.label} className={`flex items-center justify-between p-4 rounded-2xl border ${it.done ? 'bg-emerald-50/70 border-emerald-200' : 'bg-slate-50/70 border-slate-200'}`}>
                <span className="text-sm font-semibold text-slate-700">{it.label}</span>
                <span className={`text-sm font-bold flex items-center gap-1.5 ${it.done ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {it.done ? <><span className="w-5 h-5 rounded-full bg-emerald-500 text-white text-xs flex items-center justify-center">✓</span> {it.detail}</> : <>○ {it.detail}</>}
                </span>
              </div>
            ))}
          </div>

          <label className="mt-6 flex gap-2 text-xs text-slate-500">
            <input type="checkbox" defaultChecked className="accent-indigo-600 mt-0.5" />
            I confirm my details are accurate and agree to the 120-minute assessment (focus is monitored to keep results fair).
          </label>

          <button onClick={()=>window.location.href='/instructions'} className="btn-primary mt-6 w-full sm:w-auto">
            Continue to instructions →
          </button>
        </div>
      </main>
    </div>
  )
}
export default function Page(){ return <StoreProvider><Inner/></StoreProvider> }
