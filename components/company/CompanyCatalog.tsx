'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Search, X } from 'lucide-react'
import { useStore } from '@/lib/store'
import { COMPANIES, COMPANY_ORDER, COMPANY_TAGS, PRIORITY_LABEL, TAG_BY_ID, byPlanOrder, companyMockFacts } from '@/lib/company/catalog'
import { companyApi, getCompanyAttemptsCache, saveCompanyAttemptsCache } from '@/lib/company/client'
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
      className="group flex min-h-[190px] flex-col gap-4 rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white/85 dark:bg-slate-900/85 p-4 shadow-sm transition duration-200 hover:-translate-y-1 hover:border-indigo-200 dark:hover:border-indigo-500/50 hover:bg-white dark:hover:bg-slate-900 hover:shadow-[0_18px_45px_-24px_rgba(79,70,229,.38)] dark:hover:shadow-[0_18px_45px_-24px_rgba(79,70,229,.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
    >
      <div className="flex items-start gap-3">
        <CompanyBadge company={company} size={48} />
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-black text-slate-900 dark:text-white animate-text-reveal">{company.name}</span>
            <span className={`shrink-0 rounded-lg border px-1.5 py-0.5 text-[10px] font-black ${PRIORITY_TONE[company.priority]}`} title={PRIORITY_LABEL[company.priority]}>
              P{company.priority}
            </span>
          </div>
          <p className="mt-1 truncate text-[11px] font-medium text-slate-500 dark:text-slate-400" title={company.track}>{company.track}</p>
          <p className="mt-1 truncate text-[10px] font-semibold text-slate-400 dark:text-slate-500">{TAG_BY_ID[company.tag].label}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
        <span className="rounded-full bg-slate-100 dark:bg-white/8 text-slate-600 dark:text-slate-300 px-2.5 py-1">⏱ {facts.minutes} min</span>
        <span className="rounded-full bg-slate-100 dark:bg-white/8 text-slate-600 dark:text-slate-300 px-2.5 py-1">{facts.rounds} rounds</span>
        <span className="rounded-full bg-slate-100 dark:bg-white/8 text-slate-600 dark:text-slate-300 px-2.5 py-1">{facts.questions} questions</span>
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 dark:border-white/8 pt-3">
        {done ? (
          <>
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${VERDICT_STYLE[attempt?.verdict || 'not-yet'] || VERDICT_STYLE['not-yet']}`}>
              {attempt?.score != null ? `${Math.round(Number(attempt.score))}/100` : 'Completed'}
            </span>
            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 transition group-hover:translate-x-0.5">View report →</span>
          </>
        ) : open ? (
          <>
            <span className="animate-pulse rounded-full border border-amber-200 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/60 px-2.5 py-1 text-[11px] font-bold text-amber-700 dark:text-amber-400">In progress</span>
            <span className="text-xs font-bold text-amber-700 dark:text-amber-400 transition group-hover:translate-x-0.5">Resume →</span>
          </>
        ) : (
          <>
            <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500">1 attempt</span>
            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 transition group-hover:translate-x-0.5">Explore →</span>
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
  const [attempts, setAttempts] = useState<Record<string, AttemptSummary>>(() => {
    const cached = getCompanyAttemptsCache()
    return Object.fromEntries(cached.map((a) => [a.company, a]))
  })
  const [loaded, setLoaded] = useState(() => getCompanyAttemptsCache().length > 0)
  const lastFetch = useRef(0)
  const onAttemptsRef = useRef(onAttempts)
  onAttemptsRef.current = onAttempts

  // Pagination: initially 6 companies, +10 each time user clicks "View more"
  const [visibleLimit, setVisibleLimit] = useState(6)

  // Reset pagination when search query or filter changes
  useEffect(() => {
    setVisibleLimit(6)
  }, [query, filter, groupBy, selectedPriorities])

  const refresh = useCallback(async (force = false) => {
    if (!user?.id) return
    if (!force && Date.now() - lastFetch.current < 20_000) return
    lastFetch.current = Date.now()
    const res = await companyApi.list(user.id)
    if (res.ok && Array.isArray(res.data.attempts)) {
      setAttempts(Object.fromEntries(res.data.attempts.map((a) => [a.company, a])))
      saveCompanyAttemptsCache(res.data.attempts)
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

  useEffect(() => {
    const onAttemptUpdate = (e: any) => {
      const updated = e.detail as AttemptSummary
      if (!updated?.company) return
      setAttempts((prev) => ({ ...prev, [updated.company]: updated }))
    }
    window.addEventListener('calibiai_company_attempt_updated', onAttemptUpdate)
    return () => window.removeEventListener('calibiai_company_attempt_updated', onAttemptUpdate)
  }, [])

  // Search matches every company by name only
  const matching = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q) {
      // Search across every company by name only
      return COMPANIES.filter((c) => c.name.toLowerCase().includes(q))
    }
    return COMPANIES.filter((c) => filter === 'all' || c.tag === filter)
  }, [filter, query])

  const visible = useMemo(() => {
    if (query.trim()) {
      // When searching by name, show all matching companies
      return matching
    }
    return groupBy === 'priority'
      ? matching.filter((company) => selectedPriorities.includes(company.priority))
      : matching
  }, [groupBy, matching, query, selectedPriorities])

  const paged = useMemo(() => visible.slice(0, visibleLimit), [visible, visibleLimit])
  const hasMore = visibleLimit < visible.length
  const remainingCount = visible.length - visibleLimit
  const nextBatchCount = Math.min(10, remainingCount)

  const groups = useMemo(() => {
    if (groupBy === 'priority' && !query.trim()) {
      return PRIORITIES.map((p) => {
        const inPriority = paged.filter((c) => c.priority === p).sort((a, b) => COMPANY_ORDER[a.slug] - COMPANY_ORDER[b.slug])
        const allInPriority = visible.filter((c) => c.priority === p)
        return {
          key: `p${p}`,
          title: PRIORITY_LABEL[p],
          subtitle: p === 1 ? 'The highest-priority targets from the research plan.' : p === 2 ? 'High-priority product and engineering companies.' : 'Additional medium-priority companies to explore.',
          icon: p === 1 ? '🥇' : p === 2 ? '🥈' : '🥉',
          priority: p,
          totalCount: allInPriority.length,
          companies: inPriority,
        }
      }).filter((g) => g.companies.length)
    }

    return COMPANY_TAGS.map((t) => {
      const inTag = paged.filter((c) => c.tag === t.id).sort(byPlanOrder)
      const allInTag = visible.filter((c) => c.tag === t.id)
      return {
        key: t.id,
        title: t.label,
        subtitle: t.description,
        icon: t.icon,
        totalCount: allInTag.length,
        companies: inTag,
      }
    }).filter((g) => g.companies.length)
  }, [paged, visible, groupBy, query])

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

      <div className="mt-5 rounded-3xl border border-slate-200/80 dark:border-white/10 bg-white/80 dark:bg-slate-900/80 p-3 shadow-[0_16px_42px_-30px_rgba(30,41,59,.38)] dark:shadow-[0_16px_42px_-30px_rgba(0,0,0,.8)] backdrop-blur sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" aria-hidden />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search company by name (e.g. TCS, Google, Infosys)…"
              aria-label="Search company by name"
              className="field !h-11 !rounded-2xl !border-slate-200 dark:!border-white/10 !bg-slate-50/70 dark:!bg-slate-800/70 !pl-10 !pr-10 !py-2.5 focus:!bg-white dark:focus:!bg-slate-800 text-slate-800 dark:text-slate-100"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200 transition"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
          </label>

          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden text-[11px] font-bold text-slate-400 dark:text-slate-500 sm:inline">Group by</span>
            <div role="group" aria-label="Group company assessments" className="inline-flex rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-100/80 dark:bg-slate-800/80 p-1">
              {(['tag', 'priority'] as GroupBy[]).map((group) => (
                <button
                  key={group}
                  type="button"
                  onClick={() => setGroupBy(group)}
                  aria-pressed={groupBy === group}
                  className={`whitespace-nowrap rounded-xl px-3 py-2 text-xs font-extrabold transition sm:px-4 ${groupBy === group ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'}`}
                >
                  {group === 'tag' ? 'Category' : 'Priority'}
                </button>
              ))}
            </div>
          </div>
          {!loaded && user?.id && <span className="text-[11px] text-slate-400 dark:text-slate-500">Loading attempts…</span>}
        </div>

        <div role="group" aria-label="Filter companies by category" className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 dark:border-white/8 pt-3">
          <button
            type="button"
            onClick={() => { setFilter('all'); setQuery('') }}
            aria-pressed={filter === 'all' && !query}
            className={`rounded-xl border px-3 py-2 text-xs font-extrabold transition ${filter === 'all' && !query ? 'border-indigo-500 bg-indigo-600 text-white shadow-sm shadow-indigo-200 dark:shadow-indigo-900/50' : 'border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-indigo-200 dark:hover:border-indigo-500/40 hover:bg-indigo-50/50 dark:hover:bg-slate-700/80'}`}
          >
            All categories <span className={filter === 'all' && !query ? 'ml-1 text-indigo-100' : 'ml-1 text-slate-400 dark:text-slate-500'}>{COMPANIES.length}</span>
          </button>
          {COMPANY_TAGS.map((tag) => {
            const count = COMPANIES.filter((company) => company.tag === tag.id).length
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => { setFilter(tag.id); setQuery('') }}
                aria-pressed={filter === tag.id && !query}
                className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${filter === tag.id && !query ? 'border-indigo-500 bg-indigo-600 text-white shadow-sm shadow-indigo-200 dark:shadow-indigo-900/50' : 'border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-indigo-200 dark:hover:border-indigo-500/40 hover:bg-indigo-50/50 dark:hover:bg-slate-700/80'}`}
              >
                <span aria-hidden>{tag.icon}</span> {tag.short} <span className={filter === tag.id && !query ? 'ml-1 text-indigo-100' : 'ml-1 text-slate-400 dark:text-slate-500'}>{count}</span>
              </button>
            )
          })}
        </div>

        {groupBy === 'priority' && !query && (
          <fieldset className="mt-3 rounded-2xl border border-slate-200/80 dark:border-white/10 bg-gradient-to-br from-slate-50/90 to-white dark:from-slate-800/80 dark:to-slate-900/80 p-3 sm:p-4">
            <legend className="sr-only">Filter companies by priority</legend>
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-black text-slate-800 dark:text-slate-100">Priority checklist</p>
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">Choose the tiers you want to see. You can select more than one.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {PRIORITIES.map((priority) => {
                  const checked = selectedPriorities.includes(priority)
                  const count = matching.filter((company) => company.priority === priority).length
                  return (
                    <label
                      key={priority}
                      className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 transition ${checked ? 'border-indigo-200 dark:border-indigo-500/50 bg-white dark:bg-slate-800 shadow-sm' : 'border-slate-200 dark:border-white/10 bg-slate-100/60 dark:bg-slate-800/40 hover:bg-white dark:hover:bg-slate-800'}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePriority(priority)}
                        aria-label={`Show priority ${priority} companies`}
                        className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 accent-indigo-600 focus:ring-indigo-500"
                      />
                      <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-black ${PRIORITY_TONE[priority]}`}>P{priority}</span>
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{PRIORITY_SHORT[priority]}</span>
                      <span className="rounded-full bg-slate-100 dark:bg-white/10 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:text-slate-400">{count}</span>
                    </label>
                  )
                })}
                {selectedPriorities.length < PRIORITIES.length && (
                  <button type="button" onClick={() => setSelectedPriorities(PRIORITIES)} className="rounded-xl px-2.5 py-2 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 transition hover:bg-indigo-50 dark:hover:bg-indigo-950/50">
                    Select all
                  </button>
                )}
              </div>
            </div>
            <p className="mt-3 border-t border-slate-200/70 pt-2.5 text-[10px] font-semibold text-slate-400">
              {selectedPriorities.length} of {PRIORITIES.length} priorities selected · Showing {paged.length} of {visible.length} {visible.length === 1 ? 'company' : 'companies'}
            </p>
          </fieldset>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-[11px] font-semibold text-slate-500">
          <div>
            Showing <strong className="font-black text-slate-800">{paged.length}</strong> of{' '}
            <strong className="font-black text-slate-800">{visible.length}</strong>{' '}
            {query.trim() ? 'matching companies' : 'companies'}
            {visible.length < COMPANIES.length && !query.trim() && (
              <span className="text-slate-400"> (filtered from {COMPANIES.length} total)</span>
            )}
          </div>
          {visibleLimit > 6 && (
            <button
              type="button"
              onClick={() => setVisibleLimit(6)}
              className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 underline"
            >
              Reset to 6 companies
            </button>
          )}
        </div>
      </div>

      {query.trim() && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-indigo-100 bg-indigo-50/80 px-4 py-2.5 text-xs text-indigo-900">
          <div className="flex items-center gap-2 min-w-0">
            <Search className="h-4 w-4 text-indigo-600 shrink-0" aria-hidden />
            <span className="truncate">
              Searching every company by name: <strong className="font-black text-indigo-950">"{query.trim()}"</strong> —{' '}
              <span className="font-bold">{visible.length} {visible.length === 1 ? 'company' : 'companies'} found</span>
            </span>
          </div>
          <button
            type="button"
            onClick={() => setQuery('')}
            className="font-bold text-indigo-600 hover:text-indigo-800 underline shrink-0"
          >
            Clear search
          </button>
        </div>
      )}

      <div className="mt-6 space-y-8">
        {groups.map((group) => (
          <section key={group.key} aria-label={group.title}>
            <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-slate-200/80 dark:border-white/10 bg-gradient-to-r from-white to-slate-50/80 dark:from-slate-900/95 dark:to-slate-850 dark:to-slate-800/90 px-3.5 py-3 shadow-sm sm:px-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/80 dark:border-white/10 bg-white dark:bg-slate-800 text-xl shadow-sm" aria-hidden>{group.icon}</span>
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-black text-slate-900 dark:text-white animate-text-reveal">{group.title}</h3>
                  <p className="mt-0.5 text-[11px] leading-4 text-slate-500 dark:text-slate-400">{group.subtitle}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 px-2.5 py-1 text-[10px] font-extrabold text-slate-600 dark:text-slate-300">
                  {group.companies.length} of {group.totalCount} {group.totalCount === 1 ? 'company' : 'companies'}
                </span>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {group.companies.map((company) => <CompanyCard key={company.slug} company={company} attempt={attempts[company.slug]} />)}
            </div>
          </section>
        ))}

        {hasMore ? (
          <div className="mt-8 flex flex-col items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setVisibleLimit((prev) => prev + 10)}
              className="btn-primary inline-flex items-center gap-2 !px-8 !py-3.5 text-sm font-black shadow-lg shadow-indigo-200 transition hover:scale-[1.02] active:scale-[0.98]"
            >
              <span>View more ({nextBatchCount} more companies)</span>
              <span aria-hidden>↓</span>
            </button>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span>
                Showing {paged.length} of {visible.length} companies
              </span>
              {remainingCount > 10 && (
                <>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={() => setVisibleLimit(visible.length)}
                    className="font-bold text-indigo-600 hover:text-indigo-800 underline"
                  >
                    View all ({visible.length})
                  </button>
                </>
              )}
              {visibleLimit > 6 && (
                <>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={() => setVisibleLimit(6)}
                    className="font-bold text-slate-500 hover:text-slate-800 underline"
                  >
                    Show less
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          visible.length > 6 && (
            <div className="mt-8 flex items-center justify-center gap-3 text-xs text-slate-400 pt-2">
              <span>All {visible.length} companies shown</span>
              <span>·</span>
              <button
                type="button"
                onClick={() => setVisibleLimit(6)}
                className="font-bold text-slate-500 hover:text-indigo-600 underline"
              >
                Show less (collapse to 6)
              </button>
            </div>
          )
        )}

        {groups.length === 0 && (
          <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-white/60 px-5 py-12 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400">
              <Search className="h-5 w-5" aria-hidden />
            </div>
            <p className="mt-3 text-sm font-bold text-slate-700">
              {query.trim()
                ? `No company named "${query.trim()}" found`
                : groupBy === 'priority' && selectedPriorities.length === 0
                ? 'Select a priority to see companies'
                : 'No companies match these filters'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {query.trim()
                ? 'Check the company name spelling or try another search.'
                : groupBy === 'priority' && selectedPriorities.length === 0
                ? 'Turn on P1, P2 or P3 above to continue.'
                : 'Try another category or clear your search.'}
            </p>
            {query.trim() ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-indigo-700"
              >
                Clear search
              </button>
            ) : groupBy === 'priority' && selectedPriorities.length === 0 ? (
              <button
                type="button"
                onClick={() => setSelectedPriorities(PRIORITIES)}
                className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-indigo-700"
              >
                Show all priorities
              </button>
            ) : null}
          </div>
        )}
      </div>
    </section>
  )
}
