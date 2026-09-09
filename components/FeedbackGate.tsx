'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FEEDBACK_PENDING_KEY } from '@/lib/feedback'

/** Keep a pending post-assessment step across refreshes and direct report visits. */
export function FeedbackGate({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (localStorage.getItem(FEEDBACK_PENDING_KEY)) router.replace('/feedback')
    else setReady(true)
  }, [router])
  return ready ? children : <div role="status" className="min-h-screen grid place-items-center text-sm text-slate-500">Loading your next step…</div>
}
