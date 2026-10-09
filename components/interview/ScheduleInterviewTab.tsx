'use client'
import { authenticatedFetch } from '@/lib/clientAuth'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useStore } from '@/lib/store'

type Quota = { used: number; remaining: number; max: number; sessions: any[]; reports: any[]; trend: any[] }

export function ScheduleInterviewTab() {
  const { user, profile } = useStore()
  const [quota, setQuota] = useState<Quota | null>(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    track: 'swe' as 'swe' | 'ai_ml',
    year: 2 as 2 | 3,
    mode: 'standard' as 'quick' | 'standard' | 'full',
    language_style: 'en' as 'en' | 'hinglish',
    project_title: '',
    project_summary: '',
    tech_stack: '',
  })

  const fetchQuota = async () => {
    if (!user?.id) return
    setLoading(true)
    try {
      const res = await authenticatedFetch(`/api/interviews/quota?student_id=${encodeURIComponent(user.id)}`)
      const data = await res.json()
      setQuota(data)
    } catch {}
    finally { setLoading(false) }
  }

  useEffect(() => { fetchQuota() }, [user?.id])

  const handleCreate = async () => {
    if (!user?.id) return
    if (quota && quota.remaining <= 0) {
      alert(`You have used all ${quota.max} attempts.`)
      return
    }
    setCreating(true)
    try {
      const res = await authenticatedFetch('/api/interviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: user.id,
          student_name: profile?.full_name || user.name,
          institution_id: user.institution_id,
          track: form.track,
          year: form.year,
          mode: form.mode,
          language_style: form.language_style,
          project_title: form.project_title,
          project_summary: form.project_summary,
          tech_stack: form.tech_stack.split(',').map(s => s.trim()).filter(Boolean),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || 'Failed to schedule')
        if (data.quota) setQuota((q) => q ? { ...q, remaining: data.quota.remaining, used: data.quota.used } : q)
        return
      }
      // Navigate to interview
      window.location.href = `/interviews/${data.session.id}`
    } catch (e: any) {
      alert('Failed: ' + (e?.message || e))
    } finally { setCreating(false) }
  }

  if (loading) {
    return <div className="glass-card animate-pulse h-64" />
  }

  const attemptsLeft = quota?.remaining ?? 3
  const used = quota?.used ?? 0

  return (
    <div className="space-y-6">
      {/* Quota header */}
      <div className="glass-card !p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-black text-slate-800">AI Mock Interview — Real-time simulation with Sam</h3>
            <p className="mt-1 text-xs text-slate-500">30-45 min end-to-end: camera on, mic on, voice Q&A, live coding, AI analysis & scoring. Powered by DeepSeek.</p>
            <div className="mt-3 flex items-center gap-2">
              <span className="chip text-indigo-700 border-indigo-200 bg-indigo-50">Attempts: {used}/{quota?.max || 3}</span>
              <span className={`chip ${attemptsLeft > 0 ? 'text-emerald-700 border-emerald-200 bg-emerald-50' : 'text-rose-700 border-rose-200 bg-rose-50'}`}>
                {attemptsLeft > 0 ? `${attemptsLeft} left` : 'No attempts left'}
              </span>
              {(quota?.trend?.length || 0) > 0 && (
                <span className="chip text-slate-600">
                  Trend: {(quota?.trend || []).map((t: any) => t.score).join(' → ')} {(quota?.trend?.length || 0) > 1 && (quota?.trend?.[quota.trend.length-1]?.score || 0) > (quota?.trend?.[0]?.score || 0) ? '↗ +'+((quota?.trend?.[quota.trend.length-1]?.score || 0) - (quota?.trend?.[0]?.score || 0)) : ''}
                </span>
              )}
            </div>
          </div>
          <Link href="/interviews" className="btn-soft !py-2 !px-4 !text-xs">View all attempts →</Link>
        </div>

        {(quota?.sessions?.length || 0) > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-400"><tr><th className="py-1">Attempt</th><th>Track</th><th>Mode</th><th>State</th><th>Date</th><th></th></tr></thead>
              <tbody>
                {(quota?.sessions || []).slice(0, 3).map((s: any) => (
                  <tr key={s.id} className="border-t border-slate-100">
                    <td className="py-2 font-bold">#{s.attempt_number}</td>
                    <td>{s.track === 'swe' ? 'SWE' : 'AI/ML'}</td>
                    <td className="capitalize">{s.mode}</td>
                    <td><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${s.state === 'REPORT_READY' ? 'bg-emerald-100 text-emerald-700' : s.state === 'ABANDONED' ? 'bg-slate-100 text-slate-500' : 'bg-amber-100 text-amber-700'}`}>{s.state}</span></td>
                    <td className="text-slate-500">{new Date(s.created_at).toLocaleDateString()}</td>
                    <td>
                      {s.state === 'REPORT_READY' ? (
                        <Link href={`/interviews/${s.id}/report`} className="text-indigo-600 font-bold hover:underline">Report →</Link>
                      ) : (
                        <Link href={`/interviews/${s.id}`} className="text-indigo-600 font-bold hover:underline">Continue →</Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Schedule form */}
      <div className="glass-card">
        <div className="text-sm font-bold text-slate-700">Schedule new AI interview</div>
        <p className="text-xs text-slate-500 mt-1">Only 3 attempts per student. Choose track, year profile, and mode. Standard (35 min) is recommended.</p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Track</label>
            <select value={form.track} onChange={e => setForm({ ...form, track: e.target.value as any })} className="field mt-1">
              <option value="swe">Software Engineer (SWE)</option>
              <option value="ai_ml">AI/ML Engineer</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Year profile</label>
            <select value={form.year} onChange={e => setForm({ ...form, year: Number(e.target.value) as any })} className="field mt-1">
              <option value={2}>2nd Year — fundamentals-heavy, gentle hints</option>
              <option value={3}>3rd Year — harder DSA, OS/CN/DBMS, project deep-dive</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Mode</label>
            <select value={form.mode} onChange={e => setForm({ ...form, mode: e.target.value as any })} className="field mt-1">
              <option value="quick">Quick Practice — 15 min (2-3 fundamentals, 1 problem, 1 behavioural)</option>
              <option value="standard">Standard — 35 min (default, most students)</option>
              <option value="full">Full Simulation — 45 min (3rd year before placements)</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Language style</label>
            <select value={form.language_style} onChange={e => setForm({ ...form, language_style: e.target.value as any })} className="field mt-1">
              <option value="en">English</option>
              <option value="hinglish">English with Hinglish tolerance (understands Hinglish)</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Project context (optional — personalizes project section, PDF up to 5MB parsed server-side, PII redacted)</label>
            <input value={form.project_title} onChange={e => setForm({ ...form, project_title: e.target.value })} placeholder="Project title (e.g. URL Shortener, Sentiment Analysis)" className="field mt-1" />
            <textarea value={form.project_summary} onChange={e => setForm({ ...form, project_summary: e.target.value })} placeholder="Brief summary: what you built, tech stack, hardest part, trade-offs (max 1000 chars)" className="field mt-2 min-h-[80px]" maxLength={1000} />
            <input value={form.tech_stack} onChange={e => setForm({ ...form, tech_stack: e.target.value })} placeholder="Tech stack comma-separated (e.g. React, Node, Python, MongoDB)" className="field mt-2" />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button disabled={creating || attemptsLeft <= 0} onClick={handleCreate} className="btn-primary disabled:opacity-40">
            {creating ? 'Scheduling…' : attemptsLeft > 0 ? `Schedule AI Interview — Attempt ${used + 1}/3 →` : 'No attempts left'}
          </button>
          <span className="text-[11px] text-slate-400">DeepSeek powered · camera & mic will be requested · real voice Q&A · code editor with tests · 30-45 min simulation · explainable scoring</span>
        </div>
      </div>
    </div>
  )
}
