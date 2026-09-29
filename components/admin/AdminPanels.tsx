'use client'
/**
 * Admin console panels:
 *   - StudentAssessments: everything one student has taken (expanded row),
 *     with per-student downloads (full JSON record / CSV).
 *   - CompanyResultsPanel: company-wise and category-wise results across all
 *     students, with CSV downloads per company / category.
 *   - AiEnginePanel: is the LLM (DeepSeek) configured and reachable?
 */
import { useCallback, useState } from 'react'
import { Bot, Building2, ChevronDown, ChevronUp, Download, RefreshCw } from 'lucide-react'
import type { AdminStudentRow } from '@/lib/csv'
import type { CompanyResultSummary } from '@/lib/adminAssessments'

const dash = (v: unknown) => (v === '' || v === null || v === undefined ? '—' : String(v))
const fmtDate = (iso?: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Download a server-generated file (keeps the admin session cookie). */
export async function downloadFrom(url: string, fallbackName: string, onUnauthorized?: () => void): Promise<void> {
  const res = await fetch(url)
  if (res.status === 401) {
    onUnauthorized?.()
    throw new Error('Session expired — please log in again.')
  }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Download failed.')
  const blob = await res.blob()
  const match = (res.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/)
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = match?.[1] || fallbackName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}

const KIND_CHIP: Record<string, string> = {
  core: 'bg-indigo-50 text-indigo-700',
  capgemini: 'bg-violet-50 text-violet-700',
  company: 'bg-sky-50 text-sky-700',
}

/* ------------------------------------------------------------------ */
/* Expanded row: every assessment the student has taken                */
/* ------------------------------------------------------------------ */

export function StudentAssessments({ row, onUnauthorized }: { row: AdminStudentRow; onUnauthorized?: () => void }) {
  const [busy, setBusy] = useState<'' | 'json' | 'csv'>('')
  const [err, setErr] = useState('')
  const entries = row.assessments || []
  const attempts = row.company_attempts || []
  const inProgress = attempts.filter((a) => a.status === 'in_progress')
  const byCompany = new Map(attempts.map((a) => [a.company, a]))
  const cats = [
    ['Platform assessments', row.cat_platform], ['IT Services', row.cat_it_services], ['Big Tech', row.cat_big_tech],
    ['Startups', row.cat_product_startups], ['SaaS', row.cat_saas], ['BFSI', row.cat_bfsi], ['Engineering', row.cat_engineering],
  ].filter(([, v]) => v !== '')

  const dl = async (format: 'json' | 'csv') => {
    setBusy(format)
    setErr('')
    try {
      await downloadFrom(`/api/admin/student?id=${encodeURIComponent(row.student_id)}&format=${format}`, `student.${format}`, onUnauthorized)
    } catch (e: any) {
      setErr(e?.message || 'Download failed.')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="mt-5 space-y-3" data-testid="admin-student-assessments">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-xs font-black uppercase tracking-wide text-slate-400">Assessments taken</div>
          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
            CalibiAI Score {row.calibi_score === '' ? '—' : `${row.calibi_score}/1000`}{row.calibi_grade ? ` · ${row.calibi_grade}` : ''} · average of {row.assessments_taken || 0}
          </span>
          {inProgress.length > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">{inProgress.length} in progress</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => dl('json')} disabled={!!busy} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:border-slate-300 disabled:opacity-50">
            <Download className="mr-1 inline h-3 w-3" /> {busy === 'json' ? 'Preparing…' : 'Full record (JSON)'}
          </button>
          <button onClick={() => dl('csv')} disabled={!!busy} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:border-slate-300 disabled:opacity-50">
            <Download className="mr-1 inline h-3 w-3" /> {busy === 'csv' ? 'Preparing…' : 'Profile + scores (CSV)'}
          </button>
        </div>
      </div>
      {err && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">{err}</div>}

      {cats.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {cats.map(([label, v]) => (
            <span key={label} className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600">{label}: <b className="text-slate-800">{v}%</b></span>
          ))}
        </div>
      )}

      {entries.length === 0 && inProgress.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-3 text-xs font-semibold text-slate-400">No assessment completed yet.</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-100">
          <table className="w-full min-w-[760px] text-[11px]">
            <thead>
              <tr className="bg-slate-50/80 text-[9px] uppercase tracking-wider text-slate-400">
                <th className="px-3 py-2 text-left font-black">Assessment</th>
                <th className="px-3 py-2 text-left font-black">Category</th>
                <th className="px-3 py-2 text-center font-black">Score</th>
                <th className="px-3 py-2 text-center font-black">/1000</th>
                <th className="px-3 py-2 text-left font-black">Result</th>
                <th className="px-3 py-2 text-left font-black">Rounds</th>
                <th className="px-3 py-2 text-center font-black">Integrity</th>
                <th className="px-3 py-2 text-center font-black">Date</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const a = e.company ? byCompany.get(e.company) : undefined
                return (
                  <tr key={e.key} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-bold text-slate-800">{e.label}</td>
                    <td className="px-3 py-2"><span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold ${KIND_CHIP[e.kind] || ''}`}>{e.category}</span></td>
                    <td className="px-3 py-2 text-center font-mono">{Math.round(e.score * 10) / 10}/{e.max}</td>
                    <td className="px-3 py-2 text-center font-mono font-black text-slate-900">{e.scaled}</td>
                    <td className="px-3 py-2 text-slate-600">{dash(e.outcome)}</td>
                    <td className="px-3 py-2 text-slate-500">
                      {a?.rounds?.length
                        ? a.rounds.map((r) => `${r.label} ${r.percent === null ? '—' : `${r.percent}%`}${r.cleared === false ? ' ✗' : ''}`).join(' · ')
                        : e.kind === 'capgemini' && row.a2_english !== ''
                          ? `English ${row.a2_english}/200 · Technical ${dash(row.a2_technical)}/250 · Debugging ${dash(row.a2_debugging)}/200 · AI coding ${dash(row.a2_ai_coding)}/200 · Cognitive ${dash(row.a2_cognitive)}/150`
                          : '—'}
                    </td>
                    <td className="px-3 py-2 text-center text-slate-500">
                      {a ? `${a.strikes ?? 0} strike${a.strikes === 1 ? '' : 's'} · cam ${a.camera === null ? '—' : a.camera ? 'on' : 'off'}${a.auto_submitted ? ' · auto-submitted' : ''}` : '—'}
                    </td>
                    <td className="px-3 py-2 text-center text-slate-500">{fmtDate(e.at)}</td>
                  </tr>
                )
              })}
              {inProgress.map((a) => (
                <tr key={`ip-${a.company}`} className="border-t border-slate-100 bg-amber-50/40">
                  <td className="px-3 py-2 font-bold text-slate-800">{a.name}</td>
                  <td className="px-3 py-2"><span className="inline-block whitespace-nowrap rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700">{a.category}</span></td>
                  <td className="px-3 py-2 text-center text-amber-700" colSpan={3}>In progress — not counted in the CalibiAI Score yet</td>
                  <td className="px-3 py-2 text-slate-400">—</td>
                  <td className="px-3 py-2 text-center text-slate-500">{a.strikes ?? 0} strikes</td>
                  <td className="px-3 py-2 text-center text-slate-500">{fmtDate(a.started_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Company-wise results across all students                             */
/* ------------------------------------------------------------------ */

interface CompanyResultsPayload {
  warning: string | null
  categories: Array<{ id: string; label: string; companies: number; attempts: number; completed: number; average: number | null }>
  companies: CompanyResultSummary[]
  attempts: number
}

export function CompanyResultsPanel({ onUnauthorized }: { onUnauthorized?: () => void }) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<CompanyResultsPayload | null>(null)
  const [tag, setTag] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [showAll, setShowAll] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setErr('')
    try {
      const res = await fetch('/api/admin/company-results')
      if (res.status === 401) { onUnauthorized?.(); return }
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not load company results.')
      setData(d)
    } catch (e: any) {
      setErr(e?.message || 'Could not load company results.')
    } finally {
      setLoading(false)
    }
  }, [onUnauthorized])

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next && !data) void load()
  }

  const dl = async (params: string, name: string) => {
    try {
      await downloadFrom(`/api/admin/company-results?format=csv${params}`, name, onUnauthorized)
    } catch (e: any) {
      setErr(e?.message || 'Download failed.')
    }
  }

  const list = (data?.companies || []).filter((c) => !tag || c.tag === tag)
  const visible = showAll ? list : list.filter((c) => c.attempts > 0)

  return (
    <section className="glass-card !p-0 animate-fade-up overflow-hidden" data-testid="admin-company-results">
      <button onClick={toggle} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left">
        <span className="flex items-center gap-2 text-sm font-black text-slate-800">
          <Building2 className="h-4 w-4 text-indigo-500" /> Company-wise results
          {data && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{data.attempts} attempts</span>}
        </span>
        {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>
      {open && (
        <div className="border-t border-slate-100 px-5 py-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setTag('')} className={`rounded-full px-3 py-1 text-[11px] font-bold ${tag === '' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>All categories</button>
            {(data?.categories || []).map((c) => (
              <button key={c.id} onClick={() => setTag(c.id)} className={`rounded-full px-3 py-1 text-[11px] font-bold ${tag === c.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>
                {c.label} · {c.completed} done{c.average !== null ? ` · avg ${c.average}` : ''}
              </button>
            ))}
            <label className="ml-auto flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
              <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="accent-indigo-600" /> Show companies with no attempts
            </label>
            <button onClick={load} disabled={loading} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-bold text-slate-600 disabled:opacity-50">
              <RefreshCw className={`mr-1 inline h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <button onClick={() => dl(tag ? `&tag=${encodeURIComponent(tag)}` : '', 'company_results.csv')} className="btn-primary !px-3 !py-1.5 !text-[11px]">
              <Download className="mr-1 inline h-3 w-3" /> Download {tag ? 'category' : 'all'} attempts (CSV)
            </button>
          </div>
          {err && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">{err}</div>}
          {data?.warning && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700">{data.warning}</div>}
          {loading && !data ? (
            <p className="text-xs text-slate-400">Loading…</p>
          ) : visible.length === 0 ? (
            <p className="text-xs text-slate-400">No company mock attempts {tag ? 'in this category ' : ''}yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-100">
              <table className="w-full min-w-[720px] text-[11px]">
                <thead>
                  <tr className="bg-slate-50/80 text-[9px] uppercase tracking-wider text-slate-400">
                    <th className="px-3 py-2 text-left font-black">Company</th>
                    <th className="px-3 py-2 text-left font-black">Category</th>
                    <th className="px-3 py-2 text-center font-black">Attempts</th>
                    <th className="px-3 py-2 text-center font-black">Completed</th>
                    <th className="px-3 py-2 text-center font-black">Average /100</th>
                    <th className="px-3 py-2 text-center font-black">Best</th>
                    <th className="px-3 py-2 text-center font-black">Interview-ready</th>
                    <th className="px-3 py-2 text-center font-black">Ready + almost</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((c) => (
                    <tr key={c.company} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-bold text-slate-800">{c.name}</td>
                      <td className="px-3 py-2 text-slate-500">{c.category}</td>
                      <td className="px-3 py-2 text-center font-mono">{c.attempts}</td>
                      <td className="px-3 py-2 text-center font-mono">{c.completed}{c.in_progress ? <span className="text-amber-600"> (+{c.in_progress})</span> : null}</td>
                      <td className="px-3 py-2 text-center font-mono font-black text-slate-900">{dash(c.average)}</td>
                      <td className="px-3 py-2 text-center font-mono">{dash(c.best)}</td>
                      <td className="px-3 py-2 text-center font-mono">{c.ready}</td>
                      <td className="px-3 py-2 text-center font-mono">{c.pass_rate === null ? '—' : `${c.pass_rate}%`}</td>
                      <td className="px-3 py-2 text-right">
                        {c.attempts > 0 && (
                          <button onClick={() => dl(`&company=${encodeURIComponent(c.company)}`, `${c.company}_results.csv`)} className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-600 hover:border-slate-300">
                            <Download className="mr-0.5 inline h-3 w-3" /> CSV
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* AI engine (LLM) status                                               */
/* ------------------------------------------------------------------ */

interface AiStatus {
  configured: boolean
  provider: string
  baseUrl: string
  model: string
  keySource: string | null
  keyHint: string
  telemetry: { ok: number; failed: number; lastOkAt: string | null; lastErrorAt: string | null; lastError: string | null; byLabel: Record<string, { ok: number; failed: number; lastOkAt: string | null; lastError: string | null }> }
  surfaces: Array<{ label: string; where: string }>
  test?: { ok: boolean; latencyMs: number; status?: number; model?: string; reply?: string; error?: string; hint?: string; at: string }
}

export function AiEnginePanel({ onUnauthorized }: { onUnauthorized?: () => void }) {
  const [open, setOpen] = useState(false)
  const [s, setS] = useState<AiStatus | null>(null)
  const [busy, setBusy] = useState<'' | 'load' | 'test'>('')
  const [err, setErr] = useState('')

  const call = useCallback(async (method: 'GET' | 'POST') => {
    setBusy(method === 'GET' ? 'load' : 'test')
    setErr('')
    try {
      const res = await fetch('/api/admin/ai-status', { method })
      if (res.status === 401) { onUnauthorized?.(); return }
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not load the AI status.')
      setS((prev) => ({ ...d, test: d.test || prev?.test }))
    } catch (e: any) {
      setErr(e?.message || 'Could not load the AI status.')
    } finally {
      setBusy('')
    }
  }, [onUnauthorized])

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next && !s) void call('GET')
  }

  return (
    <section className="glass-card !p-0 animate-fade-up overflow-hidden" data-testid="admin-ai-engine">
      <button onClick={toggle} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left">
        <span className="flex items-center gap-2 text-sm font-black text-slate-800">
          <Bot className="h-4 w-4 text-indigo-500" /> AI engine (LLM)
          {s && (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${s.configured ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
              {s.configured ? `${s.provider} · ${s.model}` : 'Not configured — rule-based graders in use'}
            </span>
          )}
        </span>
        {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>
      {open && (
        <div className="border-t border-slate-100 px-5 py-4 space-y-3 text-xs">
          {err && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 font-semibold text-rose-600">{err}</div>}
          {!s ? <p className="text-slate-400">Loading…</p> : (
            <>
              <div className="grid gap-2 sm:grid-cols-4">
                <div className="rounded-xl border border-slate-100 px-3 py-2"><div className="text-[10px] font-bold uppercase text-slate-400">Status</div><div className="font-black text-slate-800">{s.configured ? 'Configured' : 'No API key'}</div></div>
                <div className="rounded-xl border border-slate-100 px-3 py-2"><div className="text-[10px] font-bold uppercase text-slate-400">Endpoint</div><div className="font-mono text-slate-700 break-all">{s.baseUrl}</div></div>
                <div className="rounded-xl border border-slate-100 px-3 py-2"><div className="text-[10px] font-bold uppercase text-slate-400">Model</div><div className="font-mono text-slate-700">{s.model}</div></div>
                <div className="rounded-xl border border-slate-100 px-3 py-2"><div className="text-[10px] font-bold uppercase text-slate-400">Key</div><div className="font-mono text-slate-700">{s.keySource ? `${s.keySource} ${s.keyHint}` : '—'}</div></div>
              </div>
              <div className="rounded-xl border border-slate-100 px-3 py-2">
                <div className="font-bold text-slate-700">Model calls since the server started: <span className="text-emerald-700">{s.telemetry.ok} succeeded</span> · <span className={s.telemetry.failed ? 'text-rose-600' : 'text-slate-500'}>{s.telemetry.failed} fell back to the rule-based engine</span></div>
                {s.telemetry.lastError && <div className="mt-0.5 text-rose-600">Last failure: {s.telemetry.lastError} ({fmtDate(s.telemetry.lastErrorAt)})</div>}
                <ul className="mt-1.5 space-y-0.5 text-slate-500">
                  {s.surfaces.map((x) => {
                    const t = s.telemetry.byLabel[x.label]
                    return <li key={x.label}>• {x.where}: {t ? `${t.ok} ok / ${t.failed} failed` : 'no calls yet'}</li>
                  })}
                </ul>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button onClick={() => call('POST')} disabled={!!busy} className="btn-primary !px-4 !py-2 !text-xs disabled:opacity-50">
                  {busy === 'test' ? 'Testing…' : 'Test connection'}
                </button>
                <button onClick={() => call('GET')} disabled={!!busy} className="btn-soft !px-4 !py-2 !text-xs disabled:opacity-50">Refresh</button>
                {s.test && (
                  <span className={`rounded-xl px-3 py-2 font-semibold ${s.test.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>
                    {s.test.ok
                      ? `✓ Connected — ${s.test.model || s.model} replied in ${s.test.latencyMs} ms`
                      : `✗ ${s.test.status ? `HTTP ${s.test.status}: ` : ''}${s.test.error || 'failed'}${s.test.hint ? ` — ${s.test.hint}` : ''}`}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">Without a working key every AI surface falls back to CalibiAI’s rule-based graders, so assessments never break — but written answers, speaking and prompts are then scored heuristically.</p>
            </>
          )}
        </div>
      )}
    </section>
  )
}
