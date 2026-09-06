'use client'
import { useState } from 'react'
import { Navbar } from '@/components/Navbar'
import { useStore } from '@/lib/store'
import { isProfileComplete } from '@/lib/validate'
import { SAMPLE_PROFILE, SAMPLE_USER } from '@/lib/sample'
import {
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
} from 'recharts'

const SECTION_COLORS = ['#6366f1', '#6366f1', '#8b5cf6', '#8b5cf6', '#ec4899', '#10b981']

type Props = {
  scores: any
  /** Sample mode: use the bundled demo profile in the PDF and no localStorage reads. */
  sample?: boolean
}

export function ScoreReport({ scores, sample = false }: Props) {
  const { user, profile } = useStore()
  const [rendering, setRendering] = useState(false)
  // "Take the real assessment" must never bounce a signed-in user back to
  // /login — route them into the flow (or onboarding first).
  const startHref = sample ? (user ? (isProfileComplete(profile) ? '/instructions' : '/onboarding') : '/login') : '/dashboard/student'

  const downloadPDF = async () => {
    setRendering(true)
    try {
      const { generateReportPdf } = await import('@/lib/reportPdf')
      const profileData = sample ? SAMPLE_PROFILE : (profile || JSON.parse(localStorage.getItem('calibiai_profile') || '{}'))
      const userData = sample ? SAMPLE_USER : (user || JSON.parse(localStorage.getItem('calibiai_user') || '{}'))
      const doc = await generateReportPdf({ scores, profile: profileData, user: userData, sample })
      doc.save(`CalibiAI_Report_${scores?.session_id || 'scorecard'}.pdf`)
      if (!sample) localStorage.setItem('calibiai_report_ready', 'true')
    } catch (e) {
      console.warn('PDF generation failed:', e)
    } finally { setRendering(false) }
  }

  const sectionData = [
    { name: 'English', score: scores.english.total, max: 200 },
    { name: 'Problem', score: scores.problem_solving, max: 200 },
    { name: 'AI Debug', score: scores.ai_debugging, max: 150 },
    { name: 'AI Feature', score: scores.ai_feature, max: 150 },
    { name: 'Prompt', score: scores.prompt_engineering, max: 100 },
    { name: 'Cognitive', score: scores.cognitive.total, max: 200 },
  ].map(d => ({ ...d, pct: Math.round((d.score / d.max) * 100) }))

  const behavioral = Object.entries(scores.cognitive.behavioral as Record<string, number>).map(([k, v]) => ({ trait: scores.cognitive.traitLabels?.[k] || k.replace(/_/g, ' '), score: v }))
  const aiEntries = Object.entries(scores.ai_results || {}) as [string, any][]
  const aiLabel: Record<string, string> = {
    WRITING: 'Writing', SP_speaking: 'Speaking', AD1: 'Debugging — Pagination', AD2: 'Debugging — Race condition',
    AD3: 'Debugging — List mutation', AF1: 'Feature — Rate limiter', PE1: 'Prompt — Summary', PE2: 'Prompt — CSV dedup', PE3: 'Prompt — Email critique',
  }
  const gradeColor: Record<string, string> = { S: 'bg-emerald-500', A: 'bg-indigo-500', B: 'bg-violet-500', C: 'bg-amber-500', D: 'bg-rose-500' }

  return (
    <div>
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {sample && (
          <div className="animate-fade-up rounded-2xl border border-indigo-200 bg-indigo-50/80 px-4 py-3 text-sm text-indigo-700">
            <b>Sample report</b> — this is a preview of what your CalibiAI Score report looks like after completing the assessment.
          </div>
        )}
        {/* Hero */}
        <div className="glass-card animate-fade-up">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs font-bold tracking-widest text-indigo-600 uppercase">Your CalibiAI Score</div>
              <div className="mt-2 flex items-baseline gap-3 flex-wrap">
                <span className="text-6xl font-black text-gradient leading-none">{scores.total}</span>
                <span className="text-slate-400 text-2xl font-bold">/ 1000</span>
                <span className={`px-3 py-1 rounded-full text-white text-sm font-bold ${gradeColor[scores.grade]}`}>Grade {scores.grade}</span>
              </div>
              <div className="text-sm text-slate-500 mt-2">{scores.percentile}th percentile · {String(scores.verifiable_hash).slice(0, 24)}…</div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={downloadPDF} disabled={rendering} className="btn-primary disabled:opacity-50">{rendering ? 'Rendering…' : '⬇ Download PDF report'}</button>
              <a href={startHref} className="btn-soft">{sample ? 'Take the real assessment →' : 'My dashboard →'}</a>
            </div>
          </div>

          <div className="mt-7 h-64">
            <div className="text-sm font-bold text-slate-700 mb-2">Section performance (% of max)</div>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sectionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} interval={0} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
                <Tooltip cursor={{ fill: 'rgba(99,102,241,0.06)' }} contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, fontSize: 12, boxShadow: '0 8px 24px -8px rgba(0,0,0,.2)' }}
                  formatter={(v: any, _n: any, p: any) => [`${v}% (${p.payload.score}/${p.payload.max})`, 'Score']} />
                <Bar dataKey="pct" radius={[8, 8, 0, 0]} maxBarSize={56}>
                  {sectionData.map((_, i) => <Cell key={i} fill={SECTION_COLORS[i]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Radar */}
          <div className="glass-card animate-fade-up" style={{ animationDelay: '.05s' }}>
            <div className="text-sm font-bold text-slate-800">Behavioural profile</div>
            <div className="mt-2 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={behavioral} outerRadius="72%">
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis dataKey="trait" tick={{ fill: '#475569', fontSize: 10.5 }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={{ fill: '#cbd5e1', fontSize: 9 }} axisLine={false} />
                  <Radar name="Score" dataKey="score" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.35} />
                  <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, fontSize: 12 }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Accuracy */}
          <div className="glass-card animate-fade-up" style={{ animationDelay: '.1s' }}>
            <div className="text-sm font-bold text-slate-800">Objective accuracy</div>
            <div className="mt-4 space-y-3.5">
              {[
                ['Listening', scores.detail.listeningCorrect, scores.detail.listeningTotal],
                ['Reading', scores.detail.readingCorrect, scores.detail.readingTotal],
                ['Problem Solving', scores.detail.problemCorrect, scores.detail.problemTotal],
                ['Logical Reasoning', scores.detail.logicalCorrect, scores.detail.logicalTotal],
              ].map(([label, c, t]: any) => {
                const pct = Math.round((c / t) * 100)
                return (
                  <div key={label as string}>
                    <div className="flex justify-between text-xs mb-1"><span className="text-slate-600 font-medium">{label}</span><span className="font-mono text-slate-500">{c}/{t} · {pct}%</span></div>
                    <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full rounded-full ${pct >= 75 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-400' : 'bg-rose-400'}`} style={{ width: `${pct}%` }} /></div>
                  </div>
                )
              })}
              <div className="flex justify-between text-xs pt-3 border-t border-slate-100"><span className="text-slate-600 font-medium">Grid challenge (accuracy + speed)</span><span className="font-mono text-slate-500">{scores.cognitive.grid}/30</span></div>
              <div className="flex justify-between text-xs"><span className="text-slate-600 font-medium">Speaking tasks recorded</span><span className="font-mono text-slate-500">{scores.detail.speakingCount}/2</span></div>
            </div>

            <div className="text-sm font-bold text-slate-800 mt-6">English sub-skills</div>
            <div className="mt-2 grid grid-cols-4 gap-2 text-center">
              {[['Listening', scores.english.listening], ['Speaking', scores.english.speaking], ['Reading', scores.english.reading], ['Writing', scores.english.writing]].map(([l, v]: any) => (
                <div key={l as string} className="rounded-2xl bg-indigo-50/70 border border-indigo-100 p-3">
                  <div className="text-xl font-black text-indigo-600">{v}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{l}<br />/50</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* AI feedback */}
        {aiEntries.length > 0 && (
          <div className="glass-card animate-fade-up" style={{ animationDelay: '.15s' }}>
            <div className="text-sm font-bold text-slate-800">AI feedback & improvement areas
              <span className="ml-2 text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{aiEntries.some(([, r]) => r.engine === 'deepseek') ? 'DeepSeek' : 'rule engine'}</span>
            </div>
            <div className="mt-4 grid md:grid-cols-2 gap-3">
              {aiEntries.map(([key, r]) => (
                <div key={key} className="rounded-2xl panel p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-700">{aiLabel[key] || key}</span>
                    <span className="text-sm font-black text-emerald-600">{r.score}/100</span>
                  </div>
                  {r.summary && <p className="mt-1 text-xs text-slate-500 italic">{r.summary}</p>}
                  {r.improvements?.length > 0 && (
                    <ul className="mt-2 text-xs text-amber-700 list-disc ml-4 space-y-0.5">
                      {r.improvements.slice(0, 2).map((imp: string, i: number) => <li key={i}>{imp}</li>)}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

      </main>
    </div>
  )
}
