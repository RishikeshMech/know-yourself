'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Navbar } from '@/components/Navbar'
import { useStore } from '@/lib/store'
import { Stepper } from '@/components/Stepper'
import { WHATSAPP_COMMUNITY_URL } from '@/lib/community'
import { WhatsAppGlyph } from '@/components/WhatsAppCommunity'
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
        body: JSON.stringify({ user_id: user?.id, action: 'join_whatsapp', completed: true }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || data.saved !== true) throw new Error(data.error || 'Your progress was not confirmed as saved. Please retry.')
      setTracking({...tracking, whatsapp:true})
      router.replace('/tracking/linkedin')
    } catch (error: any) {
      setSaveError(error?.message || 'Could not save your progress. Please retry.')
      setSaving(false)
    }
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
              <div className="font-bold text-slate-800">CalibiAI Students</div>
              <div className="text-slate-500 text-xs">Placement updates, tips & jobs</div>
            </div>
          </div>

          <div className="mt-7 flex justify-center gap-3">
            <a href={WHATSAPP_COMMUNITY_URL} target="_blank" rel="noreferrer" onClick={(event) => { event.preventDefault(); window.open(WHATSAPP_COMMUNITY_URL, '_blank', 'noopener,noreferrer'); void complete() }} className="btn-primary !bg-none bg-emerald-500 !shadow-emerald-300/50 hover:bg-emerald-600 inline-flex items-center gap-2"><WhatsAppGlyph className="h-4 w-4" /> Join WhatsApp →</a>
            <button onClick={complete} disabled={saving} className="btn-soft disabled:opacity-50">{saving ? 'Saving…' : "I've joined ✓"}</button>
          </div>
          <button onClick={()=>router.replace('/tracking/linkedin')} className="mt-4 text-xs font-semibold text-slate-400 hover:text-slate-600">Skip for now</button>
          {saveError && <div role="alert" className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">⚠ {saveError}</div>}
          {tracking.whatsapp && <div className="mt-4 text-xs text-emerald-600 font-semibold animate-pop">✓ Done</div>}
        </div>
      </main>
    </div>
  )
}
export default function Page(){ return <Inner/> }
