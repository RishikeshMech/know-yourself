'use client'
/**
 * "Your CalibiAI Score" — the student's headline number: the average of every
 * assessment they have completed (CalibiAI assessment, Capgemini 2027 mock and
 * each company mock), each normalised to the 1000-point scale. The rule lives
 * in lib/calibiScore.ts and is shared with the admin console.
 */
import Link from 'next/link'
import { useMemo } from 'react'
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

export function CalibiScoreCard({ a1, a2, company, companyLoaded, startHref }: {
  a1: PlatformScores
  a2: PlatformScores
  company: AttemptSummary[]
  companyLoaded: boolean
  startHref: string
}) {
  const calibi = useMemo(() => calibiFromSources({ a1, a2, company }), [a1, a2, company])
  const pending = company.filter((a) => a.status === 'in_progress').length

  return (
    <section className="mt-6 glass-card animate-fade-up" aria-labelledby="calibi-score-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="calibi-score-title" className="text-sm font-bold text-slate-700">Your CalibiAI Score</h2>
          <p className="mt-0.5 max-w-xl text-[11px] text-slate-500">{CALIBI_RULE}</p>
        </div>
        {calibi.score !== null && (
          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-black text-gradient" data-testid="calibi-score">{calibi.score}</span>
            <span className="text-slate-400 font-bold">/1000</span>
            <span className="chip text-indigo-700 border-indigo-200 bg-indigo-50/70">Grade {calibi.grade}</span>
          </div>
        )}
      </div>

      {calibi.score === null ? (
        <div className="mt-4 rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/40 p-6 text-center">
          <p className="text-sm text-slate-500">
            {companyLoaded ? 'Complete any assessment to get your CalibiAI Score.' : 'Loading your assessments…'}
          </p>
          {companyLoaded && <Link href={startHref} className="btn-primary mt-3 inline-flex">Start your first assessment →</Link>}
        </div>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="font-semibold text-slate-700">
              Average of {calibi.count} assessment{calibi.count === 1 ? '' : 's'}
            </span>
            {pending > 0 && <span>· {pending} in progress (counted once submitted)</span>}
            {!companyLoaded && <span>· loading company mocks…</span>}
          </div>

          {calibi.categories.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {calibi.categories.map((c) => (
                <span key={c.id} className="chip !text-[11px] text-slate-600 border-slate-200 bg-white/70">
                  {c.label}: <b className="ml-1 text-slate-800">{Math.round(c.percent * 10)}</b>
                  <span className="ml-1 text-slate-400">({c.count})</span>
                </span>
              ))}
            </div>
          )}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-xs" data-testid="calibi-breakdown">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-slate-400">
                  <th className="py-1.5 pr-2 font-semibold">Assessment</th>
                  <th className="py-1.5 pr-2 font-semibold">Category</th>
                  <th className="py-1.5 pr-2 font-semibold">Score</th>
                  <th className="py-1.5 pr-2 font-semibold w-[34%]">On the 1000 scale</th>
                  <th className="py-1.5 font-semibold">Result</th>
                </tr>
              </thead>
              <tbody>
                {calibi.entries.map((e) => (
                  <tr key={e.key} className="border-t border-slate-100">
                    <td className="py-2 pr-2 font-semibold text-slate-800">
                      {e.kind === 'company' && e.company
                        ? <Link href={`/company-assessments/${e.company}/result`} className="hover:text-indigo-600">{e.label}</Link>
                        : e.label}
                    </td>
                    <td className="py-2 pr-2"><span className={`chip !text-[10px] ${KIND_STYLE[e.kind]}`}>{e.category}</span></td>
                    <td className="py-2 pr-2 font-mono text-slate-700">{rawScore(e)}</td>
                    <td className="py-2 pr-2">
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full calibiai-gradient rounded-full" style={{ width: `${e.percent}%` }} />
                        </div>
                        <span className="w-10 text-right font-mono font-bold text-slate-700">{e.scaled}</span>
                      </div>
                    </td>
                    <td className="py-2 text-slate-500">{e.outcome || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
