'use client'
/**
 * Admin dashboard — /admin
 * ------------------------
 * Admin logs in with the fixed credentials (username: `admin`, password:
 * `Admin@123`) via /api/admin/login (HttpOnly signed cookie). Once in, they
 * see every student (profile + latest assessment result + latest resume) and
 * can:
 *   • filter by college (dropdown) and search (name/email/PRN/mobile/college)
 *   • download the whole student dataset as CSV — every score, skill and
 *     personal field — or just the currently filtered view
 * The CSV is generated from the exact rows shown, and the same columns are
 * also served by GET /api/admin/export (full dataset) for big downloads.
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Download, Eye, EyeOff,
  GraduationCap, LogOut, RefreshCw, Search, ShieldCheck, Trophy, Users, X,
} from 'lucide-react'
import { Logo } from '@/components/Logo'
import type { AdminStudentRow } from '@/lib/csv'
import { downloadCsv, downloadFilename, rowsToCsv } from '@/lib/csv'

type AuthState = 'checking' | 'guest' | 'authed'
type SortKey = 'score' | 'name'
type DataSource = 'supabase' | 'local' | ''

/** How often the dashboard re-fetches from the server so it stays live.
 *  Override with NEXT_PUBLIC_ADMIN_REFRESH_MS (e.g. 5000 for 5s). */
const REFRESH_MS = Number(process.env.NEXT_PUBLIC_ADMIN_REFRESH_MS) || 15000

const n = (v: string) => (v === '' || v === null || v === undefined ? '—' : v)
const gradeChip = (g: string) => g === 'S' ? 'bg-emerald-100 text-emerald-700' : g === 'A' ? 'bg-indigo-100 text-indigo-700' : g === 'B' ? 'bg-violet-100 text-violet-700' : g === 'C' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'
const fmtDate = (iso: string) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

const fmtTime = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

/** Small live badge that pulses while an auto-refresh is active. */
function LiveBadge({ lastUpdated }: { lastUpdated: string | null }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-700">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
      Live
      {lastUpdated && <span className="hidden font-semibold text-emerald-600/80 md:inline">· {fmtTime(lastUpdated)}</span>}
    </span>
  )
}

/** True on localhost / 127.0.0.1 — used only to show the demo credential hint. */
function isLocalHost() {
  if (typeof window === 'undefined') return false
  const h = window.location.hostname
  return h === 'localhost' || h === '127.0.0.1'
}

function Spinner({ light = false }: { light?: boolean }) {
  return <span className={`h-4 w-4 animate-spin rounded-full border-2 ${light ? 'border-white/40 border-t-white' : 'border-slate-200 border-t-indigo-600'}`} />
}

// ===========================================================================
// Login screen
// ===========================================================================
function AdminLogin({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    if (!username.trim() || !password) {
      setErr('Please enter both username and password.')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Sign in failed.')
      onSuccess()
    } catch (e: any) {
      setErr(e?.message || 'Sign in failed.')
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm animate-fade-up">
        <div className="flex flex-col items-center gap-2">
          <Logo height={44} />
          <span className="font-display text-lg font-extrabold tracking-tight text-slate-900">
            CALIBIAI<span className="text-indigo-600"> SCORE</span>
          </span>
        </div>

        <div className="glass-card mt-6 !p-7 sm:!p-8">
          <div className="flex items-center justify-center gap-2 text-slate-900">
            <ShieldCheck className="h-5 w-5 text-indigo-600" />
            <h1 className="font-display text-xl font-extrabold tracking-tight">Admin dashboard</h1>
          </div>
          <p className="mt-1.5 text-center text-sm text-slate-500">
            Restricted access — administrators only
          </p>

          <form onSubmit={submit} className="mt-6 space-y-3.5">
            <div>
              <label htmlFor="adminUser" className="mb-1.5 block text-xs font-bold text-slate-700">Username</label>
              <input
                id="adminUser"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                autoComplete="username"
                autoCapitalize="none"
                className="field"
              />
            </div>
            <div>
              <label htmlFor="adminPass" className="mb-1.5 block text-xs font-bold text-slate-700">Password</label>
              <div className="relative">
                <input
                  id="adminPass"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="field pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-700"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {err && (
              <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-600">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{err}</span>
              </div>
            )}

            <button type="submit" disabled={busy} className="btn-primary w-full !py-3 disabled:opacity-60">
              {busy ? <span className="flex items-center justify-center gap-2"><Spinner light /> Signing in…</span> : 'Sign in to dashboard'}
            </button>
          </form>

          {isLocalHost() && (
            <p className="mt-4 rounded-xl bg-indigo-50 px-3.5 py-2.5 text-center text-[11px] leading-relaxed text-indigo-600">
              <b>Demo credentials</b> — username <code className="font-mono">admin</code> · password <code className="font-mono">Admin@123</code>
            </p>
          )}
        </div>

        <Link href="/" className="mt-5 block text-center text-xs font-semibold text-slate-400 transition hover:text-slate-600">
          ← Back to home
        </Link>
      </div>
    </div>
  )
}

// ===========================================================================
// Stat card
// ===========================================================================
function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="glass-card !p-4 hover-lift animate-fade-up">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
        <span className="text-indigo-600">{icon}</span>{label}
      </div>
      <div className="mt-1 text-2xl font-black text-slate-900">{value}</div>
      <div className="text-xs text-slate-400">{sub}</div>
    </div>
  )
}

// ===========================================================================
// Row details (expanded)
// ===========================================================================
function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl bg-slate-50/80 px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-0.5 text-xs font-semibold text-slate-700 break-words ${mono ? 'font-mono' : ''}`}>{n(value)}</div>
    </div>
  )
}

function ModuleBar({ label, value, max }: { label: string; value: string; max: number }) {
  const v = value === '' ? 0 : Number(value)
  const pct = Math.min(100, Math.round((v / max) * 100))
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="font-semibold text-slate-600">{label}</span>
        <span className="font-mono font-bold text-slate-700">{value === '' ? '—' : `${value}/${max}`}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full calibiai-gradient rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function ExpandedRow({ row }: { row: AdminStudentRow }) {
  const traits: [string, string][] = [
    ['Teamwork', row.teamwork], ['Accountability', row.accountability], ['Adaptability', row.adaptability],
    ['Responsible AI', row.responsible_ai], ['Decision Making', row.decision_making], ['Learning Mindset', row.learning_mindset],
  ]
  return (
    <tr className="border-t border-slate-100 bg-white/70">
      <td colSpan={12} className="px-5 py-4">
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-2">
            <div className="text-xs font-black uppercase tracking-wide text-slate-400">Personal & college</div>
            <div className="grid grid-cols-2 gap-2">
              <DetailRow label="Email" value={row.email} />
              <DetailRow label="Date of birth" value={row.dob} />
              <DetailRow label="Gender" value={row.gender} />
              <DetailRow label="Degree" value={row.degree} />
              <DetailRow label="Graduation year" value={row.graduation_year} />
              <DetailRow label="CGPA" value={row.cgpa} />
              <div className="col-span-2"><DetailRow label="LinkedIn" value={row.linkedin_url} /></div>
              <div className="col-span-2"><DetailRow label="GitHub" value={row.github_url} /></div>
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-xs font-black uppercase tracking-wide text-slate-400">Scores /1000</div>
            <div className="space-y-1.5">
              <ModuleBar label="English" value={row.english} max={200} />
              <ModuleBar label="Problem Solving" value={row.problem_solving} max={200} />
              <ModuleBar label="AI Debugging" value={row.ai_debugging} max={150} />
              <ModuleBar label="AI Feature Dev" value={row.ai_feature} max={150} />
              <ModuleBar label="Prompt Engineering" value={row.prompt_engineering} max={100} />
              <ModuleBar label="Cognitive" value={row.cognitive} max={200} />
            </div>
            {row.resume_score !== '' && (
              <div className="pt-1"><ModuleBar label="Resume score" value={row.resume_score} max={100} /></div>
            )}
          </div>
          <div className="space-y-2">
            <div className="text-xs font-black uppercase tracking-wide text-slate-400">Behavioural traits</div>
            <div className="grid grid-cols-2 gap-2">
              {traits.map(([label, v]) => (
                <div key={label} className="rounded-xl border border-slate-100 px-3 py-2">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
                  <div className="mt-0.5 text-sm font-black text-slate-800">{v === '' ? '—' : v}<span className="text-[10px] text-slate-400">/100</span></div>
                </div>
              ))}
            </div>
            {row.all_skills && (
              <div>
                <div className="text-xs font-black uppercase tracking-wide text-slate-400">Skills</div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {row.all_skills.split(',').map(s => s.trim()).filter(Boolean).map(s => (
                    <span key={s} className="chip !py-1">{s}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  )
}

// ===========================================================================
// Main dashboard (authed)
// ===========================================================================
function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [students, setStudents] = useState<AdminStudentRow[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [dataSource, setDataSource] = useState<DataSource>('')
  const [warning, setWarning] = useState('')
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)

  const [college, setCollege] = useState('all')
  const [q, setQ] = useState('')
  const [withScoreOnly, setWithScoreOnly] = useState(false)
  const [sortBy, setSortBy] = useState<SortKey>('score')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [exported, setExported] = useState(false)

  const load = useCallback(async () => {
    setRefreshing(true)
    setLoadError('')
    try {
      const res = await fetch('/api/admin/students')
      if (res.status === 401) {
        onLogout()
        return
      }
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load students.')
      setStudents(data.students || [])
      setDataSource((data.source as DataSource) || '')
      setWarning(data.warning || '')
      setLastUpdated(data.updated_at || new Date().toISOString())
    } catch (e: any) {
      setLoadError(e?.message || 'Failed to load students.')
    } finally {
      setRefreshing(false)
    }
  }, [onLogout])

  useEffect(() => {
    load()
  }, [load])

  // Keep the dashboard live: re-fetch on an interval while the tab is visible,
  // and immediately on tab focus. Pauses when the tab is hidden to save calls.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined
    const start = () => {
      if (timer) return
      timer = setInterval(() => {
        if (document.visibilityState === 'visible') load()
      }, REFRESH_MS)
    }
    const stop = () => {
      if (timer) {
        clearInterval(timer)
        timer = undefined
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        load()
        start()
      } else {
        stop()
      }
    }
    const onFocus = () => load()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onFocus)
    start()
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onFocus)
    }
  }, [load])

  const colleges = useMemo(() => {
    const set = new Set<string>()
    for (const s of students || []) if (s.college.trim()) set.add(s.college.trim())
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [students])

  const filtered = useMemo(() => {
    const hay = (s: AdminStudentRow) => [s.name, s.email, s.prn, s.phone, s.college].join(' ').toLowerCase()
    const needle = q.trim().toLowerCase()
    const list = (students || []).filter(s => {
      if (college !== 'all' && s.college.trim().toLowerCase() !== college.toLowerCase()) return false
      if (needle && !hay(s).includes(needle)) return false
      if (withScoreOnly && !s.has_assessment) return false
      return true
    })
    const dir = sortDir === 'desc' ? -1 : 1
    list.sort((a, b) => {
      if (sortBy === 'score') {
        const av = a.score === '' ? -1 : Number(a.score)
        const bv = b.score === '' ? -1 : Number(b.score)
        if (av !== bv) return (av - bv) * dir
      } else {
        const c = (a.name || '').localeCompare(b.name || '')
        if (c !== 0) return c * dir
      }
      return (a.college || '').localeCompare(b.college || '')
    })
    return list
  }, [students, college, q, withScoreOnly, sortBy, sortDir])

  const stats = useMemo(() => {
    const all = students || []
    const assessed = all.filter(s => s.has_assessment === 'Yes')
    const sum = assessed.reduce((acc, s) => acc + (Number(s.score) || 0), 0)
    return {
      total: all.length,
      colleges: new Set(all.map(s => s.college.trim()).filter(Boolean)).size,
      assessed: assessed.length,
      avg: assessed.length ? Math.round(sum / assessed.length) : 0,
      scored: all.filter(s => Number(s.score) >= 750).length,
    }
  }, [students])

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) setSortDir(d => (d === 'desc' ? 'asc' : 'desc'))
    else {
      setSortBy(key)
      setSortDir(key === 'name' ? 'asc' : 'desc')
    }
  }

  const handleExport = (scope: 'filtered' | 'all') => {
    const rows = scope === 'all' ? (students || []) : filtered
    if (!rows.length) return
    downloadCsv(rowsToCsv(rows), downloadFilename(scope === 'all' ? 'all' : 'filtered'))
    setExported(true)
    setTimeout(() => setExported(false), 2500)
  }

  const scoreSortIcon = (key: SortKey) => {
    if (sortBy !== key) return null
    return sortDir === 'desc' ? <ChevronDown className="inline h-3 w-3" /> : <ChevronUp className="inline h-3 w-3" />
  }

  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-white/50 bg-white/55 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo className="drop-shadow-lg" />
            <span className="text-lg font-extrabold tracking-tight text-slate-900">
              CALIBIAI<span className="text-indigo-600"> SCORE</span>
            </span>
            <span className="ml-1 rounded-full bg-indigo-600/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-indigo-600">Admin</span>
          </Link>
          <div className="flex items-center gap-2 text-sm">
            {students && <LiveBadge lastUpdated={lastUpdated} />}
            <button
              onClick={load}
              disabled={refreshing}
              className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-3.5 py-1.5 text-xs font-bold text-slate-600 transition hover:border-slate-300 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <button
              onClick={() => { fetch('/api/admin/logout', { method: 'POST' }).finally(onLogout) }}
              className="flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3.5 py-1.5 text-xs font-bold text-rose-600 transition hover:bg-rose-100"
            >
              <LogOut className="h-3.5 w-3.5" /> Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3 animate-fade-up">
          <div>
            <h1 className="text-2xl font-black text-slate-900">Admin dashboard</h1>
            <p className="mt-1 text-sm text-slate-500">Every student's profile, CalibiAI score, module scores and skills — filter by college and download as CSV.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <button onClick={() => handleExport('all')} className="btn-soft !px-4 !py-2 font-bold">
              <Download className="mr-1.5 inline h-3.5 w-3.5" /> Download all students CSV
            </button>
            <button onClick={() => handleExport('filtered')} disabled={!filtered.length} className="btn-primary !px-4 !py-2 disabled:opacity-50">
              <Download className="mr-1.5 inline h-3.5 w-3.5" /> Download CSV ({filtered.length})
            </button>
          </div>
        </div>

        {exported && (
          <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm font-semibold text-emerald-700 animate-fade-up">
            <CheckCircle2 className="h-4 w-4" /> CSV downloaded — open it in Excel / Google Sheets. It includes name, PRN, mobile number, college, skills, resume score and every CalibiAI module score.
          </div>
        )}

        {/* Data source / degraded-read banner */}
        {students && (warning || dataSource === 'local') && (
          <div
            className={`flex items-start gap-2 rounded-2xl border px-4 py-3 text-xs font-semibold animate-fade-up ${
              dataSource === 'local'
                ? 'border-amber-200 bg-amber-50/80 text-amber-700'
                : 'border-rose-200 bg-rose-50/80 text-rose-600'
            }`}
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {dataSource === 'local'
                ? 'Showing local demo data. Connect Supabase (set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY on the host) to pull every live student record.'
                : warning}
            </span>
          </div>
        )}

        {/* Stats */}
        {students && (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard icon={<Users className="h-4 w-4" />} label="Total students" value={String(stats.total)} sub="Across all colleges" />
            <StatCard icon={<GraduationCap className="h-4 w-4" />} label="Colleges" value={String(stats.colleges)} sub="Distinct institutions" />
            <StatCard icon={<ShieldCheck className="h-4 w-4" />} label="Assessed" value={String(stats.assessed)} sub="Have a CalibiAI score" />
            <StatCard icon={<Trophy className="h-4 w-4" />} label="Average score" value={stats.assessed ? String(stats.avg) : '—'} sub="Top 10%: 900+ · Ready: 750+" />
          </div>
        )}

        {/* Filters */}
        <div className="glass-card !p-4 animate-fade-up">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name, email, PRN, mobile, college…"
                className="field !rounded-full !py-2.5 pl-10 pr-9 w-full sm:w-80"
              />
              {q && (
                <button onClick={() => setQ('')} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-500" htmlFor="collegeFilter">College</label>
              <select
                id="collegeFilter"
                value={college}
                onChange={(e) => setCollege(e.target.value)}
                className="field !rounded-full !py-2.5 pr-8"
              >
                <option value="all">All colleges</option>
                {colleges.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
              <input
                type="checkbox"
                checked={withScoreOnly}
                onChange={(e) => setWithScoreOnly(e.target.checked)}
                className="h-4 w-4 rounded accent-indigo-600"
              />
              Assessed only
            </label>
            <div className="ml-auto text-xs font-semibold text-slate-500">
              Showing <span className="font-black text-slate-800">{students ? filtered.length : 0}</span> of {students ? students.length : 0} students
            </div>
          </div>
          {loadError && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-600">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {loadError}
              <button onClick={load} className="ml-auto font-black underline">Retry</button>
            </div>
          )}
        </div>

        {/* Table */}
        {!students ? (
          <div className="glass-card !p-10 text-center animate-fade-up">
            <RefreshCw className="mx-auto h-6 w-6 animate-spin text-indigo-500" />
            <p className="mt-3 text-sm font-bold text-slate-600">Loading students…</p>
          </div>
        ) : students.length === 0 ? (
          <div className="glass-card !p-10 text-center animate-fade-up">
            <div className="text-4xl">🗂️</div>
            <p className="mt-3 text-sm font-bold text-slate-700">No students found</p>
            <p className="mt-1 text-xs text-slate-500">Student profiles will appear here once candidates sign up and complete onboarding.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="glass-card !p-10 text-center animate-fade-up">
            <Search className="mx-auto h-6 w-6 text-slate-300" />
            <p className="mt-3 text-sm font-bold text-slate-600">No students match the current filters</p>
            <button onClick={() => { setCollege('all'); setQ(''); setWithScoreOnly(false) }} className="btn-soft mt-4 !py-2 text-xs font-bold">Clear filters</button>
          </div>
        ) : (
          <div className="glass-card !p-0 animate-fade-up overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-400">
                    <th className="px-4 py-3 text-left font-black">Student</th>
                    <th className="px-3 py-3 text-left font-black">PRN</th>
                    <th className="px-3 py-3 text-left font-black">Mobile</th>
                    <th className="px-3 py-3 text-left font-black">College</th>
                    <th className="px-3 py-3 text-left font-black">Degree</th>
                    <th className="px-3 py-3 text-left font-black">Skills</th>
                    <th className="px-3 py-3 text-center font-black">Resume</th>
                    <th className="px-3 py-3 text-center font-black">
                      <button onClick={() => toggleSort('score')} className="inline-flex items-center gap-0.5 hover:text-slate-700">
                        Score /1000 {scoreSortIcon('score')}
                      </button>
                    </th>
                    <th className="px-3 py-3 text-center font-black">Grade</th>
                    <th className="px-3 py-3 text-center font-black">%ile</th>
                    <th className="px-3 py-3 text-center font-black">Assessed</th>
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(s => {
                    const open = expandedId === s.student_id
                    const skillList = s.all_skills.split(',').map(x => x.trim()).filter(Boolean)
                    const shownSkills = skillList.slice(0, 3)
                    return (
                      <Fragment key={s.student_id}>
                        <tr
                          onClick={() => setExpandedId(open ? null : s.student_id)}
                          className="cursor-pointer border-t border-slate-100 transition hover:bg-indigo-50/40"
                        >
                          <td className="px-4 py-3">
                            <div className="font-bold text-slate-800">{n(s.name)}</div>
                            <div className="font-mono text-[10px] text-slate-400">{s.email}</div>
                          </td>
                          <td className="px-3 py-3 font-mono text-slate-600">{n(s.prn)}</td>
                          <td className="px-3 py-3 font-mono text-slate-600">{n(s.phone)}</td>
                          <td className="px-3 py-3 font-semibold text-slate-700">{n(s.college)}</td>
                          <td className="px-3 py-3 text-slate-500">
                            {n(s.degree)}{s.graduation_year ? ` · ${s.graduation_year}` : ''}
                          </td>
                          <td className="px-3 py-3">
                            {shownSkills.length ? (
                              <div className="flex flex-wrap gap-1">
                                {shownSkills.map(k => <span key={k} className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-600">{k}</span>)}
                                {skillList.length > 3 && <span className="px-1 text-[10px] font-bold text-slate-400">+{skillList.length - 3}</span>}
                              </div>
                            ) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-3 py-3 text-center font-mono font-bold text-slate-700">{n(s.resume_score)}</td>
                          <td className="px-3 py-3 text-center">
                            {s.has_assessment === 'Yes' ? (
                              <span className="font-mono text-sm font-black text-slate-900">{s.score}</span>
                            ) : <span className="text-slate-300">Not taken</span>}
                          </td>
                          <td className="px-3 py-3 text-center">
                            {s.grade ? <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${gradeChip(s.grade)}`}>{s.grade}</span> : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-3 py-3 text-center font-mono text-slate-600">{s.percentile === '' ? '—' : s.percentile}</td>
                          <td className="px-3 py-3 text-center text-slate-500">{fmtDate(s.assessed_at)}</td>
                          <td className="px-2 py-3 text-slate-400">
                            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </td>
                        </tr>
                        {open && <ExpandedRow row={s} />}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {students && students.length > 0 && (
          <p className="pb-4 text-center text-[11px] text-slate-400">
            Data includes personal information — handle responsibly. The CSV exports 48 columns: personal details, college, PRN, mobile, skills, resume and every CalibiAI module score.
          </p>
        )}
      </main>
    </div>
  )
}

// ===========================================================================
// Page
// ===========================================================================
export default function AdminPage() {
  const [auth, setAuth] = useState<AuthState>('checking')

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/session')
      .then(r => r.json())
      .then(d => { if (!cancelled) setAuth(d.authed ? 'authed' : 'guest') })
      .catch(() => { if (!cancelled) setAuth('guest') })
    return () => { cancelled = true }
  }, [])

  const handleLogout = useCallback(() => setAuth('guest'), [])

  if (auth === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="glass-card animate-fade-up flex items-center gap-3 px-6 py-4">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
          <span className="text-sm font-bold text-slate-700">Checking admin session…</span>
        </div>
      </div>
    )
  }
  return auth === 'authed'
    ? <AdminDashboard onLogout={handleLogout} />
    : <AdminLogin onSuccess={() => setAuth('authed')} />
}
