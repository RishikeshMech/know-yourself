'use client'

import { useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  ListChecks,
  Send,
  X,
} from 'lucide-react'
import type { ReviewSection, ReviewStats, ReviewTarget } from '@/lib/reviewModel'

/**
 * Pre-submit review page shown when the candidate clicks "Submit" themselves.
 * (Automatic submission — time up or 3 focus warnings — skips this and submits
 * directly.) Lists every section and question with answered / not-answered
 * status; each row jumps back to that question so nothing is left behind by
 * accident.
 */
export function AssessmentReview({
  sections,
  stats,
  timeLeft,
  strikes,
  submitting,
  onJump,
  onCancel,
  onSubmit,
}: {
  sections: ReviewSection[]
  stats: ReviewStats
  timeLeft: string
  strikes: number
  submitting: boolean
  onJump: (target: ReviewTarget) => void
  onCancel: () => void
  onSubmit: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const unanswered = stats.total - stats.answered
  const complete = unanswered === 0

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-100/95 backdrop-blur animate-fade-in">
      {/* Header */}
      <header className="shrink-0 border-b border-slate-200 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl calibiai-gradient text-white shadow-md shadow-indigo-300/50">
              <ListChecks className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 sm:text-lg">Review your answers</h2>
              <p className="text-[11px] text-slate-500">A last look before your score is locked.</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
            aria-label="Return to assessment"
            title="Return to assessment"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </header>

      {/* Scrollable content */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-4 py-5 sm:px-6">
          {/* Summary card */}
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center gap-4">
              {/* Progress ring */}
              <div className="relative h-20 w-20 shrink-0">
                <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
                  <circle cx="40" cy="40" r="32" fill="none" stroke="#e2e8f0" strokeWidth="8" />
                  <circle
                    cx="40"
                    cy="40"
                    r="32"
                    fill="none"
                    stroke={complete ? '#10b981' : '#6366f1'}
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 32}
                    strokeDashoffset={2 * Math.PI * 32 * (1 - (stats.total ? stats.answered / stats.total : 0))}
                    className="progress-smooth"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-sm font-black tabular-nums text-slate-800">
                  {stats.total ? Math.round((stats.answered / stats.total) * 100) : 0}%
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-black text-slate-900">
                  {stats.answered} of {stats.total} answered
                </h3>
                {complete ? (
                  <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-emerald-600">
                    <CheckCircle2 className="h-4 w-4" aria-hidden /> Everything is answered — great work.
                  </p>
                ) : (
                  <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-amber-600">
                    <AlertTriangle className="h-4 w-4" aria-hidden />
                    {unanswered} question{unanswered === 1 ? '' : 's'} still unanswered — they will score 0.
                  </p>
                )}
                <p className="mt-1 text-xs text-slate-500">
                  Tap any question below to jump back and finish it.
                </p>
              </div>

              <div className="flex gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-600">
                  <Clock className="h-3.5 w-3.5" aria-hidden /> {timeLeft}
                </span>
                {strikes > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700">
                    ⚠ {strikes} warning{strikes > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Sections */}
          <div className="mt-5 space-y-4">
            {sections.map((section) => {
              const sectionPct = section.total ? Math.round((section.answered / section.total) * 100) : 0
              return (
                <section key={section.key} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center gap-3 border-b border-slate-100 bg-white/80 px-4 py-3 sm:px-5">
                    <span className="text-xl" aria-hidden>{section.icon}</span>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-black text-slate-900">{section.label}</h3>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="h-1.5 w-36 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full rounded-full progress-smooth ${section.answered === section.total ? 'bg-emerald-500' : 'calibiai-gradient'}`}
                            style={{ width: `${sectionPct}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-bold tabular-nums text-slate-400">
                          {section.answered}/{section.total}
                        </span>
                      </div>
                    </div>
                    {section.answered === section.total ? (
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" aria-hidden />
                    ) : (
                      <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-700">
                        {section.total - section.answered} left
                      </span>
                    )}
                  </div>

                  <div className="divide-y divide-slate-50 px-2 py-1 sm:px-3">
                    {section.groups.map((group) => (
                      <div key={group.key} className="py-1.5">
                        <p className="px-2 pb-1 pt-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                          {group.label}
                        </p>
                        <ul className="space-y-1">
                          {group.questions.map((q) => (
                            <li key={q.key}>
                              <button
                                type="button"
                                onClick={() => onJump(q.target)}
                                className={`group flex w-full items-start gap-3 rounded-2xl px-2.5 py-2 text-left transition ${
                                  q.answered
                                    ? 'hover:bg-slate-50'
                                    : 'bg-amber-50/70 hover:bg-amber-100/70'
                                }`}
                              >
                                <span className="mt-0.5 shrink-0">
                                  {q.answered ? (
                                    <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden />
                                  ) : (
                                    <Circle className="h-4 w-4 text-amber-400" aria-hidden />
                                  )}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className={`block text-xs leading-snug ${q.answered ? 'text-slate-700' : 'font-semibold text-slate-800'}`}>
                                    {q.prompt}
                                  </span>
                                  <span className={`mt-0.5 block truncate text-[11px] ${q.answered ? 'text-slate-400' : 'font-semibold text-amber-600'}`}>
                                    {q.answered ? q.preview : 'Not answered yet'}
                                  </span>
                                </span>
                                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-500" aria-hidden />
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="shrink-0 border-t border-slate-200 bg-white/95 backdrop-blur-xl">
        <div className="mx-auto max-w-4xl px-4 py-3.5 sm:px-6">
          {confirming ? (
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold text-slate-700">
                Once submitted, your CalibiAI Score is locked — you can't go back and change anything.
                {unanswered > 0 && (
                  <span className="ml-1 font-bold text-amber-600">{unanswered} unanswered will score 0.</span>
                )}
              </p>
              <div className="flex shrink-0 gap-2.5">
                <button
                  onClick={() => setConfirming(false)}
                  disabled={submitting}
                  className="btn-soft !py-2.5 text-xs font-bold disabled:opacity-50"
                >
                  Keep reviewing
                </button>
                <button
                  onClick={onSubmit}
                  disabled={submitting}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-rose-500 to-red-500 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-rose-300/50 transition hover:brightness-105 active:scale-[.98] disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      Submitting…
                    </>
                  ) : (
                    <>Yes, submit &amp; lock score</>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              <button
                onClick={onCancel}
                disabled={submitting}
                className="inline-flex items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Return to assessment
              </button>
              <button
                onClick={() => setConfirming(true)}
                disabled={submitting}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-300/50 transition hover:brightness-105 active:scale-[.98] disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" aria-hidden /> Submit assessment
              </button>
            </div>
          )}
        </div>
      </footer>
    </div>
  )
}
