'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Navbar } from '@/components/Navbar'
import { useStore } from '@/lib/store'
import { getCompany } from '@/lib/company/catalog'
import { SECTION_BY_ID } from '@/lib/company/sections'
import { companyApi } from '@/lib/company/client'
import { CompanyBadge } from '@/components/company/CompanyBadge'
import type { PublicResult } from '@/lib/company/scoring'
import type { AttemptSummary } from '@/lib/company/types'

const VERDICT: Record<string, { tone: string; ring: string; blurb: string }> = {
  ready: { tone: 'text-emerald-700 bg-emerald-50 border-emerald-200', ring: '#10b981', blurb: 'You cleared every sectional cut-off with a strong overall score.' },
  almost: { tone: 'text-indigo-700 bg-indigo-50 border-indigo-200', ring: '#6366f1', blurb: 'A solid performance — tighten the focus areas below to be interview-ready.' },
  borderline: { tone: 'text-amber-700 bg-amber-50 border-amber-200', ring: '#f59e0b', blurb: 'You are close to typical shortlisting levels. Target the weakest rounds first.' },
  'not-yet': { tone: 'text-rose-700 bg-rose-50 border-rose-200', ring: '#f43f5e', blurb: 'Build fundamentals in the focus areas below before your next attempt at a similar company.' },
}

function Bar({ pct, cutoff }: { pct: number; cutoff?: number }) {
  return (
    <div className="relative h-2 rounded-full bg-slate-100 overflow-hidden">
      <div className={`h-full rounded-full ${cutoff != null && pct < cutoff ? 'bg-rose-400' : 'calibiai-gradient'}`} style={{ width: `${Math.max(2, Math.min(100, pct))}%` }} />
      {cutoff != null && <span className="absolute top-0 bottom-0 w-0.5 bg-slate-700/60" style={{ left: `${cutoff}%` }} title={`Cut-off ${cutoff}%`} />}
    </div>
  )
}

export default function Page({ params }: { params: { slug: string } }) {
  const router = useRouter()
  const search = useSearchParams()
  const { user, hydrated } = useStore()
  const company = getCompany(params.slug)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState<(AttemptSummary & { proctoring?: { strikes: number; camera: boolean | null }; submit_reason?: string | null }) | null>(null)
  const [result, setResult] = useState<PublicResult | null>(null)

  useEffect(() => {
    if (!hydrated) return
    if (!user?.id) { router.replace('/login'); return }
    if (!company) { setLoading(false); return }
    let cancelled = false
    companyApi.result(user.id, company.slug).then((res) => {
      if (cancelled) return
      if (!res.ok) { setError(res.data?.error || 'Could not load your result.'); setLoading(false); return }
      if (res.data.state === 'none') { router.replace(`/company-assessments/${company.slug}`); return }
      if (res.data.state === 'in_progress') { router.replace(`/company-assessments/${company.slug}/test`); return }
      setAttempt(res.data.attempt || null)
      setResult(res.data.result || null)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [hydrated, user?.id, company, router])

  // Areas with at least two questions (or one written/coding task) give a
  // meaningful signal; single 1-mark MCQs are too noisy to call a strength.
  const areas = useMemo(() => (result?.areas || []).filter((a) => a.items >= 2 || a.possible >= 10), [result])
  const strengths = useMemo(() => areas.filter((a) => a.percent >= 60).sort((a, b) => b.percent - a.percent).slice(0, 5), [areas])
  const focus = useMemo(() => areas.filter((a) => a.percent < 50).sort((a, b) => a.percent - b.percent).slice(0, 5), [areas])

  if (!company) {
    return <div><Navbar /><main className="max-w-3xl mx-auto px-4 py-16 text-center text-sm text-slate-600">This company assessment does not exist.</main></div>
  }

  const v = VERDICT[result?.verdict || 'not-yet']
  const score = Math.round(result?.score ?? 0)
  const C = 2 * Math.PI * 52

  return (
    <div>
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <Link href="/dashboard/student" className="text-xs font-semibold text-indigo-600">← Back to dashboard</Link>
        {loading ? (
          <div className="mt-6 glass-card flex min-h-[18rem] items-center justify-center gap-3">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" role="status" />
            <span className="text-sm font-bold text-slate-700">Loading your result…</span>
          </div>
        ) : error || !result || !attempt ? (
          <div className="mt-6 glass-card text-center !p-8"><p className="text-sm text-slate-600">{error || 'No result is available yet.'}</p></div>
        ) : (
          <div className="mt-3 space-y-6">
            {search?.get('just') === '1' && (
              <div className="rounded-3xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm font-bold text-emerald-800 animate-fade-up">
                🎉 Your {company.name} assessment was submitted and graded. This was your one attempt — the result below is final.
              </div>
            )}
            <div className="glass-card animate-fade-up">
              <div className="flex flex-wrap items-center gap-6">
                <div className="relative h-32 w-32 shrink-0">
                  <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
                    <circle cx="60" cy="60" r="52" fill="none" stroke="#e2e8f0" strokeWidth="10" />
                    <circle cx="60" cy="60" r="52" fill="none" stroke={v.ring} strokeWidth="10" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - score / 100)} className="progress-smooth" />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-black text-slate-900">{score}</span>
                    <span className="text-[10px] font-bold text-slate-400">/ 100</span>
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <CompanyBadge company={company} size={40} />
                    <div>
                      <h1 className="text-xl font-black text-slate-900">{company.name} mock assessment</h1>
                      <p className="text-xs text-slate-500">{company.track}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className={`text-xs font-black px-3 py-1 rounded-full border ${v.tone}`}>{result.verdictLabel}</span>
                    <span className="chip">{result.answered}/{result.total} answered</span>
                    <span className="chip">⚠ {attempt.proctoring?.strikes ?? 0} proctoring warning{(attempt.proctoring?.strikes ?? 0) === 1 ? '' : 's'}</span>
                    <span className="chip">🎥 camera {attempt.proctoring?.camera ? 'on' : 'off'}</span>
                    {attempt.submitted_at && <span className="chip">Submitted {new Date(attempt.submitted_at).toLocaleString()}</span>}
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{v.blurb}</p>
                  {attempt.auto_submitted && attempt.submit_reason && (
                    <p className="mt-2 text-xs font-semibold text-amber-700">Auto-submitted: {attempt.submit_reason}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
              <div className="glass-card animate-fade-up">
                <h2 className="font-black text-slate-900">Rounds</h2>
                <div className="mt-4 space-y-4">
                  {result.rounds.map((r, i) => (
                    <div key={r.id}>
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="font-bold text-slate-700">{i + 1}. {r.label}</span>
                        <span className="font-mono text-xs text-slate-500">{r.percent}% · {r.weight}% weight</span>
                      </div>
                      <div className="mt-1.5"><Bar pct={r.percent} cutoff={r.cutoff} /></div>
                      <div className="mt-1 text-[11px] text-slate-400">
                        {r.answered}/{r.total} answered · {r.earned}/{r.possible} marks
                        {r.cutoff != null && <span className={r.cleared ? 'text-emerald-600' : 'text-rose-600'}> · cut-off {r.cutoff}% {r.cleared ? 'cleared' : 'not cleared'}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass-card animate-fade-up">
                <h2 className="font-black text-slate-900">Master-bank sections</h2>
                <div className="mt-4 space-y-3.5">
                  {result.sections.map((s) => (
                    <div key={s.section}>
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="font-semibold text-slate-700">{SECTION_BY_ID[s.section]?.icon} {s.title}</span>
                        <span className="font-mono text-xs text-slate-500">{s.percent}%</span>
                      </div>
                      <div className="mt-1.5"><Bar pct={s.percent} /></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {areas.length > 0 && (
              <div className="grid md:grid-cols-2 gap-6">
                <div className="glass-card animate-fade-up">
                  <h2 className="font-black text-emerald-700">Strengths</h2>
                  <p className="text-[11px] text-slate-400">Areas where you scored 60% or more</p>
                  {strengths.length ? (
                    <ul className="mt-3 space-y-2">{strengths.map((a) => (
                      <li key={`${a.section}-${a.area}`} className="flex items-center justify-between text-sm"><span className="text-slate-700">{SECTION_BY_ID[a.section]?.icon} {a.label}</span><span className="font-mono text-xs text-emerald-700">{a.percent}%</span></li>
                    ))}</ul>
                  ) : <p className="mt-3 text-sm text-slate-500">No area reached 60% yet — the focus list shows where to start.</p>}
                </div>
                <div className="glass-card animate-fade-up">
                  <h2 className="font-black text-rose-600">Focus areas</h2>
                  <p className="text-[11px] text-slate-400">Areas below 50% — practise these first</p>
                  {focus.length ? (
                    <ul className="mt-3 space-y-2">{focus.map((a) => (
                      <li key={`${a.section}-${a.area}`} className="flex items-center justify-between text-sm"><span className="text-slate-700">{SECTION_BY_ID[a.section]?.icon} {a.label}</span><span className="font-mono text-xs text-rose-600">{a.percent}%</span></li>
                    ))}</ul>
                  ) : <p className="mt-3 text-sm text-slate-500">Nothing below 50% — great balance across areas.</p>}
                </div>
              </div>
            )}

            {result.items.length > 0 && (
              <div className="glass-card animate-fade-up">
                <h2 className="font-black text-slate-900">Written & coding feedback</h2>
                <p className="text-xs text-slate-500 mt-0.5">Graded on the server ({result.graders.written === 'calibiai' ? 'CalibiAI grader' : 'rubric engine'} for written answers, hidden tests for code).</p>
                <div className="mt-4 grid md:grid-cols-2 gap-3">
                  {result.items.map((it) => (
                    <div key={it.id} className="panel p-3.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-700">{SECTION_BY_ID[it.section]?.icon} {it.kind === 'coding' ? 'Coding' : 'Written'} · {it.topic}</span>
                        <span className="font-mono text-xs text-slate-500">{it.kind === 'coding' ? `${it.passed ?? 0}/${it.total ?? 0} tests` : `${it.score ?? 0}/100`}</span>
                      </div>
                      {!it.answered && <p className="mt-1.5 text-xs text-rose-600">Not answered.</p>}
                      {it.feedback?.summary && <p className="mt-1.5 text-xs text-slate-500">{it.feedback.summary}</p>}
                      {!!it.feedback?.strengths?.length && <p className="mt-1 text-xs text-emerald-700"><b>Strengths:</b> {it.feedback.strengths.join(' • ')}</p>}
                      {!!it.feedback?.improvements?.length && <p className="mt-1 text-xs text-amber-700"><b>Improve:</b> {it.feedback.improvements.join(' • ')}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <Link href="/dashboard/student" className="btn-primary">Back to dashboard</Link>
              <Link href="/company-assessments" className="btn-soft">Browse other companies</Link>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
