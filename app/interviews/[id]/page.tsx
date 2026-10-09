'use client'
import { authenticatedFetch } from '@/lib/clientAuth'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { Navbar } from '@/components/Navbar'
import { ConsentAndDeviceCheck } from '@/components/interview/ConsentAndDeviceCheck.tsx'
import { LiveInterview } from '@/components/interview/LiveInterview.tsx'
import Link from 'next/link'

export default function InterviewLivePage({ params }: { params: { id: string } }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<any>(null)
  const [currentQuestion, setCurrentQuestion] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchSession = async () => {
    setLoading(true)
    try {
      const res = await authenticatedFetch(`/api/interviews/${params.id}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load session')
      setSession(data.session)
      setCurrentQuestion(data.current_question)
    } catch (e: any) {
      setError(e?.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchSession() }, [params.id])

  if (loading) {
    return (
      <div>
        <Navbar />
        <main className="max-w-5xl mx-auto p-8">
          <div className="glass-card animate-pulse h-96" />
        </main>
      </div>
    )
  }

  if (error) {
    return (
      <div>
        <Navbar />
        <main className="max-w-3xl mx-auto p-8">
          <div className="glass-card text-center py-12">
            <div className="text-rose-600 font-bold">{error}</div>
            <Link href="/interviews" className="btn-primary mt-4 inline-flex">Back to interviews →</Link>
          </div>
        </main>
      </div>
    )
  }

  if (!session) return null

  if (['REPORT_READY'].includes(session.state)) {
    return (
      <div>
        <Navbar />
        <main className="max-w-3xl mx-auto p-8">
          <div className="glass-card text-center py-12">
            <div className="text-4xl">📊</div>
            <div className="mt-2 text-sm font-bold">Interview completed — report ready</div>
            <Link href={`/interviews/${session.id}/report`} className="btn-primary mt-4 inline-flex">View report →</Link>
          </div>
        </main>
      </div>
    )
  }

  if (['SCHEDULED', 'CREATED'].includes(session.state)) {
    return (
      <div>
        <Navbar />
        <main className="py-6">
          <ConsentAndDeviceCheck
            onComplete={async ({ consent, device }) => {
              try {
                const res = await authenticatedFetch(`/api/interviews/${session.id}/consent`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ ...consent, device_check: device }),
                })
                const data = await res.json()
                if (!res.ok) throw new Error(data.error)
                setSession(data.session)
                // Fetch current question again
                const sessRes = await authenticatedFetch(`/api/interviews/${session.id}`)
                const sessData = await sessRes.json()
                setCurrentQuestion(sessData.current_question)
              } catch (e: any) {
                alert('Consent failed: ' + (e?.message || e))
              }
            }}
          />
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#eef1fb]">
      <Navbar />
      <main className="py-4">
        <LiveInterview sessionId={session.id} initialSession={session} initialQuestion={currentQuestion} />
      </main>
    </div>
  )
}
