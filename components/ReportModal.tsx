'use client'
import { useEffect, useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { reportSections, aiTaskLabel, tierFor, num } from '@/lib/reportPdf'
import { X, Download, TrendingUp, AlertCircle, Sparkles, CheckCircle2 } from 'lucide-react'

/* ------------------------------------------------------------------ */
/* ReportModal — "View report" pop-up used on the profile page and the */
/* student dashboard. Shows the candidate's full CalibiAI result:      */
/* overall score, section-wise scores, objective accuracy, behavioural */
/* traits, strengths and — most importantly — exactly where they are   */
/* lacking / can improve. Also lets them download the full 2-page PDF. */
/* ------------------------------------------------------------------ */

type Props = { scores: any; onClose: () => void }

const ADVICE: Record<string, string> = {
  english: 'Practise timed listening, speaking, reading and writing drills every day.',
  problem_solving: 'Solve timed logic, arithmetic and data-interpretation problems to build accuracy.',
  ai_debugging: 'Trace and fix bugs in unfamiliar code, then verify with hidden-test thinking.',
  ai_feature: 'Build small features end-to-end and cover them with edge cases and tests.',
  prompt_engineering: 'Iterate prompts with roles, constraints, examples and output formats.',
  cognitive: 'Train memory grids, logical reasoning and behavioural scenario judgement.',
}

const SECTION_SHORT: Record<string, string> = {
  english: 'English', problem_solving: 'Problem Solving', ai_debugging: 'AI Debugging',
  ai_feature: 'AI Feature Dev', prompt_engineering: 'Prompt Eng', cognitive: 'Cognitive',
}

const GRADE_CHIP: Record<string, string> = {
  A: 'bg-emerald-500', B: 'bg-indigo-500', C: 'bg-violet-500', D: 'bg-amber-500', E: 'bg-rose-500', F: 'bg-rose-600',
}

export function ReportModal({ scores, onClose }: Props) {
  const { user, profile } = useStore()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const sections = useMemo(() => (scores ? reportSections(scores) : []), [scores])
  const total = num(scores?.total)
  const grade = String(scores?.grade || '—').toUpperCase()
  const percentile = num(scores?.percentile)
  const tier = tierFor(total)
  const displayName = profile?.full_name || user?.name || 'Student'
  const email = profile?.email || user?.email || ''

  // Sections sorted weakest-first that fall below 75% — the "lacking" areas.
  const weakAreas = useMemo(
    () => sections.filter(s => s.max && s.pct < 75).sort((a, b) => a.pct - b.pct).slice(0, 3),
    [sections],
  )
  // The two strongest sections (>= 75%).
  const strengths = useMemo(
    () => sections.filter(s => s.max && s.pct >= 75).sort((a, b) => b.pct - a.pct).slice(0, 2),
    [sections],
  )
  // Per-task AI improvement bullets (task label + suggestion).
  const aiImprovements = useMemo(() => {
    const out: { label: string; text: string }[] = []
    const entries = Object.entries(scores?.ai_results || {}) as [string, any][]
    for (const [key, r] of entries) {
      const imps = Array.isArray(r?.improvements) ? r.improvements : []
      for (const imp of imps.slice(0, 2)) out.push({ label: aiTaskLabel(key), text: String(imp) })
      if (out.length >= 6) break
    }
    return out
  }, [scores])

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const download = async () => {
    setBusy(true); setError('')
    try {
      const { generateReportPdf } = await import('@/lib/reportPdf')
      const doc = await generateReportPdf({ scores, profile, user })
      doc.save(`CalibiAI_Report_${scores?.session_id || 'scorecard'}.pdf`)
    } catch (e: any) {
      setError(e?.message || 'Could not generate the PDF. Please try again.')
    } finally { setBusy(false) }
  }

  if (!scores) return null

  const pctTone = (p: number) =>
    p >= 75 ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : p >= 60 ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
      : p >= 40 ? 'bg-amber-50 text-amber-700 border-amber-200'
      : 'bg-rose-50 text-rose-700 border-rose-200'

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="CalibiAI score report">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative flex max-h-[92vh] w-full max-w-3xl animate-pop flex-col overflow-hidden rounded-[26px] border border-white/60 bg-white shadow-2xl shadow-indigo-950/40">
        {/* Header */}
        <div className="relative shrink-0 bg-gradient-to-br from-slate-900 via-[#191834] to-[#241b4d] px-5 py-4 sm:px-7 sm:py-5">
          <button
            onClick={onClose}
            aria-label="Close report"
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/80 transition hover:bg-white/20 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-300">CalibiAI · Verified score report</div>
          <h2 className="mt-1 truncate pr-10 text-xl font-black text-white sm:text-2xl">{displayName}</h2>
          {email && <p className="mt-0.5 truncate text-xs text-slate-400">{email}</p>}
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto px-5 py-5 sm:px-7">
          {/* Score summary */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4">
            <div className="flex items-baseline gap-1.5">
              <span className="text-5xl font-black text-gradient leading-none">{total}</span>
              <span className="text-lg font-bold text-slate-400">/1000</span>
            </div>
            <div className="space-y-1">
              <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-black text-white ${GRADE_CHIP[grade] || 'bg-indigo-500'}`}>
                Grade {grade}
              </span>
              <div className="text-xs font-semibold text-slate-600">{percentile}th percentile · {tier.label} tier</div>
              {scores?.verifiable_hash && (
                <div className="font-mono text-[10px] text-slate-400">✓ {String(scores.verifiable_hash).slice(0, 26)}…</div>
              )}
            </div>
          </div>

          {/* Section-wise scores */}
          <div className="mt-5">
            <h3 className="text-xs font-black uppercase tracking-[0.16em] text-indigo-600">Section-wise scores</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {sections.map(s => (
                <div key={s.key} className={`rounded-xl border p-3 ${s.pct < 40 ? 'border-rose-200 bg-rose-50/40' : s.pct < 60 ? 'border-amber-200 bg-amber-50/30' : s.pct < 75 ? 'border-indigo-100 bg-indigo-50/30' : 'border-emerald-100 bg-emerald-50/30'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-700">{SECTION_SHORT[s.key] || s.label}</span>
                    <span className="font-mono text-xs font-bold text-slate-600">{s.score}/{s.max}</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-200/70">
                    <div
                      className={`h-full rounded-full ${s.pct >= 75 ? 'bg-emerald-500' : s.pct >= 60 ? 'bg-indigo-500' : s.pct >= 40 ? 'bg-amber-400' : 'bg-rose-500'}`}
                      style={{ width: `${Math.max(0, Math.min(100, s.pct))}%` }}
                    />
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${pctTone(s.pct)}`}>{s.pct}%</span>
                    {s.pct < 75 && <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600"><AlertCircle className="h-3 w-3" /> Focus area</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Lacking / improve */}
          {(weakAreas.length > 0 || aiImprovements.length > 0) && (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
              <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-amber-700">
                <TrendingUp className="h-4 w-4" /> Where you can improve
              </h3>
              <ul className="mt-2.5 space-y-2">
                {weakAreas.map(s => (
                  <li key={s.key} className="flex items-start gap-2 text-sm text-slate-700">
                    <span className="mt-0.5 shrink-0 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-black text-amber-800">
                      {s.label}
                    </span>
                    <span className="text-xs leading-relaxed">{ADVICE[s.key] || 'Dedicated practice will lift this section quickly.'}</span>
                  </li>
                ))}
                {aiImprovements.map((a, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                    <span className="mt-0.5 shrink-0 rounded-md bg-white px-1.5 py-0.5 text-[10px] font-black text-indigo-700 ring-1 ring-indigo-100">{a.label}</span>
                    <span className="text-xs leading-relaxed">{a.text}</span>
                  </li>
                ))}
              </ul>
              {!weakAreas.length && <p className="mt-2 text-xs text-slate-500">No section below 75% — strong, balanced performance. Keep polishing the top improvement tips below.</p>}
            </div>
          )}

          {/* Strengths */}
          {strengths.length > 0 && (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
              <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-emerald-700">
                <Sparkles className="h-4 w-4" /> Strengths
              </h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {strengths.map(s => (
                  <span key={s.key} className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-bold text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" /> {s.label} · {s.pct}%
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Detail strip */}
          {scores?.detail && (
            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ['Listening', scores.detail.listeningCorrect, scores.detail.listeningTotal],
                ['Reading', scores.detail.readingCorrect, scores.detail.readingTotal],
                ['Problem solving', scores.detail.problemCorrect, scores.detail.problemTotal],
                ['Logical reasoning', scores.detail.logicalCorrect, scores.detail.logicalTotal],
              ].filter(([, c, t]) => Number(t) > 0).map(([label, c, t]) => (
                <div key={label as string} className="rounded-xl border border-slate-200/70 bg-white p-2.5 text-center">
                  <div className="font-mono text-lg font-black text-slate-800">{Number(c)}<span className="text-slate-400">/{Number(t)}</span></div>
                  <div className="text-[10px] font-semibold text-slate-500">{label}</div>
                </div>
              ))}
            </div>
          )}

          {error && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-600">{error}</div>}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2.5 border-t border-slate-100 bg-white px-5 py-3.5 sm:px-7">
          <button onClick={onClose} className="btn-soft !py-2.5 text-xs">Close</button>
          <button onClick={download} disabled={busy} className="btn-primary !py-2.5 text-xs disabled:opacity-60">
            {busy ? 'Preparing PDF…' : <><Download className="mr-1.5 inline h-3.5 w-3.5" /> Download full PDF report</>}
          </button>
        </div>
      </div>
    </div>
  )
}
