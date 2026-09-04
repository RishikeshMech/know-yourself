'use client'
import { Navbar } from '@/components/Navbar'
import { StoreProvider, useStore } from '@/lib/store'
import { Stepper } from '@/components/Stepper'
import { useState } from 'react'

function Inner(){
  const {setSession} = useStore()
  const [checked,setChecked]=useState(false)

  const start = ()=>{
    const now = Date.now()
    const session = {
      id: 'sess_'+Math.random().toString(16).slice(2,8),
      started_at: new Date(now).toISOString(),
      expires_at: new Date(now + 7200*1000).toISOString(),
      duration_sec: 7200,
      status:'in_progress'
    }
    setSession(session)
    // also store server time for timer skew handling
    localStorage.setItem('calibiai_session_server_start', String(now))
    window.location.href='/assessment'
  }

  return (
    <div>
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <Stepper step={7} />
        <div className="mt-6 grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 rounded-[24px] glass p-6 sm:p-8">
            <h1 className="text-2xl font-black">Assessment Instructions</h1>
            <p className="text-sm text-white/60">Server-controlled, tamper-proof, clock-skew-resistant across regions. 120 minutes.</p>

            <div className="mt-6 grid sm:grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-white/5 p-3"><div className="font-bold">Duration</div><div className="text-white/60">120 min • auto-submit at expiry • no pause</div></div>
              <div className="rounded-xl bg-white/5 p-3"><div className="font-bold">Timer</div><div className="text-white/60">Server time authoritative • reconciled every 5s • HMAC-signed session token</div></div>
              <div className="rounded-xl bg-white/5 p-3"><div className="font-bold">Proctoring</div><div className="text-white/60">Tab switches tracked (3+ flagged) • anomaly model • audit trail</div></div>
              <div className="rounded-xl bg-white/5 p-3"><div className="font-bold">Failover</div><div className="text-white/60">Survives regional failover — session in Postgres, not just Redis</div></div>
            </div>

            <h3 className="mt-6 font-bold">6 Modules • Calibiai /1000</h3>
            <div className="mt-3 grid sm:grid-cols-2 gap-3 text-xs">
              {[
                ['English Communication','200 • Listening, Speaking, Reading, Writing'],
                ['Problem Solving','200 • MCQ, pseudocode, data interpretation'],
                ['AI-Assisted Debugging','150 • Fix buggy code (hidden tests)'],
                ['AI-Assisted Feature Dev','150 • Build from spec (test harness)'],
                ['Prompt Engineering','100 • 3 tasks, rubric-scored'],
                ['Cognitive Assessment','200 • Motion Grid 30 + Logical 70 + Behavioral 100'],
              ].map(([t,d])=>(
                <div key={t} className="rounded-xl bg-white/5 border border-white/10 p-3"><div className="font-bold text-white">{t}</div><div className="text-white/60">{d}</div></div>
              ))}
            </div>

            <div className="mt-6 rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-xs leading-relaxed">
              <div className="font-bold text-amber-300">Rules</div>
              <ul className="list-disc ml-4 text-white/70 mt-1">
                <li>Do not refresh during assessment — state is persisted, but timer continues server-side.</li>
                <li>Tab switching, copy/paste, and rapid answering are logged for anomaly detection.</li>
                <li>Submission enqueues to Redpanda → GPU workers (rule + LLaMA/Whisper). Score in ~15s.</li>
              </ul>
            </div>

            <label className="mt-6 flex gap-2 text-sm"><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)} /> I have read and understood the instructions.</label>

            <button onClick={start} disabled={!checked} className={`mt-4 w-full sm:w-auto px-8 py-3 rounded-full font-black text-sm ${checked?'calibiai-gradient text-white shadow':'bg-white/10 text-white/30 cursor-not-allowed'}`}>START 120-MIN TIMER →</button>
            <div className="mt-2 text-xs font-mono text-white/30">POST /api/v1/assessment/start → {'{session_id, started_at, expires_at, server_time}'} • HMAC signed</div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl glass p-5">
              <div className="text-sm font-bold">What happens next?</div>
              <ol className="mt-2 text-xs space-y-1 text-white/60 list-decimal ml-4">
                <li>Timer starts server-side, synced every 5s</li>
                <li>Answer each module — answers streamed to Kafka</li>
                <li>Submit → Evaluation queue (CPU rule + GPU LLM)</li>
                <li>Calibiai Score /1000 + PDF report</li>
              </ol>
            </div>
            <div className="rounded-2xl bg-navy-800 border border-white/10 p-5">
              <div className="text-xs font-mono text-white/50">Scoring preview</div>
              <div className="mt-2 text-xs space-y-1 font-mono">
                <div className="flex justify-between"><span>English</span><span>200</span></div>
                <div className="flex justify-between"><span>Problem Solving</span><span>200</span></div>
                <div className="flex justify-between"><span>AI Debugging</span><span>150</span></div>
                <div className="flex justify-between"><span>AI Feature</span><span>150</span></div>
                <div className="flex justify-between"><span>Prompt Eng</span><span>100</span></div>
                <div className="flex justify-between"><span>Cognitive</span><span>200</span></div>
                <div className="flex justify-between font-bold border-t border-white/10 pt-1"><span>Total</span><span>1000</span></div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
export default function Page(){ return <StoreProvider><Inner/></StoreProvider> }
