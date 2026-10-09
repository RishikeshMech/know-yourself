'use client'
/** A single home for every completed assessment and its detailed report. */
import Link from 'next/link'
import { useMemo } from 'react'
import { ArrowRight, BarChart3, FileText, TrendingUp } from 'lucide-react'
import { CALIBI_RULE, calibiFromSources, type ScoreEntry } from '@/lib/calibiScore'
import type { AttemptSummary } from '@/lib/company/types'

type PlatformScores = { total?: number | null; grade?: string | null; created_at?: string | null } | null | undefined

const KIND_STYLE: Record<ScoreEntry['kind'], string> = {
  core: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  capgemini: 'bg-violet-50 text-violet-700 border-violet-200',
  company: 'bg-sky-50 text-sky-700 border-sky-200',
}

function rawScore(e: ScoreEntry) {
  return e.max === 1000 ? `${Math.round(e.score)}/1000` : `${Math.round(e.score * 10) / 10}/100`
}

export function CalibiScoreCard({ a1, a2, company, companyLoaded, startHref, onOpenReport }: {
  a1: PlatformScores
  a2: PlatformScores
  company: AttemptSummary[]
  companyLoaded: boolean
  startHref: string
  onOpenReport: (assessment: 1 | 2) => void
}) {
  const calibi = useMemo(() => calibiFromSources({ a1, a2, company }), [a1, a2, company])
  const pending = company.filter((a) => a.status === 'in_progress').length

  return (
    <section id="calibi-score" className="mt-6 glass-card animate-fade-up scroll-mt-24 !p-5 sm:!p-7" aria-labelledby="calibi-score-title">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600"><BarChart3 className="h-5 w-5" /></span>
          <div>
            <h2 id="calibi-score-title" className="text-xl font-black tracking-tight text-slate-900">Your CalibiAI Score</h2>
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-500">{CALIBI_RULE}</p>
          </div>
        </div>
        {calibi.score !== null && (
          <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-fuchsia-50 px-5 py-3 text-right shadow-sm">
            <div className="flex items-baseline justify-end gap-1.5">
              <span className="text-5xl font-black leading-none text-gradient" data-testid="calibi-score">{calibi.score}</span>
              <span className="font-bold text-slate-400">/1000</span>
            </div>
            <span className="mt-1 inline-block text-xs font-bold text-indigo-600">Grade {calibi.grade} · {calibi.count} completed</span>
          </div>
        )}
      </div>

      {calibi.score === null ? (
        <div className="mt-5 rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/40 p-6 text-center">
          <p className="text-sm text-slate-500">{companyLoaded ? 'Complete any assessment to see your score and detailed reports here.' : 'Loading your assessments…'}</p>
          {companyLoaded && <Link href={startHref} className="btn-primary mt-3 inline-flex">Start your first assessment →</Link>}
        </div>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="font-semibold text-slate-700">Average of {calibi.count} assessment{calibi.count === 1 ? '' : 's'}</span>
            {pending > 0 && <span>· {pending} in progress (not counted yet)</span>}
            {!companyLoaded && <span>· loading company mocks…</span>}
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <div className="rounded-2xl border border-slate-100 bg-white/75 p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-800"><TrendingUp className="h-4 w-4 text-indigo-500" /> Performance at a glance</div>
              <p className="mt-1 text-[11px] text-slate-500">Every bar is a percentage of that assessment’s maximum score.</p>
              <div className="mt-5 overflow-x-auto pb-1">
                <div style={{ minWidth: Math.max(320, calibi.entries.length * 64) }}>
                  <div className="flex h-36 items-end gap-2 border-b border-slate-200 pb-1" role="img" aria-label="Chart comparing the scores of completed assessments out of 100 percent">
                    {calibi.entries.map(e => (
                      <div key={e.key} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${e.label}: ${e.percent}%`}>
                        <span className="text-[10px] font-bold text-slate-600">{e.percent}%</span>
                        <div className="w-full max-w-[2.5rem] rounded-t-lg bg-gradient-to-t from-indigo-600 to-fuchsia-400 transition-all group-hover:from-indigo-500 group-hover:to-fuchsia-300" style={{ height: `${e.percent}%` }} />
                      </div>
                    ))}
                  </div>
                  <div className="mt-1 flex gap-2">
                    {calibi.entries.map(e => <span key={e.key} className="min-w-0 flex-1 truncate text-center text-[10px] text-slate-500" title={e.label}>{e.label}</span>)}
                  </div>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-white/75 p-4">
              <div className="text-sm font-bold text-slate-800">Category breakdown</div>
              <p className="mt-1 text-[11px] text-slate-500">Find which assessment group needs more practice.</p>
              <div className="mt-5 space-y-4">
                {calibi.categories.map(c => (
                  <div key={c.id}>
                    <div className="mb-1.5 flex items-center justify-between gap-2 text-xs"><span className="truncate font-semibold text-slate-700">{c.label} <span className="font-normal text-slate-400">({c.count})</span></span><span className="font-mono font-bold text-indigo-600">{c.percent}%</span></div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-400" style={{ width: `${c.percent}%` }} /></div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div id="assessment-reports" className="mt-7 scroll-mt-24">
            <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-indigo-600" /><h3 className="text-base font-black text-slate-900">Your assessment reports</h3></div>
            <p className="mt-1 text-xs text-slate-500">Open any report to see section scores, strengths and exactly where you can improve.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2" data-testid="calibi-breakdown">
              {calibi.entries.map(e => (
                <article key={e.key} className="flex min-w-0 flex-col rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm transition hover:border-indigo-200 hover:shadow-md">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><h4 className="truncate text-sm font-black text-slate-800" title={e.label}>{e.label}</h4><span className={`mt-1.5 inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${KIND_STYLE[e.kind]}`}>{e.category}</span></div>
                    <span className="shrink-0 text-lg font-black text-indigo-600">{e.scaled}<span className="text-[10px] font-semibold text-slate-400">/1000</span></span>
                  </div>
                  <div className="mt-4 flex items-center justify-between text-[11px] text-slate-500"><span>{rawScore(e)}</span><span>{e.outcome || 'Scored'}</span></div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-400" style={{ width: `${e.percent}%` }} /></div>
                  {e.kind === 'company' && e.company ? (
                    <Link href={`/company-assessments/${e.company}/result`} className="mt-4 inline-flex items-center gap-1 self-start text-xs font-bold text-indigo-600 hover:text-indigo-800">View report <ArrowRight className="h-3.5 w-3.5" /></Link>
                  ) : (
                    <button type="button" onClick={() => onOpenReport(e.kind === 'capgemini' ? 2 : 1)} className="mt-4 inline-flex items-center gap-1 self-start text-xs font-bold text-indigo-600 hover:text-indigo-800">View report <ArrowRight className="h-3.5 w-3.5" /></button>
                  )}
                </article>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
