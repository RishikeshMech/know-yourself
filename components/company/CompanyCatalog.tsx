'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Search, X } from 'lucide-react'
import { useStore } from '@/lib/store'
import { COMPANIES, COMPANY_ORDER, COMPANY_TAGS, PRIORITY_LABEL, TAG_BY_ID, byPlanOrder, companyMockFacts } from '@/lib/company/catalog'
import { companyApi } from '@/lib/company/client'
import type { AttemptSummary, Company, CompanyTagId, Priority } from '@/lib/company/types'
import { CompanyBadge } from './CompanyBadge'

type Filter = 'all' | CompanyTagId
type GroupBy = 'tag' | 'priority'

const PRIORITIES: Priority[] = [1, 2, 3]
const PRIORITY_SHORT: Record<Priority, string> = { 1: 'Highest', 2: 'High', 3: 'Medium' }
const PRIORITY_TONE: Record<Priority, string> = {
  1: 'border-violet-200 bg-violet-50 text-violet-800',
  2: 'border-blue-200 bg-blue-50 text-blue-800',
  3: 'border-emerald-200 bg-emerald-50 text-emerald-800',
}

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
    <Link
      href={href}
      className="group flex min-h-[190px] flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white/85 p-4 shadow-sm transition duration-200 hover:-translate-y-1 hover:border-indigo-200 hover:bg-white hover:shadow-[0_18px_45px_-24px_rgba(79,70,229,.38)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
    >
      <div className="flex items-start gap-3">
        <CompanyBadge company={company} size={48} />
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-black text-slate-900">{company.name}</span>
            <span className={`shrink-0 rounded-lg border px-1.5 py-0.5 text-[10px] font-black ${PRIORITY_TONE[company.priority]}`} title={PRIORITY_LABEL[company.priority]}>
              P{company.priority}
            </span>
          </div>
          <p className="mt-1 truncate text-[11px] font-medium text-slate-500" title={company.track}>{company.track}</p>
          <p className="mt-1 truncate text-[10px] font-semibold text-slate-400">{TAG_BY_ID[company.tag].label}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 text-[10px] font-semibold text-slate-500">
        <span className="rounded-full bg-slate-100 px-2.5 py-1">⏱ {facts.minutes} min</span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1">{facts.rounds} rounds</span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1">{facts.questions} questions</span>
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
        {done ? (
          <>
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${VERDICT_STYLE[attempt?.verdict || 'not-yet'] || VERDICT_STYLE['not-yet']}`}>
              {attempt?.score != null ? `${Math.round(Number(attempt.score))}/100` : 'Completed'}
            </span>
            <span className="text-xs font-bold text-indigo-600 transition group-hover:translate-x-0.5">View result →</span>
          </>
        ) : open ? (
          <>
            <span className="animate-pulse rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">In progress</span>
            <span className="text-xs font-bold text-amber-700 transition group-hover:translate-x-0.5">Resume →</span>
          </>
        ) : (
          <>
            <span className="text-[11px] font-semibold text-slate-400">1 attempt</span>
            <span className="text-xs font-bold text-indigo-600 transition group-hover:translate-x-0.5">Explore →</span>
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
  const [selectedPriorities, setSelectedPriorities] = useState<Priority[]>([1, 2, 3])
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

  const matching = useMemo(() => {
    const q = query.trim().toLowerCase()
    return COMPANIES.filter((c) =>
      (filter === 'all' || c.tag === filter) &&
      (!q || c.name.toLowerCase().includes(q) || c.track.toLowerCase().includes(q) || TAG_BY_ID[c.tag].label.toLowerCase().includes(q)),
    )
  }, [filter, query])

  const visible = useMemo(() => groupBy === 'priority'
    ? matching.filter((company) => selectedPriorities.includes(company.priority))
    : matching,
  [groupBy, matching, selectedPriorities])

  const groups = useMemo(() => {
    if (groupBy === 'priority') {
      return PRIORITIES.map((p) => ({
        key: `p${p}`,
        title: PRIORITY_LABEL[p],
        subtitle: p === 1 ? 'The highest-priority targets from the research plan.' : p === 2 ? 'High-priority product and engineering companies.' : 'Additional medium-priority companies to explore.',
        icon: p === 1 ? '🥇' : p === 2 ? '🥈' : '🥉',
        priority: p,
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

  const togglePriority = (priority: Priority) => {
    setSelectedPriorities((current) => current.includes(priority)
      ? current.filter((p) => p !== priority)
      : [...current, priority].sort((a, b) => a - b))
  }

  const all = Object.values(attempts)
  const completed = all.filter((a) => a.status !== 'in_progress').length
  const inProgress = all.filter((a) => isOpen(a)).length

  return (
    <section>
      {heading && (
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-1.5 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50/80 px-2.5 py-1 text-[10px] font-black uppercase tracking-[.12em] text-indigo-700">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" aria-hidden /> Career practice
            </div>
            <h2 className="text-xl font-black tracking-tight text-slate-900">Company Assessments</h2>
            <p className="mt-1 text-sm text-slate-500">
              {COMPANIES.length} company-specific, proctored mocks · one attempt each
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="chip border-emerald-200 bg-emerald-50/70 text-emerald-700">✓ {completed} completed</span>
            {inProgress > 0 && <span className="chip border-amber-200 bg-amber-50/70 text-amber-700">● {inProgress} in progress</span>}
            <span className="chip">{COMPANIES.length - completed - inProgress} not started</span>
          </div>
        </div>
      )}

      <div className="mt-5 rounded-3xl border border-slate-200/80 bg-white/80 p-3 shadow-[0_16px_42px_-30px_rgba(30,41,59,.38)] backdrop-blur sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search companies, tracks or categories…"
              aria-label="Search companies, tracks or categories"
              className="field !h-11 !rounded-2xl !border-slate-200 !bg-slate-50/70 !pl-10 !pr-10 !py-2.5 focus:!bg-white"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-2.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-slate-400 transition hover:bg-slate-200/70 hover:text-slate-700">
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
          </label>

          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden text-[11px] font-bold text-slate-400 sm:inline">Group by</span>
            <div role="group" aria-label="Group company assessments" className="inline-flex rounded-2xl border border-slate-200 bg-slate-100/80 p-1">
              {(['tag', 'priority'] as GroupBy[]).map((group) => (
                <button
                  key={group}
                  type="button"
                  onClick={() => setGroupBy(group)}
                  aria-pressed={groupBy === group}
                  className={`whitespace-nowrap rounded-xl px-3 py-2 text-xs font-extrabold transition sm:px-4 ${groupBy === group ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  {group === 'tag' ? 'Category' : 'Priority'}
                </button>
              ))}
            </div>
          </div>
          {!loaded && user?.id && <span className="text-[11px] text-slate-400">Loading attempts…</span>}
        </div>

        <div role="group" aria-label="Filter companies by category" className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={() => setFilter('all')}
            aria-pressed={filter === 'all'}
            className={`rounded-xl border px-3 py-2 text-xs font-extrabold transition ${filter === 'all' ? 'border-indigo-500 bg-indigo-600 text-white shadow-sm shadow-indigo-200' : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:bg-indigo-50/50'}`}
          >
            All categories <span className={filter === 'all' ? 'ml-1 text-indigo-100' : 'ml-1 text-slate-400'}>{COMPANIES.length}</span>
          </button>
          {COMPANY_TAGS.map((tag) => {
            const count = COMPANIES.filter((company) => company.tag === tag.id).length
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => setFilter(tag.id)}
                aria-pressed={filter === tag.id}
                className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${filter === tag.id ? 'border-indigo-500 bg-indigo-600 text-white shadow-sm shadow-indigo-200' : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:bg-indigo-50/50'}`}
              >
                <span aria-hidden>{tag.icon}</span> {tag.short} <span className={filter === tag.id ? 'ml-1 text-indigo-100' : 'ml-1 text-slate-400'}>{count}</span>
              </button>
            )
          })}
        </div>

        {groupBy === 'priority' && (
          <fieldset className="mt-3 rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50/90 to-white p-3 sm:p-4">
            <legend className="sr-only">Filter companies by priority</legend>
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-black text-slate-800">Priority checklist</p>
                <p className="mt-0.5 text-[11px] text-slate-500">Choose the tiers you want to see. You can select more than one.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {PRIORITIES.map((priority) => {
                  const checked = selectedPriorities.includes(priority)
                  const count = matching.filter((company) => company.priority === priority).length
                  return (
                    <label
                      key={priority}
                      className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 transition ${checked ? 'border-indigo-200 bg-white shadow-sm' : 'border-slate-200 bg-slate-100/60 hover:bg-white'}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePriority(priority)}
                        aria-label={`Show priority ${priority} companies`}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 accent-indigo-600 focus:ring-indigo-500"
                      />
                      <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-black ${PRIORITY_TONE[priority]}`}>P{priority}</span>
                      <span className="text-xs font-bold text-slate-700">{PRIORITY_SHORT[priority]}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{count}</span>
                    </label>
                  )
                })}
                {selectedPriorities.length < PRIORITIES.length && (
                  <button type="button" onClick={() => setSelectedPriorities(PRIORITIES)} className="rounded-xl px-2.5 py-2 text-[11px] font-bold text-indigo-600 transition hover:bg-indigo-50">
                    Select all
                  </button>
                )}
              </div>
            </div>
            <p className="mt-3 border-t border-slate-200/70 pt-2.5 text-[10px] font-semibold text-slate-400">
              {selectedPriorities.length} of {PRIORITIES.length} priorities selected · Showing {visible.length} {visible.length === 1 ? 'company' : 'companies'}
            </p>
          </fieldset>
        )}

        {groupBy !== 'priority' && (
          <p className="mt-3 border-t border-slate-100 pt-3 text-[11px] font-semibold text-slate-400">
            Showing {visible.length} of {COMPANIES.length} companies
          </p>
        )}
      </div>

      <div className="mt-6 space-y-8">
        {groups.map((group) => (
          <section key={group.key} aria-label={group.title}>
            <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-gradient-to-r from-white to-slate-50/80 px-3.5 py-3 shadow-sm sm:px-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white bg-white text-xl shadow-sm" aria-hidden>{group.icon}</span>
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-black text-slate-900">{group.title}</h3>
                  <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{group.subtitle}</p>
                </div>
              </div>
              <span className="shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-extrabold text-slate-600">
                {group.companies.length} {group.companies.length === 1 ? 'company' : 'companies'}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {group.companies.map((company) => <CompanyCard key={company.slug} company={company} attempt={attempts[company.slug]} />)}
            </div>
          </section>
        ))}
        {groups.length === 0 && (
          <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-white/60 px-5 py-12 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400">
              <Search className="h-5 w-5" aria-hidden />
            </div>
            <p className="mt-3 text-sm font-bold text-slate-700">
              {groupBy === 'priority' && selectedPriorities.length === 0 ? 'Select a priority to see companies' : 'No companies match these filters'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {groupBy === 'priority' && selectedPriorities.length === 0 ? 'Turn on P1, P2 or P3 above to continue.' : 'Try another search, category or priority.'}
            </p>
            {groupBy === 'priority' && selectedPriorities.length === 0 && (
              <button type="button" onClick={() => setSelectedPriorities(PRIORITIES)} className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-indigo-700">
                Show all priorities
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
