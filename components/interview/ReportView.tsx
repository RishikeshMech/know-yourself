'use client'
import Link from 'next/link'
import { useState } from 'react'

export function ReportView({ report, trend }: { report: any; trend?: any[] }) {
  const [rating, setRating] = useState(report.student_rating?.stars || 0)
  const [feedbackText, setFeedbackText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleRating = async (stars: number) => {
    setRating(stars)
    setSubmitting(true)
    try {
      await fetch(`/api/interviews/${report.session_id}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: stars, comment: feedbackText }),
      })
    } finally { setSubmitting(false) }
  }

  const handleFlag = async (qId: string) => {
    const reason = prompt('Why do you think this score is unfair? (This will be reviewed and may improve the golden set)')
    if (!reason) return
    await fetch(`/api/interviews/${report.session_id}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question_id: qId, reason }),
    })
    alert('Flag submitted — thank you! Our team will review.')
  }

  return (
    <div className="mx-auto max-w-5xl p-4 space-y-6">
      {/* Header */}
      <div className="glass-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-black uppercase tracking-wide text-indigo-600">Attempt {report.attempt_number}/3 · {report.track === 'swe' ? 'Software Engineer' : 'AI/ML Engineer'} · {report.mode}</div>
            <h1 className="mt-1 text-3xl font-black text-slate-900">{report.overall_score}/100 — <span className="text-gradient">{report.band}</span></h1>
            <p className="mt-1 text-sm text-slate-600">{report.band_meaning}</p>
            <p className="mt-2 text-xs text-slate-500">Duration {Math.round(report.duration_sec / 60)} min · {new Date(report.completed_at).toLocaleString()} · Engine: {report.model_versions.engine}</p>
            {report.low_confidence_warning && <div className="mt-2 chip bg-amber-100 text-amber-800 border-amber-200">⚠ Some evaluations had low confidence — treat scores as indicative</div>}
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-500">Overall readiness</div>
            <div className="mt-1 h-2 w-48 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full calibiai-gradient" style={{ width: `${report.overall_score}%` }} />
            </div>
            <div className="mt-3 flex gap-2 justify-end">
              <Link href={`/interviews/${report.session_id}`} className="btn-soft !py-1.5 !px-3 !text-xs">View transcript →</Link>
              <Link href="/interviews" className="btn-soft !py-1.5 !px-3 !text-xs">All attempts</Link>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-indigo-50/70 p-4 text-sm text-slate-700">{report.ai_summary}</div>

        {/* Competencies radar as bars */}
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {report.competencies?.map((c: any) => (
            <div key={c.key} className="panel p-3">
              <div className="flex justify-between text-xs"><span className="font-bold text-slate-700">{c.label}</span><span className="font-mono">{c.avg_rubric}/5 · {c.score_100}/100 · {c.weight_pct}% weight</span></div>
              <div className="mt-1 h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full calibiai-gradient" style={{ width: `${c.score_100}%` }} /></div>
              <div className="mt-1 text-[11px] text-slate-500">{c.description} · {c.evaluated_count} answers evaluated</div>
            </div>
          ))}
        </div>
      </div>

      {/* Strengths & improvements with quotes */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="glass-card">
          <div className="text-sm font-bold text-emerald-700">Top 3 strengths (with evidence)</div>
          <div className="mt-3 space-y-3">
            {report.top_strengths?.map((s: any, i: number) => (
              <div key={i} className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
                <div className="text-xs font-bold text-emerald-800">{s.title}</div>
                {s.quote && <div className="mt-1 text-xs italic text-slate-600">“{s.quote}”</div>}
                <div className="mt-1 text-[10px] text-slate-400">{s.question_id}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="glass-card">
          <div className="text-sm font-bold text-amber-700">Top 3 improvements (with evidence)</div>
          <div className="mt-3 space-y-3">
            {report.top_improvements?.map((s: any, i: number) => (
              <div key={i} className="rounded-xl border border-amber-100 bg-amber-50/50 p-3">
                <div className="text-xs font-bold text-amber-800">{s.title}</div>
                {s.quote && <div className="mt-1 text-xs italic text-slate-600">“{s.quote}”</div>}
                <div className="mt-1 text-[10px] text-slate-400">{s.question_id}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Question-by-question */}
      <div className="glass-card">
        <div className="text-sm font-bold text-slate-700">Question-by-question review</div>
        <div className="mt-4 space-y-4">
          {report.question_reviews?.map((ev: any, idx: number) => (
            <div key={idx} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="text-xs font-bold text-slate-800">{idx + 1}. {ev.question_prompt?.slice(0, 120)}</div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${ev.low_confidence ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>conf {Math.round((ev.confidence || 0) * 100)}%</span>
                  <span className="chip text-[10px]">{ev.section}</span>
                  {ev.skipped && <span className="chip bg-rose-50 text-rose-700 border-rose-200 text-[10px]">Skipped (scores 1)</span>}
                  {ev.hints_used > 0 && <span className="chip bg-amber-50 text-amber-700 border-amber-200 text-[10px]">Hints {ev.hints_used} · penalty {ev.hint_penalty}</span>}
                </div>
              </div>
              <div className="mt-2 grid gap-2 md:grid-cols-2 text-xs">
                <div>
                  <div className="font-bold text-slate-600">Competency scores</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {Object.entries(ev.competency_scores || {}).map(([k, v]: any) => (
                      <span key={k} className="chip !text-[11px]">{k}: {v}/5</span>
                    ))}
                  </div>
                  <div className="mt-2">
                    <div className="font-bold text-slate-600">Key points</div>
                    <ul className="mt-1 list-disc ml-4 space-y-0.5">
                      {(ev.key_points || []).map((kp: any, i: number) => (
                        <li key={i} className={kp.status === 'covered' ? 'text-emerald-700' : kp.status === 'partially' ? 'text-amber-700' : 'text-rose-700'}>
                          {kp.status === 'covered' ? '✓' : kp.status === 'partially' ? '◐' : '✗'} {kp.point} {kp.evidence ? `— "${kp.evidence.slice(0, 80)}"` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div>
                  <div className="font-bold text-slate-600">Feedback</div>
                  {ev.strengths?.length > 0 && <div className="mt-1"><span className="font-semibold text-emerald-700">Strengths:</span> {ev.strengths.join(', ')}</div>}
                  {ev.gaps?.length > 0 && <div className="mt-1"><span className="font-semibold text-amber-700">Gaps:</span> {ev.gaps.join(', ')}</div>}
                  <div className="mt-2 text-slate-500"><span className="font-bold">Your answer:</span> “{ev.student_quote}”</div>
                  <div className="mt-1 text-slate-600"><span className="font-bold">Model answer:</span> {ev.model_answer}</div>
                  <div className="mt-1 text-slate-500 italic">{ev.model_answer_hint}</div>
                  {ev.code_review && (
                    <div className="mt-2 rounded-xl bg-slate-900 p-2.5 text-slate-100 text-[11px]">
                      <div>Tests: {ev.code_review.tests_passed}/{ev.code_review.tests_total}</div>
                      <div>Complexity: {ev.code_review.complexity_note}</div>
                      <div>Readability: {ev.code_review.readability_note}</div>
                    </div>
                  )}
                  <button onClick={() => handleFlag(ev.question_id)} className="mt-2 text-[11px] text-indigo-600 hover:underline">Flag as unfair →</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Learning plan */}
      <div className="glass-card">
        <div className="text-sm font-bold text-slate-700">Personalized 2-week learning plan</div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {report.learning_plan?.map((item: any, i: number) => (
            <div key={i} className="panel p-3">
              <div className="flex items-center gap-2"><span className="chip bg-indigo-50 text-indigo-700 border-indigo-200 text-[10px]">{item.day_range}</span><span className="text-xs font-bold">{item.focus_topic}</span></div>
              <div className="mt-1 text-[11px] text-slate-500">Why: {item.why}</div>
              <ul className="mt-1 list-disc ml-4 text-xs text-slate-600">{item.action_items?.map((a: string, j: number) => <li key={j}>{a}</li>)}</ul>
              <Link href={item.platform_link?.href || '/company-assessments'} className="mt-2 inline-block text-[11px] font-bold text-indigo-600 hover:underline">{item.platform_link?.label} →</Link>
            </div>
          ))}
        </div>
      </div>

      {/* Trend & cohort */}
      {trend && trend.length > 1 && (
        <div className="glass-card">
          <div className="text-sm font-bold text-slate-700">Your improvement across attempts</div>
          <div className="mt-3 flex items-end gap-2 h-32">
            {trend.map((t: any, i: number) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full rounded-t-xl calibiai-gradient" style={{ height: `${t.overall_score}%` }} />
                <div className="text-[10px] font-bold">{t.overall_score}</div>
                <div className="text-[9px] text-slate-400">#{t.attempt_number}</div>
              </div>
            ))}
          </div>
          {report.trend?.improvement_from_first != null && <div className="mt-2 text-xs text-slate-600">Improvement from first attempt: {report.trend.improvement_from_first > 0 ? '+' : ''}{report.trend.improvement_from_first} points</div>}
          <div className="mt-1 text-xs text-slate-500">Cohort average: {report.trend?.cohort_average} · Your percentile: ~{Math.round(report.trend?.cohort_percentile || 50)}th</div>
        </div>
      )}

      {/* Integrity */}
      {report.integrity_events?.length > 0 && (
        <div className="panel p-4 border-amber-200 bg-amber-50/40">
          <div className="text-xs font-bold text-amber-800">Integrity signals (information only, not auto-fail)</div>
          <ul className="mt-2 list-disc ml-4 text-[11px] text-amber-900/70">
            {report.integrity_events.map((e: any, i: number) => <li key={i}>{e.type}: {e.details} at {new Date(e.timestamp).toLocaleTimeString()}</li>)}
          </ul>
        </div>
      )}

      {/* Rating */}
      <div className="glass-card">
        <div className="text-sm font-bold text-slate-700">How useful was this mock interview?</div>
        <div className="mt-2 flex items-center gap-1">
          {[1, 2, 3, 4, 5].map(s => (
            <button key={s} onClick={() => handleRating(s)} className={`text-2xl ${s <= rating ? 'text-amber-400' : 'text-slate-200'}`}>★</button>
          ))}
          <span className="ml-2 text-xs text-slate-500">{submitting ? 'Saving…' : rating ? `${rating}/5` : 'Tap to rate'}</span>
        </div>
        <textarea value={feedbackText} onChange={e => setFeedbackText(e.target.value)} placeholder="What was helpful? What can be improved? (optional)" className="field mt-3 min-h-[60px]" />
      </div>
    </div>
  )
}
