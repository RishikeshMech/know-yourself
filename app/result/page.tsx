'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { StoreProvider } from '@/lib/store'
import { ScoreReport } from '@/components/ScoreReport'

/**
 * One-time assessment flow: the report is shown
 *   1. right after a fresh submission (the assessment page sets
 *      `calibiai_just_submitted`), or
 *   2. when opened deliberately via "View full report" (dashboard / profile
 *      set the same ticket on click).
 * Any other visit — most importantly the browser BACK button from the
 * dashboard — is redirected to the profile page, where the report link
 * stays available. The ticket is single-use.
 */
function ResultInner() {
  const [scores, setScores] = useState<any>(null)

  useEffect(() => {
    let fresh = false
    try {
      const ts = Number(localStorage.getItem('calibiai_just_submitted') || 0)
      if (ts && Date.now() - ts < 10 * 60 * 1000) {
        fresh = true
        localStorage.removeItem('calibiai_just_submitted')
      }
    } catch { }
    const s = localStorage.getItem('calibiai_scores')
    if (!s || !fresh) { window.location.replace('/profile'); return }
    try { setScores(JSON.parse(s)) } catch { window.location.replace('/profile') }
  }, [])

  if (!scores) return (
    <div className="min-h-screen flex items-center justify-center text-slate-500">
      <div className="flex items-center gap-3 glass-card"><div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /> Evaluating your answers…</div>
    </div>
  )

  return <ScoreReport scores={scores} />
}

export default function Page() {
  return <StoreProvider><ResultInner /></StoreProvider>
}
