'use client'
/** A single home for every completed assessment and its detailed report. */
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ArrowRight, BarChart3, Download, FileText, TrendingUp } from 'lucide-react'
import { CALIBI_RULE, calibiFromSources, type ScoreEntry } from '@/lib/calibiScore'
import type { AttemptSummary } from '@/lib/company/types'
import { useStore } from '@/lib/store'
import { generateReportPdf } from '@/lib/reportPdf'

type PlatformScores = { total?: number | null; grade?: string | null; created_at?: string | null } | null | undefined

const KIND_STYLE: Record<ScoreEntry['kind'], string> = {
  core: 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/60',
  capgemini: 'bg-violet-50 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800/60',
  company: 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800/60',
}

const KIND_ACCENT: Record<ScoreEntry['kind'], string> = {
  core: 'from-indigo-500 to-fuchsia-500',
  capgemini: 'from-violet-500 to-fuchsia-500',
  company: 'from-sky-500 to-indigo-500',
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
  const { user, profile } = useStore()
  const calibi = useMemo(() => calibiFromSources({ a1, a2, company }), [a1, a2, company])
  const pending = company.filter((a) => a.status === 'in_progress').length
  // Track which platform report is currently generating a PDF so the
  // download button on its card can show a busy state. The modal still owns
  // its own download button, this is only for the inline "Download PDF".
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [pdfError, setPdfError] = useState<string | null>(null)

  const downloadPlatformPdf = async (which: 1 | 2) => {
    setPdfError(null)
    const key = which === 1 ? 'a1' : 'a2'
    setBusyKey(key)
    try {
      const src = which === 1 ? a1 : a2
      // generateReportPdf expects a row with the full shape the assessment
      // runner stores (session_id, percentile, total, etc.). The store's
      // flattened result already has every key it needs, so we hand it over
      // directly. Assessment 2 is detected by the pdf via `assessment_no`.
      const enriched = { ...(src as any), assessment_no: which } as any
      const doc = await generateReportPdf({ scores: enriched, profile, user })
      const sid = (src as any)?.session_id || (which === 1 ? 'assessment-1' : 'assessment-2')
      doc.save(`CalibiAI_Report_${sid}.pdf`)
    } catch (e: any) {
      setPdfError(e?.message || 'Could not generate the PDF. Please try again.')
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <section id="calibi-score" className="mt-6 glass-card animate-fade-up scroll-mt-24 !p-5 sm:!p-7" aria-labelledby="calibi-score-title">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-100/60 dark:border-indigo-800/40"><BarChart3 className="h-5 w-5" /></span>
          <div>
            <h2 id="calibi-score-title" className="text-xl font-black tracking-tight text-slate-900 dark:text-white animate-text-reveal">Your Calibi Score</h2>
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-500 dark:text-slate-400">{CALIBI_RULE}</p>
          </div>
        </div>
        {calibi.score !== null && (
          <div className="rounded-2xl border border-indigo-100 dark:border-indigo-900/40 bg-gradient-to-br from-indigo-50 via-white to-fuchsia-50 dark:from-indigo-950/40 dark:via-slate-900/60 dark:to-fuchsia-950/30 px-5 py-3 text-right shadow-sm">
            <div className="flex items-baseline justify-end gap-1.5">
              <span className="text-5xl font-black leading-none text-gradient animate-stat-in" data-testid="calibi-score">{calibi.score}</span>
              <span className="font-bold text-slate-400 dark:text-slate-500">/1000</span>
            </div>
            <span className="mt-1 inline-block text-xs font-bold text-indigo-600 dark:text-indigo-400">Grade {calibi.grade} · {calibi.count} completed</span>
          </div>
        )}
      </div>

      {calibi.score === null ? (
        <div className="mt-5 rounded-2xl border-2 border-dashed border-indigo-200 dark:border-indigo-800/50 bg-indigo-50/40 dark:bg-indigo-950/20 p-6 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">{companyLoaded ? 'Complete any assessment to see your score and detailed reports here.' : 'Loading your assessments…'}</p>
          {companyLoaded && <Link href={startHref} className="btn-primary mt-3 inline-flex">Start your first assessment →</Link>}
        </div>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-slate-700 dark:text-slate-200">Average of {calibi.count} assessment{calibi.count === 1 ? '' : 's'}</span>
            {pending > 0 && <span>· {pending} in progress (not counted yet)</span>}
            {!companyLoaded && <span>· loading company mocks…</span>}
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <div className="rounded-2xl border border-slate-100 dark:border-white/10 bg-white/75 dark:bg-slate-900/90 p-4 transition-colors duration-300">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100"><TrendingUp className="h-4 w-4 text-indigo-500 dark:text-indigo-400" /> Performance at a glance</div>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Every bar is a percentage of that assessment's maximum score.</p>
              <div className="mt-5 overflow-x-auto pb-1">
                <div style={{ minWidth: Math.max(320, calibi.entries.length * 64) }}>
                  <div className="flex h-36 items-end gap-2 border-b border-slate-200 dark:border-white/10 pb-1" role="img" aria-label="Chart comparing the scores of completed assessments out of 100 percent">
                    {calibi.entries.map(e => (
                      <div key={e.key} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${e.label}: ${e.percent}%`}>
                        <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 animate-stat-in">{e.percent}%</span>
                        <div className={`w-full max-w-[2.5rem] rounded-t-lg bg-gradient-to-t ${KIND_ACCENT[e.kind]} transition-all group-hover:opacity-90 group-hover:scale-x-105`} style={{ height: `${e.percent}%` }} />
                      </div>
                    ))}
                  </div>
                  <div className="mt-1 flex gap-2">
                    {calibi.entries.map(e => <span key={e.key} className="min-w-0 flex-1 truncate text-center text-[10px] text-slate-500 dark:text-slate-400" title={e.label}>{e.label}</span>)}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-100 dark:border-white/10 bg-white/75 dark:bg-slate-900/90 p-4 transition-colors duration-300">
              <div className="text-sm font-bold text-slate-800 dark:text-slate-100">Category breakdown</div>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Find which assessment group needs more practice.</p>
              <div className="mt-5 space-y-4">
                {calibi.categories.map(c => (
                  <div key={c.id}>
                    <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
                      <span className="truncate font-semibold text-slate-700 dark:text-slate-200">{c.label} <span className="font-normal text-slate-400 dark:text-slate-500">({c.count})</span></span>
                      <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{c.percent}%</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/8">
                      <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-400 transition-all" style={{ width: `${c.percent}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div id="assessment-reports" className="mt-7 scroll-mt-24">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-indigo-600 dark:text-indigo-400" /><h3 className="text-base font-black text-slate-900 dark:text-white">Your assessment reports</h3></div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Open any report to see section scores, strengths and exactly where you can improve — or download the PDF straight from here.</p>
              </div>
              <span className="rounded-full border border-slate-200 dark:border-white/10 bg-white/80 dark:bg-slate-800/80 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{calibi.entries.length} report{calibi.entries.length === 1 ? '' : 's'}</span>
            </div>
            {pdfError && (
              <div className="mt-3 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/40 px-3.5 py-2 text-xs font-semibold text-rose-600 dark:text-rose-300">{pdfError}</div>
            )}
            <div className="mt-4 grid gap-3 sm:grid-cols-2" data-testid="calibi-breakdown">
              {calibi.entries.map(e => {
                const isCompany = e.kind === 'company'
                const which = e.kind === 'capgemini' ? 2 : 1
                const busy = busyKey === e.key
                return (
                  <article
                    key={e.key}
                    className="group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white/90 dark:bg-slate-900/90 p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-indigo-200 dark:hover:border-indigo-500/50 hover:shadow-md dark:hover:shadow-indigo-900/30"
                  >
                    {/* soft accent strip */}
                    <span className={`pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${KIND_ACCENT[e.kind]}`} aria-hidden />
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="truncate text-sm font-black text-slate-800 dark:text-slate-100" title={e.label}>{e.label}</h4>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${KIND_STYLE[e.kind]}`}>{e.category}</span>
                          {e.outcome && <span className="inline-block rounded-full border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:text-slate-300">{e.outcome}</span>}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-lg font-black text-indigo-600 dark:text-indigo-400 animate-stat-in">{e.scaled}<span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">/1000</span></div>
                        <div className="mt-0.5 font-mono text-[10px] text-slate-400 dark:text-slate-500">{rawScore(e)}</div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                      <span>{e.percent}% of max</span>
                      {e.at && <span title={new Date(e.at).toLocaleString()}>{new Date(e.at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>}
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/8">
                      <div className={`h-full rounded-full bg-gradient-to-r ${KIND_ACCENT[e.kind]} transition-all`} style={{ width: `${e.percent}%` }} />
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {isCompany && e.company ? (
                        <Link href={`/company-assessments/${e.company}/result`} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-sm transition hover:bg-indigo-700">
                          View report <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      ) : (
                        <button type="button" onClick={() => onOpenReport(which as 1 | 2)} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-sm transition hover:bg-indigo-700">
                          View report <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {!isCompany && (
                        <button
                          type="button"
                          onClick={() => downloadPlatformPdf(which as 1 | 2)}
                          disabled={busy}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-white/12 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-200 transition hover:border-indigo-200 dark:hover:border-indigo-500/50 hover:bg-indigo-50/60 dark:hover:bg-indigo-900/30 hover:text-indigo-700 dark:hover:text-indigo-300 disabled:opacity-60"
                          title="Download the full PDF report"
                        >
                          <Download className="h-3.5 w-3.5" />
                          {busy ? 'Preparing…' : 'Download PDF'}
                        </button>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
