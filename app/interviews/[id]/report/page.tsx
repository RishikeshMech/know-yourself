'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { Navbar } from '@/components/Navbar'
import { ReportView } from '@/components/interview/ReportView.tsx'
import Link from 'next/link'

export default function ReportPage({ params }: { params: { id: string } }) {
  const [loading, setLoading] = useState(true)
  const [report, setReport] = useState<any>(null)
  const [trend, setTrend] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch(`/api/interviews/${params.id}/report`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to load report')
        setReport(data.report)
        setTrend(data.trend || [])
      } catch (e: any) {
        setError(e?.message || 'Failed to load report')
      } finally {
        setLoading(false)
      }
    })()
  }, [params.id])

  if (loading) {
    return (
      <div>
        <Navbar />
        <main className="max-w-5xl mx-auto p-8"><div className="glass-card animate-pulse h-96" /></main>
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
            <Link href="/interviews" className="btn-primary mt-4 inline-flex">Back →</Link>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div>
      <Navbar />
      <main className="py-6">
        <ReportView report={report} trend={trend} />
      </main>
    </div>
  )
}
