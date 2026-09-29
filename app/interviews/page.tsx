'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Navbar } from '@/components/Navbar'
import { useStore } from '@/lib/store'

export default function InterviewsListPage() {
  const { user, hydrated } = useStore()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!hydrated || !user?.id) return
    fetch(`/api/interviews/quota?student_id=${encodeURIComponent(user.id)}`)
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [hydrated, user?.id])

  if (!hydrated) return <div className="p-8">Loading…</div>
  if (!user) {
    return <div className="flex min-h-screen items-center justify-center"><Link href="/login" className="btn-primary">Sign in to view interviews</Link></div>
  }

  return (
    <div>
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-900">AI Mock Interviews</h1>
            <p className="text-sm text-slate-500 mt-1">Real-time simulation with Sam · 3 attempts max · DeepSeek powered · camera & voice</p>
          </div>
          <Link href="/interviews/schedule" className="btn-primary">Schedule new →</Link>
        </div>

        {loading ? (
          <div className="mt-6 glass-card animate-pulse h-48" />
        ) : (
          <>
            <div className="mt-6 glass-card !p-5">
              <div className="flex items-center gap-3">
                <span className="chip bg-indigo-50 text-indigo-700 border-indigo-200">Used {data?.used || 0}/{data?.max || 3}</span>
                <span className={`chip ${data?.remaining > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>{data?.remaining > 0 ? `${data.remaining} left` : 'No attempts left'}</span>
                {data?.trend?.length > 1 && <span className="text-xs text-slate-500">Trend: {data.trend.map((t: any) => t.score).join(' → ')}</span>}
              </div>
            </div>

            <div className="mt-6 grid gap-4">
              {(data?.sessions || []).length === 0 ? (
                <div className="glass-card text-center py-12">
                  <div className="text-4xl">🎙️</div>
                  <p className="mt-2 text-sm text-slate-500">No interviews yet. Schedule your first 35-min Standard simulation.</p>
                  <Link href="/interviews/schedule" className="btn-primary mt-4 inline-flex">Schedule now →</Link>
                </div>
              ) : (
                (data.sessions || []).map((s: any) => (
                  <div key={s.id} className="glass-card flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold">Attempt #{s.attempt_number} · {s.track === 'swe' ? 'SWE' : 'AI/ML'} · <span className="capitalize">{s.mode}</span></div>
                      <div className="text-xs text-slate-500">{new Date(s.created_at).toLocaleString()} · State: {s.state}</div>
                    </div>
                    <div className="flex gap-2">
                      {s.state === 'REPORT_READY' ? (
                        <Link href={`/interviews/${s.id}/report`} className="btn-primary !py-2 !px-4 text-xs">View report →</Link>
                      ) : (
                        <Link href={`/interviews/${s.id}`} className="btn-primary !py-2 !px-4 text-xs">Continue interview →</Link>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {data?.reports?.length > 0 && (
              <div className="mt-8 glass-card">
                <div className="text-sm font-bold">Past reports</div>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-slate-400"><tr><th>Attempt</th><th>Score</th><th>Band</th><th>Track</th><th>Date</th><th></th></tr></thead>
                    <tbody>
                      {data.reports.map((r: any) => (
                        <tr key={r.id} className="border-t border-slate-100">
                          <td className="py-2 font-bold">#{r.attempt_number}</td>
                          <td className="font-mono font-bold">{r.overall_score}/100</td>
                          <td><span className="chip text-[10px]">{r.band}</span></td>
                          <td>{r.track}</td>
                          <td className="text-slate-500">{new Date(r.created_at).toLocaleDateString()}</td>
                          <td><Link href={`/interviews/${r.session_id}/report`} className="text-indigo-600 font-bold">Report →</Link></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
