'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Navbar } from '@/components/Navbar'
import { useStore } from '@/lib/store'
import { Stepper } from '@/components/Stepper'
import { authenticatedFetch } from '@/lib/clientAuth'

function Inner(){
  const router = useRouter()
  const {tracking,setTracking,user} = useStore()
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const complete = async ()=>{
    if (saving) return
    setSaving(true)
    setSaveError('')
    try {
      const response = await authenticatedFetch('/api/user/tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user?.id, action: 'follow_linkedin', completed: true }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || data.saved !== true) throw new Error(data.error || 'Your progress was not confirmed as saved. Please retry.')
      setTracking({...tracking, linkedin:true})
      router.replace('/confirmation')
    } catch (error: any) {
      setSaveError(error?.message || 'Could not save your progress. Please retry.')
      setSaving(false)
    }
  }
  return (
    <div>
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <Stepper step={5} />
        <div className="mt-6 glass-card text-center animate-fade-up">
          <div className="w-16 h-16 rounded-2xl bg-sky-600 mx-auto flex items-center justify-center text-2xl font-black text-white shadow-lg shadow-sky-200">in</div>
          <h1 className="mt-4 text-2xl font-black text-slate-900">Showcase your score on LinkedIn</h1>
          <p className="text-slate-500 mt-2 text-sm max-w-md mx-auto">Follow CalibiAI and share your verified score as a credential employers can check.</p>

          <div className="mt-6 panel p-4 flex items-center gap-4 text-left max-w-md mx-auto">
            <div className="w-12 h-12 rounded-2xl bg-sky-600 flex items-center justify-center text-white font-black shrink-0">C</div>
            <div className="text-sm">
              <div className="font-bold text-slate-800">CalibiAI — Employability Standard</div>
              <div className="text-slate-500 text-xs">Follow for hiring partner updates</div>
            </div>
          </div>

          <div className="mt-7 flex justify-center gap-3">
            <a href="https://www.linkedin.com/company/calibiai-academy" target="_blank" rel="noreferrer" onClick={(event) => { event.preventDefault(); window.open('https://www.linkedin.com/company/calibiai-academy', '_blank', 'noopener,noreferrer'); void complete() }} className="btn-primary !bg-none bg-sky-600 !shadow-sky-300/50 hover:bg-sky-700">Follow on LinkedIn →</a>
            <button onClick={complete} disabled={saving} className="btn-soft disabled:opacity-50">{saving ? 'Saving…' : 'I followed ✓'}</button>
          </div>
          <button onClick={()=>router.replace('/confirmation')} className="mt-4 text-xs font-semibold text-slate-400 hover:text-slate-600">Continue →</button>
          {saveError && <div role="alert" className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">⚠ {saveError}</div>}
          {tracking.linkedin && <div className="mt-4 text-xs text-emerald-600 font-semibold animate-pop">✓ Done</div>}
        </div>
      </main>
    </div>
  )
}
export default function Page(){ return <Inner/> }
