'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { StoreProvider } from '@/lib/store'
import { ScoreReport } from '@/components/ScoreReport'

function ResultInner() {
  const [scores, setScores] = useState<any>(null)

  useEffect(() => {
    const s = localStorage.getItem('calibiai_scores')
    if (s) setScores(JSON.parse(s))
    else window.location.href = '/assessment'
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
