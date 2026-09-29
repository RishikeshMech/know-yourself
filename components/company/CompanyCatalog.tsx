'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { useStore } from '@/lib/store'
import { COMPANIES, COMPANY_ORDER, COMPANY_TAGS, PRIORITY_LABEL, TAG_BY_ID, byPlanOrder, companyMockFacts } from '@/lib/company/catalog'
import { companyApi } from '@/lib/company/client'
import type { AttemptSummary, Company, CompanyTagId, Priority } from '@/lib/company/types'
import { CompanyBadge } from './CompanyBadge'

type Filter = 'all' | CompanyTagId
type GroupBy = 'tag' | 'priority'

const VERDICT_STYLE: Record<string, string> = {
  ready: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  almost: 'text-indigo-700 bg-indigo-50 border-indigo-200',
  borderline: 'text-amber-700 bg-amber-50 border-amber-200',
  'not-yet': 'text-rose-700 bg-rose-50 border-rose-200',
}

function isOpen(a?: AttemptSummary) {
  return !!a && a.status === 'in_progress' && Date.parse(a.expires_at) > Date.now()
}

function CompanyCard({ company, attempt }: { company: Company; attempt?: AttemptSummary }) {
  const facts = companyMockFacts(company)
  const done = !!attempt && attempt.status !== 'in_progress'
  const open = isOpen(attempt)
  const href = done
    ? `/company-assessments/${company.slug}/result`
    : open ? `/company-assessments/${company.slug}/test` : `/company-assessments/${company.slug}`
  return (
    <Link href={href} className="group panel p-4 flex flex-col gap-3 hover-lift bg-white/70 hover:bg-white">
      <div className="flex items-start gap-3">
        <CompanyBadge company={company} size={42} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-black text-slate-900 truncate">{company.name}</span>
            <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-slate-900 text-white" title={PRIORITY_LABEL[company.priority]}>P{company.priority}</span>
          </div>
          <div className="text-[11px] text-slate-500 truncate" title={company.track}>{company.track}</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 text-[10px] font-semibold text-slate-500">
        <span className="px-2 py-0.5 rounded-full bg-slate-100">⏱ {facts.minutes} min</span>
        <span className="px-2 py-0.5 rounded-full bg-slate-100">{facts.rounds} rounds</span>
        <span className="px-2 py-0.5 rounded-full bg-slate-100">{facts.questions} questions</span>
      </div>
      <div className="mt-auto flex items-center justify-between gap-2">
        {done ? (
          <>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${VERDICT_STYLE[attempt?.verdict || 'not-yet'] || VERDICT_STYLE['not-yet']}`}>
              {attempt?.score != null ? `${Math.round(Number(attempt.score))}/100` : 'Completed'}
            </span>
            <span className="text-xs font-bold text-indigo-600 group-hover:translate-x-0.5 transition">View result →</span>
          </>
        ) : open ? (
          <>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border text-amber-700 bg-amber-50 border-amber-200 animate-pulse">In progress</span>
            <span className="text-xs font-bold text-amber-700">Resume →</span>
          </>
        ) : (
          <>
            <span className="text-[11px] font-semibold text-slate-400">1 attempt</span>
            <span className="text-xs font-bold text-indigo-600 group-hover:translate-x-0.5 transition">Start →</span>
          </>
        )}
      </div>
    </Link>
  )
}

export function CompanyCatalog({ heading = true, onAttempts }: {
  heading?: boolean
  /** Receives the student's attempt summaries after every refresh (used for the CalibiAI Score); null when loading failed. */
  onAttempts?: (attempts: AttemptSummary[] | null) => void
}) {
  const { user } = useStore()
  const [filter, setFilter] = useState<Filter>('all')
  const [groupBy, setGroupBy] = useState<GroupBy>('tag')
  const [query, setQuery] = useState('')
  const [attempts, setAttempts] = useState<Record<string, AttemptSummary>>({})
  const [loaded, setLoaded] = useState(false)
  const lastFetch = useRef(0)
  const onAttemptsRef = useRef(onAttempts)
  onAttemptsRef.current = onAttempts

  const refresh = useCallback(async (force = false) => {
    if (!user?.id) return
    if (!force && Date.now() - lastFetch.current < 30_000) return
    lastFetch.current = Date.now()
    const res = await companyApi.list(user.id)
    if (res.ok && Array.isArray(res.data.attempts)) {
      setAttempts(Object.fromEntries(res.data.attempts.map((a) => [a.company, a])))
      onAttemptsRef.current?.(res.data.attempts)
    } else {
      onAttemptsRef.current?.(null)
    }
    setLoaded(true)
  }, [user?.id])

  useEffect(() => { void refresh(true) }, [refresh])
  useEffect(() => {
    const onFocus = () => { void refresh() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return COMPANIES.filter((c) =>
      (filter === 'all' || c.tag === filter) &&
      (!q || c.name.toLowerCase().includes(q) || c.track.toLowerCase().includes(q) || TAG_BY_ID[c.tag].label.toLowerCase().includes(q)),
    )
  }, [filter, query])

  const groups = useMemo(() => {
    if (groupBy === 'priority') {
      return ([1, 2, 3] as Priority[]).map((p) => ({
        key: `p${p}`,
        title: PRIORITY_LABEL[p],
        subtitle: p === 1 ? 'Highest-priority targets from the research plan' : p === 2 ? 'High-priority product companies' : 'Medium-priority companies',
        icon: p === 1 ? '🥇' : p === 2 ? '🥈' : '🥉',
        companies: visible.filter((c) => c.priority === p).sort((a, b) => COMPANY_ORDER[a.slug] - COMPANY_ORDER[b.slug]),
      })).filter((g) => g.companies.length)
    }
    return COMPANY_TAGS.map((t) => ({
      key: t.id,
      title: t.label,
      subtitle: t.description,
      icon: t.icon,
      companies: visible.filter((c) => c.tag === t.id).sort(byPlanOrder),
    })).filter((g) => g.companies.length)
  }, [visible, groupBy])

  const all = Object.values(attempts)
  const completed = all.filter((a) => a.status !== 'in_progress').length
  const inProgress = all.filter((a) => isOpen(a)).length

  return (
    <section>
      {heading && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-slate-900">Company Assessments</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {COMPANIES.length} proctored mock assessments modelled on each company’s hiring steps · one attempt each
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="chip text-emerald-700 border-emerald-200 bg-emerald-50/70">✓ {completed} completed</span>
            {inProgress > 0 && <span className="chip text-amber-700 border-amber-200 bg-amber-50/70">● {inProgress} in progress</span>}
            <span className="chip">{COMPANIES.length - completed - inProgress} not started</span>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setFilter('all')} className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${filter === 'all' ? 'calibiai-gradient text-white border-transparent shadow' : 'bg-white/70 text-slate-600 border-slate-200 hover:bg-white'}`}>
            All <span className="opacity-70">{COMPANIES.length}</span>
          </button>
          {COMPANY_TAGS.map((t) => {
            const n = COMPANIES.filter((c) => c.tag === t.id).length
            return (
              <button key={t.id} onClick={() => setFilter(t.id)} className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${filter === t.id ? 'calibiai-gradient text-white border-transparent shadow' : 'bg-white/70 text-slate-600 border-slate-200 hover:bg-white'}`}>
                {t.icon} {t.short} <span className="opacity-70">{n}</span>
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" aria-hidden />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a company or track…" className="field !pl-9 !py-2" />
          </label>
          <div className="inline-flex rounded-full border border-slate-200 bg-white/70 p-0.5 text-xs font-bold">
            {(['tag', 'priority'] as GroupBy[]).map((g) => (
              <button key={g} onClick={() => setGroupBy(g)} className={`px-3 py-1.5 rounded-full ${groupBy === g ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-800'}`}>
                Group by {g === 'tag' ? 'category' : 'priority'}
              </button>
            ))}
          </div>
          {!loaded && user?.id && <span className="text-[11px] text-slate-400">Loading your attempts…</span>}
        </div>
      </div>

      <div className="mt-5 space-y-7">
        {groups.map((g) => (
          <div key={g.key}>
            <div className="flex items-baseline gap-2 flex-wrap">
              <h3 className="text-sm font-black text-slate-800">{g.icon} {g.title}</h3>
              <span className="text-[11px] font-bold text-slate-400">{g.companies.length}</span>
              <span className="text-[11px] text-slate-400">· {g.subtitle}</span>
            </div>
            <div className="mt-2.5 grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {g.companies.map((c) => <CompanyCard key={c.slug} company={c} attempt={attempts[c.slug]} />)}
            </div>
          </div>
        ))}
        {groups.length === 0 && (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">No company matches “{query}”.</div>
        )}
      </div>
    </section>
  )
}
