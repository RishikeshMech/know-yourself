'use client'
export const dynamic = 'force-dynamic'
import { Navbar } from '@/components/Navbar'
import { ScheduleInterviewTab } from '@/components/interview/ScheduleInterviewTab.tsx'
import { useStore } from '@/lib/store'
import Link from 'next/link'

export default function SchedulePage() {
  const { user, hydrated } = useStore()

  if (!hydrated) return <div className="p-8">Loading…</div>
  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Link href="/login" className="btn-primary">Sign in to schedule interview</Link>
      </div>
    )
  }

  return (
    <div>
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Link href="/dashboard/student" className="hover:text-indigo-600">Dashboard</Link>
          <span>›</span>
          <Link href="/interviews" className="hover:text-indigo-600">AI Interviews</Link>
          <span>›</span>
          <span className="text-slate-800 font-semibold">Schedule</span>
        </div>
        <h1 className="mt-4 text-2xl font-black text-slate-900">Schedule AI Mock Interview</h1>
        <p className="mt-1 text-sm text-slate-500">3 attempts max · Standard 35 min recommended · Real-time voice + camera simulation</p>
        <div className="mt-6">
          <ScheduleInterviewTab />
        </div>
      </main>
    </div>
  )
}
